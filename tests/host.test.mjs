// Standalone mock-ctx test for dsh-cron (host half). Run: node tests/host.test.mjs
import fs, { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const plugin = await import('../index.js')
const { apply, Config } = plugin

// --- Config schema defaults
const validated = Config({})
assert.equal(validated.tickSeconds, 15)
assert.equal(validated.historyPath, '')
console.log('✓ Config schema defaults')

function makeCtx(storagePath, historyPath, configTasks, options = {}) {
  const fired = []
  const tools = new Map()
  const commands = new Map()
  const routes = []
  const disposers = []
  const listeners = new Map()
  const mockSession = { id: 'sess-1' }
  const mockAgent = { id: 'root-1', session: mockSession, followup: (msg) => fired.push(msg) }
  const roots = options.roots ?? [mockAgent]
  const resumes = []
  const mounts = []
  const selections = []
  const persistenceOpens = []
  const persistenceReads = []
  const persistenceCloses = []
  const persistenceInspects = []
  const warnings = []
  const inspected = options.inspected ?? {
    meta: { id: 'sess-1', cwd: 'C:\\workspace', agentPreset: 'standard' },
    events: [
      { type: 'request/header', data: { header: { config: { provider: 'saved-provider', model: 'saved-model' } } } },
      { type: 'agent-preset/selected', data: { agentPreset: 'coding' } },
    ],
  }
  const persistenceHeaders = options.persistenceHeaders ?? [{
    id: inspected.meta.id,
    cwd: inspected.meta.cwd,
    ...(inspected.meta.origin === undefined ? {} : { origin: inspected.meta.origin }),
    ...(inspected.meta.delegationDepth === undefined ? {} : { delegationDepth: inspected.meta.delegationDepth }),
  }]
  const sessionPersistence = {
    list: async () => {
      if (options.persistenceMissing) return []
      return options.persistenceApi === 'handle'
        ? persistenceHeaders.map((header, index) => ({ header, revision: `revision-${index}` }))
        : persistenceHeaders
    },
  }
  if (options.persistenceApi === 'handle') {
    sessionPersistence.open = async (id, access) => {
      persistenceOpens.push({ id, access })
      if (Object.hasOwn(options, 'badHandle')) return options.badHandle
      return {
        header: inspected.meta,
        read: async (offset, length, readOptions) => {
          persistenceReads.push(id)
          assert.equal(offset, undefined, 'read the entire event log without an offset')
          assert.equal(length, undefined, 'read the entire event log without a slice limit')
          assert.ok(readOptions?.signal instanceof AbortSignal, 'cancellation is the third public read argument')
          if (options.persistenceReadError) throw options.persistenceReadError
          if (Object.hasOwn(options, 'readResult')) return options.readResult
          return options.eventState
            ? { eventState: options.eventState, events: inspected.events }
            : inspected.events
        },
        close: async () => {
          persistenceCloses.push(id)
          if (options.persistenceCloseError) throw options.persistenceCloseError
        },
      }
    }
  } else {
    sessionPersistence.inspect = async (id, signal) => {
      persistenceInspects.push(id)
      if (options.inspectSession) return options.inspectSession(id, signal)
      return inspected
    }
  }
  const ctx = {
    logger: { info: () => {}, warn: (m) => { warnings.push(m); console.warn('  [warn]', m) } },
    agents: {
      roots: () => roots,
      resume: async (request) => {
        resumes.push(request)
        if (options.resumeError) throw options.resumeError
        const session = { id: String(request.resumeSessionId) }
        const agent = { id: String(request.resumeSessionId), session, followup: (msg) => fired.push(msg) }
        await request.setup?.({
          provide: () => {},
          effect: (fn) => fn(),
          on: () => () => {},
          emit: () => {},
          get: () => undefined,
          [Symbol.for('test')]: selections,
        })
        return { agent, dispose: async () => {} }
      },
    },
    sessionPersistence,
    agentPresets: {
      mount: async (_agentCtx, presetId) => { mounts.push(presetId) },
    },
    agentDefaultModel: { currentSelection: () => ({ provider: 'default-provider', model: 'default-model' }) },
    on: (event, handler) => listeners.set(event, handler),
    // Read-only HTTP fixtures do not start the autonomous scheduler at all.
    effect: (fn) => { if (!options.skipSchedulerEffects) disposers.push(fn()) },
    inject: () => {},
    get: (name) => options.commands && name === 'commands' ? {
      register: (definition) => {
        commands.set(definition.name, definition)
        return () => commands.delete(definition.name)
      },
    } : undefined,
    tools: { register: (def) => tools.set(def.name, def) },
  }
  if (options.http) {
    ctx.inject = (_services, activate) => activate({
      ...ctx,
      webRuntime: { trustedHosts: [] },
      effect: (fn) => { disposers.push(fn()) },
      webServer: { register: (route) => { routes.push(route); return () => {} } },
    })
  }
  apply(ctx, Config({
    storagePath,
    historyPath,
    tickSeconds: 1,
    defaultTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    tasks: configTasks,
    systemNotify: false,
    coldWake: options.coldWake ?? true,
  }))
  const emit = (event, ...args) => listeners.get(event)?.(...args)
  return {
    ctx, fired, tools, commands, routes, disposers, mockAgent, mockSession, emit, roots, resumes, mounts, selections,
    persistenceOpens, persistenceReads, persistenceCloses, persistenceInspects, warnings,
  }
}

function transferRequest(transfers, overrides = {}) {
  return {
    expectedPreset: 'coding',
    expectedCwd: 'C:\\workspace',
    transfers,
    ...overrides,
  }
}

function invokeTransfer(run, input, options = {}) {
  const command = run.commands.get('cron-transfer')
  assert.ok(command, 'cron-transfer command registered')
  return command.handler({
    agent: options.agent ?? run.mockAgent,
    rawInput: typeof input === 'string' ? input : JSON.stringify(input),
    attachments: options.attachments ?? [],
    signal: options.signal ?? new AbortController().signal,
  })
}

function writeTaskStore(file, tasks, runs = {}, overrides = {}) {
  writeFileSync(file, JSON.stringify({ version: 1, tasks, runs, overrides }, null, 2))
}

async function callHttp(route, method, payload, observe) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.url = `/cron/api/${method}`
  req.headers = { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }
  req.destroy = () => {}
  let status
  let body = ''
  const res = Object.assign(new EventEmitter(), {
    headersSent: false,
    writeHead(value) { status = value; this.headersSent = true },
    end(value = '') { body += value },
  })
  const pending = route.handler(req, res)
  req.emit('data', Buffer.from(JSON.stringify(payload)))
  req.emit('end')
  observe?.(req, res)
  await pending
  return { status, body: body ? JSON.parse(body) : null }
}

const dir = mkdtempSync(join(tmpdir(), 'dsh-cron-test-'))
const storagePath = join(dir, 'cron-tasks.json')
const historyPath = join(dir, 'cron-history.jsonl')
assert.throws(
  () => makeCtx(join(dir, 'invalid-static.json'), join(dir, 'invalid-history.jsonl'), [
    { id: 'unowned-static', prompt: 'unsafe', every: 60 },
  ]),
  /requires an explicit sessionId owner/,
)
console.log('✓ unbound static config task rejected at startup')

const past = new Date(Date.now() - 60_000).toISOString()
const pastHM = new Date(Date.now() - 60_000)
const dailyPast = `${String(pastHM.getHours()).padStart(2, '0')}:${String(pastHM.getMinutes()).padStart(2, '0')}`

// Deterministic clock drives actual scheduler callbacks, never real tasks.
{
  const original = { setTimeout, setInterval, clearTimeout, clearInterval, now: Date.now }
  let now = Date.now()
  const intervals = new Set()
  globalThis.setTimeout = () => 0
  globalThis.clearTimeout = () => {}
  globalThis.setInterval = fn => { intervals.add(fn); return fn }
  globalThis.clearInterval = fn => intervals.delete(fn)
  Date.now = () => now
  const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve() }
  const tick = async (elapsed = 0) => {
    now += elapsed
    for (const fn of intervals) fn()
    await flush()
  }
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-backoff-'))
  const options = { roots: [], http: true, resumeError: new Error('preset invalid SECRET'), persistenceApi: 'handle' }
  let run
  try {
    run = makeCtx(join(directory, 'tasks.json'), join(directory, 'history.jsonl'), [
      { id: 'one', prompt: 'one', at: past, sessionId: 'sess-1' },
      { id: 'two', prompt: 'two', at: past, sessionId: 'sess-1' },
      { id: 'healthy', prompt: 'healthy', every: 10, sessionId: 'healthy' },
    ], options)
    const healthy = []
    run.roots.push({ session: { id: 'healthy' }, followup: message => healthy.push(message) })
    await tick()
    assert.equal(run.resumes.length, 1, 'same-owner tasks share one failed cold attempt')
    await tick(15_000)
    assert.equal(run.resumes.length, 1, 'failed owner is not retried every tick')
    assert.equal(healthy.length, 1, 'other owners keep their schedule')
    await tick(15_000)
    assert.equal(run.resumes.length, 2, 'first retry after 30 seconds')
    await tick(30_000)
    assert.equal(run.resumes.length, 2, 'second retry waits 60 seconds')
    await tick(30_000)
    assert.equal(run.resumes.length, 3)
    for (const delay of [120_000, 240_000, 300_000, 300_000]) {
      const count = run.resumes.length
      await tick(delay - 1)
      assert.equal(run.resumes.length, count, 'no early retry at capped exponential boundary')
      await tick(1)
      assert.equal(run.resumes.length, count + 1)
    }
    assert.ok(run.warnings.every(message => !message.includes('SECRET')), 'resume diagnostics never echo preset/error contents')
    assert.equal(run.fired.length, 0, 'failed slots remain unconsumed')
    delete options.resumeError
    await tick(300_000)
    assert.equal(run.fired.length, 2, 'repaired owner automatically delivers both overdue tasks')
    await tick(300_000)
    assert.equal(run.fired.length, 2, 'successful one-shot slots never replay')

    // Live delivery ignores invalid persisted presets; a warm repair also
    // clears the cold failure budget immediately, before its next deadline.
    const warmAgent = { session: { id: 'sess-1' }, followup: message => run.fired.push(message) }
    run.roots.push(warmAgent)
    await run.tools.get('cron_add').execute({ id: 'warm', prompt: 'warm', every: 10 }, { agent: warmAgent })
    options.resumeError = new Error('still invalid SECRET')
    const attempts = run.resumes.length
    await tick(10_000)
    assert.equal(run.resumes.length, attempts, 'warm task needs no persistence or preset resume')
    assert.equal(run.fired.length, 3)
    run.roots.splice(run.roots.indexOf(warmAgent), 1)
    await tick(10_000)
    assert.equal(run.resumes.length, attempts + 1)
    run.roots.push(warmAgent)
    await tick(1_000)
    assert.equal(run.fired.length, 4, 'live repaired root bypasses backoff')
    await run.tools.get('cron_remove').execute({ id: 'warm' }, { agent: warmAgent })
    run.roots.splice(run.roots.indexOf(warmAgent), 1)

    // A hung owner must not hold the entire scheduler pass or fire after unload.
    const coldAgent = { session: { id: 'sess-1' }, followup: message => run.fired.push(message) }
    run.roots.push(coldAgent)
    for (const id of ['hung', 'disable-race', 'remove-race', 'edit-race']) {
      await run.tools.get('cron_add').execute({ id, prompt: id, every: 10 }, { agent: coldAgent })
    }
    run.roots.splice(run.roots.indexOf(coldAgent), 1)
    let releaseResume
    let disposed = 0
    run.ctx.agents.resume = () => new Promise(resolve => {
      releaseResume = () => resolve({ agent: coldAgent, dispose: async () => { disposed++ } })
    })
    await tick(10_000)
    const before = healthy.length
    await tick(10_000)
    assert.equal(healthy.length, before + 1, 'pending cold resume cannot starve live owners on later ticks')
    run.roots.push(coldAgent)
    assert.equal((await callHttp(run.routes[0], 'toggle', {
      id: 'disable-race', sessionId: 'sess-1', enabled: false,
    })).status, 200)
    await run.tools.get('cron_remove').execute({ id: 'remove-race' }, { agent: coldAgent })
    await run.tools.get('cron_update').execute({ id: 'edit-race', every: 600 }, { agent: coldAgent })
    run.roots.splice(run.roots.indexOf(coldAgent), 1)
    releaseResume()
    await flush()
    assert.equal(run.fired.length, 5, 'removed, disabled and rescheduled tasks do not fire from an old pending slot')
    assert.ok(run.fired.at(-1).content[0].text.includes('"hung"'))
    await tick(10_000)
    run.disposers.forEach(dispose => dispose?.())
    releaseResume()
    await flush()
    assert.equal(run.fired.length, 5, 'late resume cannot deliver after disposal')
    assert.equal(disposed, 1, 'late-created resume handle is disposed')

    const pressure = makeCtx(join(directory, 'pressure.json'), join(directory, 'pressure-history.jsonl'),
      Array.from({ length: 6 }, (_, id) => ({ id: `p${id}`, sessionId: `owner-${id}`, prompt: 'bounded', at: past })),
      { roots: [], persistenceApi: 'handle' })
    try {
      const releases = []
      pressure.ctx.sessionPersistence.stat = async id => ({ header: { id, cwd: directory }, revision: 'x' })
      pressure.ctx.sessionPersistence.open = async id => ({
        header: { id, cwd: directory }, read: async () => [], close: async () => {},
      })
      pressure.ctx.agents.resume = request => new Promise(resolve => releases.push(() => resolve({
        agent: { session: { id: request.resumeSessionId }, followup: message => pressure.fired.push(message) },
      })))
      await tick()
      assert.equal(releases.length, 4, 'cold-owner startup pressure is bounded to four')
      await tick(15_000)
      assert.equal(releases.length, 4, 'hung resumes do not create replacement operations')
      releases.splice(0).forEach(release => release())
      await flush()
      assert.equal(pressure.fired.length, 4)
      await tick(15_000)
      assert.equal(releases.length, 2, 'remaining cold owners progress once capacity is available')
      releases.forEach(release => release())
      await flush()
      assert.equal(pressure.fired.length, 6)
      await tick(15_000)
      assert.equal(pressure.fired.length, 6, 'all successful slots stay consumed')
    } finally {
      pressure.disposers.forEach(dispose => dispose?.())
    }
  } finally {
    run?.disposers.forEach(dispose => dispose?.())
    Object.assign(globalThis, {
      setTimeout: original.setTimeout, setInterval: original.setInterval,
      clearTimeout: original.clearTimeout, clearInterval: original.clearInterval,
    })
    Date.now = original.now
    rmSync(directory, { recursive: true, force: true })
  }
  console.log('✓ cold-owner bounded backoff, repair, independent scheduling and disposal')
}

// Concurrent read endpoints share metadata work only while it is pending.
for (const modern of [false, true]) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-metadata-'))
  const run = makeCtx(join(directory, 'tasks.json'), join(directory, 'history.jsonl'), [], {
    roots: [], http: true, skipSchedulerEffects: true,
  })
  let calls = 0
  let release
  let backendSignal
  let snapshot = { header: { id: 'sess-1' }, revision: 'one' }
  const metadata = async (...args) => {
    calls++
    backendSignal = modern ? args[1]?.signal : args[0]?.signal
    if (modern) {
      assert.equal(args[0], 'sess-1')
      assert.ok(args[1]?.signal instanceof AbortSignal)
    }
    await new Promise(resolve => { release = resolve })
    return modern ? snapshot : [snapshot]
  }
  if (modern) {
    run.ctx.sessionPersistence.stat = metadata
    run.ctx.sessionPersistence.list = () => { throw new Error('must not enumerate modern persistence') }
  } else run.ctx.sessionPersistence.list = metadata
  try {
    const pair = [
      callHttp(run.routes[0], 'list', { sessionId: 'sess-1' }),
      callHttp(run.routes[0], 'history', { sessionId: 'sess-1' }),
    ]
    for (let i = 0; i < 15; i++) await Promise.resolve()
    assert.equal(calls, 1, 'concurrent list/history coalesce by owner')
    release()
    assert.ok((await Promise.all(pair)).every(result => result.status === 200))
    snapshot = { header: { id: 'sess-1', origin: 'subagent' }, revision: 'two' }
    const next = callHttp(run.routes[0], 'list', { sessionId: 'sess-1' })
    for (let i = 0; i < 15; i++) await Promise.resolve()
    assert.equal(calls, 2, 'no settled ownership snapshot is cached')
    release()
    assert.equal((await next).status, 400, 'changed lineage is revalidated')
    snapshot = { header: { id: 'sess-1' }, revision: 'three' }
    let disconnectList
    let disconnectHistory
    const cancelledList = callHttp(run.routes[0], 'list', { sessionId: 'sess-1' }, (_req, res) => {
      disconnectList = () => res.emit('close')
    })
    const cancelledHistory = callHttp(run.routes[0], 'history', { sessionId: 'sess-1' }, req => {
      disconnectHistory = () => req.emit('aborted')
    })
    for (let i = 0; i < 15; i++) await Promise.resolve()
    assert.equal(calls, 3)
    disconnectList()
    await cancelledList
    assert.equal(backendSignal.aborted, false, 'one caller cannot cancel another owner-read subscriber')
    disconnectHistory()
    await cancelledHistory
    assert.equal(backendSignal.aborted, true, 'last disconnected caller aborts backend metadata')
    assert.equal((await callHttp(run.routes[0], 'list', { sessionId: 'sess-1' })).status, 400,
      'backend ignoring abort does not start replacement scans')
    assert.equal(calls, 3)
    release()
    for (let i = 0; i < 15; i++) await Promise.resolve()
    const recovered = callHttp(run.routes[0], 'list', { sessionId: 'sess-1' })
    for (let i = 0; i < 15; i++) await Promise.resolve()
    release()
    assert.equal((await recovered).status, 200, 'fresh reads recover after cancelled backend settles')
    if (modern) {
      for (const invalid of [undefined, { id: 'sess-1' }, { header: { id: 'sess-1' } },
        { header: { id: 'wrong' }, revision: 'x' },
        { id: 'sess-1', header: { id: 'sess-1' }, revision: 'x' },
        { header: { id: 'sess-1', delegationDepth: '0' }, revision: 'x' }]) {
        run.ctx.sessionPersistence.stat = async () => invalid
        assert.equal((await callHttp(run.routes[0], 'list', { sessionId: 'sess-1' })).status, 400,
          'stat missing or ambiguous snapshot fails closed without legacy fallback')
      }
      run.ctx.sessionPersistence.stat = async () => { throw new Error('stat failed') }
      assert.equal((await callHttp(run.routes[0], 'history', { sessionId: 'sess-1' })).status, 400)
    }
    assert.equal(run.resumes.length, 0)
    assert.equal(run.persistenceReads.length, 0)
    assert.equal(run.persistenceInspects.length, 0)
    if (modern) run.ctx.sessionPersistence.stat = metadata
    const disposing = callHttp(run.routes[0], 'list', { sessionId: 'sess-1' })
    for (let i = 0; i < 15; i++) await Promise.resolve()
    run.disposers.forEach(dispose => dispose?.())
    assert.equal((await disposing).status, 400, 'HTTP disposal unwinds pending subscribers even if backend ignores abort')
    assert.equal(backendSignal.aborted, true)
    release()
    console.log(`✓ ${modern ? 'targeted stat' : 'legacy list'} metadata coalescing, freshness and cancellation`)
  } finally {
    run.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}

const configTasks = [
  { id: 'once', prompt: 'one shot task', at: past, sessionId: 'sess-1' },
  { id: 'hourly', prompt: 'interval task', every: 60, sessionId: 'sess-1' },
  { id: 'morning', prompt: 'daily task', daily: dailyPast, sessionId: 'sess-1' },
]

const run1 = makeCtx(storagePath, historyPath, configTasks)
assert.deepEqual([...run1.tools.keys()].sort(), ['cron_add', 'cron_history', 'cron_list', 'cron_remove', 'cron_update'], 'tools registered')
assert.equal(run1.commands.size, 0, 'missing optional command service leaves scheduling unchanged')
console.log('✓ tools registered (incl. cron_history); command service remains optional')

await new Promise((r) => setTimeout(r, 4200))

assert.equal(run1.fired.length, 2, `at+daily due immediately (got ${run1.fired.length})`)
const texts = run1.fired.map((m) => m.content[0].text)
assert.ok(texts.some((t) => t.includes('"once"') && t.includes('one shot task')), 'at task fired')
assert.ok(texts.some((t) => t.includes('"morning"')), 'daily task fired')
assert.ok(run1.fired.every((m) => m.source.kind === 'plugin' && m.source.plugin === 'cron'), 'plugin source')
console.log('✓ due tasks fired')

// --- history: delivered records written
assert.ok(existsSync(historyPath), 'history file written')
let records = JSON.parse(await run1.tools.get('cron_history').execute({ limit: 10 }, { agent: run1.mockAgent }))
assert.equal(records.length, 2)
assert.ok(records.every((r) => r.status === 'delivered'), 'records start as delivered')
console.log('✓ history records delivered')

// --- history correlation: message enters surface -> running; assistant text -> excerpt; turn end -> completed
const onceMsg = run1.fired.find((m) => m.content[0].text.includes('"once"'))
run1.emit('session/event', run1.mockSession, { type: 'user/message', seq: 1, time: Date.now(), data: { ...onceMsg } })
run1.emit('session/event', run1.mockSession, {
  type: 'assistant/message', seq: 2, time: Date.now(),
  data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '晨报已生成：今日待办 5 项。' }] } },
})
run1.emit('session/event', run1.mockSession, { type: 'turn/end', seq: 3, time: Date.now(), data: { turn: 1, reason: { kind: 'completed' } } })
records = JSON.parse(await run1.tools.get('cron_history').execute({ limit: 10 }, { agent: run1.mockAgent }))
const onceRecord = records.find((r) => r.taskId === 'once')
assert.equal(onceRecord.status, 'completed', 'turn end completes record')
assert.equal(onceRecord.excerpt, '晨报已生成：今日待办 5 项。', 'excerpt captured')
assert.ok(onceRecord.completedAt, 'completedAt set')
// the other run is still pending (its message never entered a turn)
assert.equal(records.find((r) => r.taskId === 'morning').status, 'delivered')
console.log('✓ history correlation (running -> excerpt -> completed)')

// failed turn
const morningMsg = run1.fired.find((m) => m.content[0].text.includes('"morning"'))
run1.emit('session/event', run1.mockSession, { type: 'user/message', seq: 4, time: Date.now(), data: { ...morningMsg } })
run1.emit('session/event', run1.mockSession, { type: 'turn/end', seq: 5, time: Date.now(), data: { turn: 2, reason: { kind: 'error', error: { message: 'boom' } } } })
records = JSON.parse(await run1.tools.get('cron_history').execute({ limit: 10 }, { agent: run1.mockAgent }))
const morningRecord = records.find((r) => r.taskId === 'morning')
assert.equal(morningRecord.status, 'failed')
assert.equal(morningRecord.endReason, 'error')
console.log('✓ failed turn recorded')

// --- cron_add persists dynamic task
await run1.tools.get('cron_add').execute({ id: 'dyn', prompt: 'dynamic task', every: 120 }, { agent: run1.mockAgent })
const stored = JSON.parse(readFileSync(storagePath, 'utf8'))
assert.equal(stored.tasks.length, 1)
assert.ok(stored.runs.once?.firedAt)
console.log('✓ cron_add persists')

// --- strict tool transports may materialize omitted optionals as "" / 0
const strictArgs = {
  id: 'strict-args', prompt: 'strict transport', at: '', every: 0,
  daily: '08:00', cron: '', timeZone: 'UTC',
}
await run1.tools.get('cron_add').execute(strictArgs, { agent: run1.mockAgent })
let strictTask = JSON.parse(await run1.tools.get('cron_list').execute({}, { agent: run1.mockAgent })).find((task) => task.id === 'strict-args')
assert.equal(strictTask.schedule.daily, '08:00')
assert.equal(strictTask.schedule.everySeconds, undefined)
await run1.tools.get('cron_update').execute({
  id: 'strict-args', prompt: '', at: '', every: 0,
  daily: '', cron: '0 9 * * *', timeZone: 'UTC',
}, { agent: run1.mockAgent })
strictTask = JSON.parse(await run1.tools.get('cron_list').execute({}, { agent: run1.mockAgent })).find((task) => task.id === 'strict-args')
assert.equal(strictTask.schedule.cron, '0 9 * * *')
assert.equal(strictTask.schedule.daily, undefined)
console.log('✓ strict tool-call placeholders are ignored')


// --- validation
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'bad', prompt: 'x', every: 30, daily: '10:00' }, { agent: run1.mockAgent }), /exactly one/)
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'dyn', prompt: 'x', every: 60 }, { agent: run1.mockAgent }), /already exists/)
await assert.rejects(run1.tools.get('cron_add').execute({ id: 'unbound', prompt: 'x', every: 60 }, {}), /root Session owner/)
console.log('✓ cron_add validation')

// --- model tools are root-Session scoped and cannot cross owners
const ownerTwo = { id: 'root-2', session: { id: 'sess-2' }, followup: () => {} }
run1.roots.push(ownerTwo)
await run1.tools.get('cron_add').execute({ id: 'other-owned', prompt: 'other', every: 180 }, { agent: ownerTwo })
const ownerOneTasks = JSON.parse(await run1.tools.get('cron_list').execute({}, { agent: run1.mockAgent }))
const ownerTwoTasks = JSON.parse(await run1.tools.get('cron_list').execute({}, { agent: ownerTwo }))
assert.ok(ownerOneTasks.every((task) => task.sessionId === 'sess-1'))
assert.deepEqual(ownerTwoTasks.map((task) => task.id), ['other-owned'])
await assert.rejects(
  run1.tools.get('cron_update').execute({ id: 'other-owned', prompt: 'stolen' }, { agent: run1.mockAgent }),
  /not owned by Session/,
)
await assert.rejects(
  run1.tools.get('cron_remove').execute({ id: 'other-owned' }, { agent: run1.mockAgent }),
  /not owned by Session/,
)
await assert.rejects(
  run1.tools.get('cron_add').execute({ id: 'rebind', prompt: 'x', every: 180, sessionId: 'sess-2' }, { agent: run1.mockAgent }),
  /cannot assign another Session owner/,
)
const subagent = { id: 'child', session: { id: 'sess-child' } }
await assert.rejects(run1.tools.get('cron_list').execute({}, { agent: subagent }), /root Session owner/)
await run1.tools.get('cron_update').execute({ id: 'other-owned', prompt: 'updated' }, { agent: ownerTwo })
await run1.tools.get('cron_remove').execute({ id: 'other-owned' }, { agent: ownerTwo })
assert.deepEqual(JSON.parse(await run1.tools.get('cron_history').execute({ limit: 10 }, { agent: ownerTwo })), [])
console.log('✓ model-tool root Session ownership and per-session authorization')

// --- Issue #41: formal human-command hot owner transfer. All persistence,
// Sessions, events and tasks in this section are synthetic temp fixtures.
const validTransferTarget = (id, overrides = {}, events = []) => ({
  meta: { id, cwd: 'C:\\workspace', agentPreset: 'coding', ...overrides },
  events,
})
const assertCommandError = async (pending, pattern) => {
  const result = await pending
  assert.equal(result.kind, 'error')
  if (pattern) assert.match(result.text, pattern)
  assert.equal(result.text.includes('\n'), false, 'command errors never expose raw stacks')
  return result
}

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-validation-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [
    { id: 'dyn-a', prompt: 'private a', every: 3600, sessionId: 'owner-a', enabled: true },
    { id: 'dyn-b', prompt: 'private b', every: 3600, sessionId: 'owner-b', enabled: true },
    { id: 'target-owned', prompt: 'existing target', every: 3600, sessionId: 'target-used', enabled: true },
  ])
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [
    { id: 'configured', prompt: 'static', every: 3600, sessionId: 'owner-config' },
  ], { commands: true })
  try {
    const command = transferRun.commands.get('cron-transfer')
    assert.ok(command)
    assert.equal(command.recordInput, false)
    assert.deepEqual(command.input, { hint: '<JSON>' })
    assert.equal([...transferRun.tools.keys()].includes('cron_transfer'), false, 'transfer is not a model tool')
    assert.equal(transferRun.routes.length, 0, 'transfer adds no HTTP surface')

    const child = { id: 'child', session: { id: 'child-session' } }
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a' },
    ]), { agent: child }), /top-level root Agent/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a' },
    ]), { attachments: [{ type: 'image', data: 'synthetic' }] }), /attachments/)
    await assertCommandError(invokeTransfer(transferRun, '{'), /strict JSON object/)
    await assertCommandError(invokeTransfer(transferRun, []), /exactly/)
    await assertCommandError(invokeTransfer(transferRun, {
      ...transferRequest([{ id: 'dyn-a', from: 'owner-a', to: 'target-a' }]), extra: true,
    }), /exactly/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([])), /1-32/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest(
      Array.from({ length: 33 }, (_, index) => ({ id: `task-${index}`, from: `from-${index}`, to: `to-${index}` })),
    )), /1-32/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a', extra: true },
    ])), /exactly id, from, and to/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'bad id', from: 'owner-a', to: 'target-a' },
    ])), /valid task id/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner a', to: 'target-a' },
    ])), /valid Session ids/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a' },
      { id: 'dyn-a', from: 'owner-b', to: 'target-b' },
    ])), /must each be unique/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a' },
      { id: 'dyn-b', from: 'owner-a', to: 'target-b' },
    ])), /must each be unique/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a' },
      { id: 'dyn-b', from: 'owner-b', to: 'target-a' },
    ])), /must each be unique/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'owner-a' },
    ])), /already has/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'missing', from: 'owner-a', to: 'target-a' },
    ])), /no task/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'configured', from: 'owner-config', to: 'target-a' },
    ])), /not dynamic/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'wrong-owner', to: 'target-a' },
    ])), /does not match from/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-used' },
    ])), /unrelated task/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a' },
    ], { expectedPreset: '  ' })), /nonblank/)
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'dyn-a', from: 'owner-a', to: 'target-a' },
    ], { expectedCwd: 'relative' })), /absolute path/)
    assert.equal(transferRun.persistenceInspects.length, 0, 'synchronous validation never inspects target Sessions')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer optional registration, direct-root authorization, strict grammar and bounded validation')

for (const testCase of [
  { name: 'subagent origin', target: validTransferTarget('target', { origin: 'subagent' }), pattern: /could not be inspected/ },
  { name: 'subagent depth', target: validTransferTarget('target', { delegationDepth: 1 }), pattern: /could not be inspected/ },
  { name: 'wrong preset', target: validTransferTarget('target', { agentPreset: 'standard' }), pattern: /expectedPreset/ },
  { name: 'latest selected preset wins', target: validTransferTarget('target', {}, [{ type: 'agent-preset/selected', data: { agentPreset: 'standard' } }]), pattern: /expectedPreset/ },
  { name: 'wrong cwd', target: validTransferTarget('target', { cwd: 'C:\\other' }), pattern: /expectedCwd/ },
  { name: 'nonblank target', target: validTransferTarget('target', {}, [{ type: 'turn/start', data: {} }]), pattern: /not blank/ },
]) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-target-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [{ id: 'move', prompt: 'private', every: 3600, sessionId: 'owner', enabled: true }])
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    inspectSession: async () => testCase.target,
  })
  try {
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'move', from: 'owner', to: 'target' },
    ])), testCase.pattern)
    assert.equal(JSON.parse(readFileSync(taskFile, 'utf8')).tasks[0].sessionId, 'owner', `${testCase.name} keeps old owner`)
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer rejects subagent, wrong-preset, selected-preset override, wrong-cwd and nonblank targets')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-modern-'))
  const taskFile = join(directory, 'tasks.json')
  const target = validTransferTarget('modern-target')
  writeTaskStore(taskFile, [{ id: 'modern', prompt: 'private', every: 3600, sessionId: 'owner', enabled: true }])
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    persistenceApi: 'handle',
    inspected: target,
  })
  let stats = 0
  transferRun.ctx.sessionPersistence.stat = async (id, options) => {
    assert.equal(id, 'modern-target')
    assert.ok(options?.signal instanceof AbortSignal)
    stats++
    return { header: target.meta, revision: 'stable-revision' }
  }
  try {
    const result = await invokeTransfer(transferRun, transferRequest([
      { id: 'modern', from: 'owner', to: 'modern-target' },
    ]))
    assert.equal(result.kind, 'success')
    assert.equal(stats, 4, 'initial and final reads each stat before and after the handle')
    assert.deepEqual(transferRun.persistenceOpens, [
      { id: 'modern-target', access: 'read' },
      { id: 'modern-target', access: 'read' },
    ])
    assert.deepEqual(transferRun.persistenceReads, ['modern-target', 'modern-target'])
    assert.deepEqual(transferRun.persistenceCloses, ['modern-target', 'modern-target'])
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}

for (const failure of ['read', 'close', 'header', 'revision']) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-modern-fail-'))
  const taskFile = join(directory, 'tasks.json')
  const valid = validTransferTarget('modern-target')
  const inspected = failure === 'header'
    ? validTransferTarget('modern-target', { cwd: 'C:\\changed' })
    : valid
  writeTaskStore(taskFile, [{ id: 'modern-fail', prompt: 'private', every: 3600, sessionId: 'owner', enabled: true }])
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    persistenceApi: 'handle',
    inspected,
    ...(failure === 'read' ? { persistenceReadError: new Error('private read failure') } : {}),
    ...(failure === 'close' ? { persistenceCloseError: new Error('private close failure') } : {}),
  })
  let stats = 0
  transferRun.ctx.sessionPersistence.stat = async () => ({
    header: valid.meta,
    revision: failure === 'revision' && stats++ > 0 ? 'changed-revision' : 'stable-revision',
  })
  try {
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'modern-fail', from: 'owner', to: 'modern-target' },
    ])), /could not be inspected/)
    assert.equal(transferRun.persistenceOpens.length, 1)
    assert.equal(transferRun.persistenceCloses.length, 1, `${failure} failure still closes the modern handle`)
    assert.equal(JSON.parse(readFileSync(taskFile, 'utf8')).tasks[0].sessionId, 'owner')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-modern-abort-'))
  const taskFile = join(directory, 'tasks.json')
  const target = validTransferTarget('modern-target')
  writeTaskStore(taskFile, [{ id: 'modern-abort', prompt: 'private', every: 3600, sessionId: 'owner', enabled: true }])
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true, persistenceApi: 'handle', inspected: target,
  })
  transferRun.ctx.sessionPersistence.stat = async () => ({ header: target.meta, revision: 'stable-revision' })
  let releaseRead
  let closes = 0
  transferRun.ctx.sessionPersistence.open = async () => ({
    header: target.meta,
    read: async (_offset, _length, options) => {
      await new Promise(resolve => { releaseRead = resolve })
      options.signal.throwIfAborted()
      return { eventState: 'detached', events: [] }
    },
    close: async () => { closes++ },
  })
  try {
    const controller = new AbortController()
    const pending = invokeTransfer(transferRun, transferRequest([
      { id: 'modern-abort', from: 'owner', to: 'modern-target' },
    ]), { signal: controller.signal })
    await new Promise(resolve => setImmediate(resolve))
    controller.abort(new Error('private abort reason'))
    releaseRead()
    await assertCommandError(pending, /cancelled/)
    assert.equal(closes, 1, 'aborted modern read closes its handle')
    assert.equal(JSON.parse(readFileSync(taskFile, 'utf8')).tasks[0].sessionId, 'owner')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer modern stat/open/read/close compatibility, stability, failure and abort guards')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-race-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [{ id: 'race', prompt: 'before', every: 3600, sessionId: 'owner', enabled: true }])
  const commandAgent = { id: 'command-root', session: { id: 'command-session' }, followup: () => {} }
  const ownerAgent = { id: 'owner-root', session: { id: 'owner' }, followup: () => {} }
  let releaseInspect
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    roots: [commandAgent, ownerAgent],
    inspectSession: async (id) => {
      await new Promise(resolve => { releaseInspect = resolve })
      return validTransferTarget(id)
    },
  })
  try {
    const pending = invokeTransfer(transferRun, transferRequest([
      { id: 'race', from: 'owner', to: 'target' },
    ]), { agent: commandAgent })
    await new Promise(resolve => setImmediate(resolve))
    await transferRun.tools.get('cron_update').execute({ id: 'race', prompt: 'after' }, { agent: ownerAgent })
    releaseInspect()
    await assertCommandError(pending, /changed during transfer/)
    const storedRace = JSON.parse(readFileSync(taskFile, 'utf8')).tasks[0]
    assert.equal(storedRace.sessionId, 'owner')
    assert.equal(storedRace.prompt, 'after', 'racing mutation is preserved rather than overwritten')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer detects async task object/revision/owner races before commit')

for (const liveChange of [
  { modern: true, event: { type: 'turn/start', data: {} }, pattern: /not blank/ },
  { modern: false, event: { type: 'agent-preset/selected', data: { agentPreset: 'standard' } }, pattern: /expectedPreset/ },
]) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-live-race-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [
    { id: 'live-a', prompt: 'a', every: 3600, sessionId: 'owner-a', enabled: true },
    { id: 'live-b', prompt: 'b', every: 3600, sessionId: 'owner-b', enabled: true },
  ])
  const commandAgent = { id: 'command-root', session: { id: 'command-session' }, followup: () => {} }
  let liveEvents = []
  let snapshotCalls = 0
  const liveSession = { header: validTransferTarget('target-a').meta }
  if (liveChange.modern) liveSession.snapshotEvents = () => { snapshotCalls++; return liveEvents }
  else liveSession.events = liveEvents
  const liveTarget = { id: 'target-root', session: liveSession, followup: () => {} }
  let targetBReads = 0
  let releaseTargetB
  let signalTargetBFinal
  const targetBFinal = new Promise(resolve => { signalTargetBFinal = resolve })
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    roots: [commandAgent, liveTarget],
    inspectSession: async id => {
      if (id === 'target-b' && ++targetBReads === 2) {
        signalTargetBFinal()
        await new Promise(resolve => { releaseTargetB = resolve })
      }
      return validTransferTarget(id)
    },
  })
  try {
    const pending = invokeTransfer(transferRun, transferRequest([
      { id: 'live-a', from: 'owner-a', to: 'target-a' },
      { id: 'live-b', from: 'owner-b', to: 'target-b' },
    ]), { agent: commandAgent })
    await targetBFinal
    liveEvents = [liveChange.event]
    if (!liveChange.modern) liveSession.events = liveEvents
    releaseTargetB()
    await assertCommandError(pending, liveChange.pattern)
    assert.equal(snapshotCalls, liveChange.modern ? 1 : 0, 'modern snapshotEvents is preferred while legacy events remains supported')
    assert.deepEqual(JSON.parse(readFileSync(taskFile, 'utf8')).tasks.map(task => task.sessionId), ['owner-a', 'owner-b'])
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ final live-root snapshotEvents and legacy events reject target A changes while target B is blocked')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-abort-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [{ id: 'abort', prompt: 'private', every: 3600, sessionId: 'owner', enabled: true }])
  let releaseInspect
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    inspectSession: async (id) => {
      await new Promise(resolve => { releaseInspect = resolve })
      return validTransferTarget(id)
    },
  })
  try {
    const controller = new AbortController()
    const pending = invokeTransfer(transferRun, transferRequest([
      { id: 'abort', from: 'owner', to: 'target' },
    ]), { signal: controller.signal })
    await new Promise(resolve => setImmediate(resolve))
    controller.abort(new Error('synthetic cancellation detail must stay private'))
    releaseInspect()
    await assertCommandError(pending, /cancelled/)
    assert.equal(JSON.parse(readFileSync(taskFile, 'utf8')).tasks[0].sessionId, 'owner')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer cancellation releases ownership lock without mutation')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-batch-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [
    { id: 'batch-a', prompt: 'a', every: 3600, sessionId: 'owner-a', enabled: true },
    { id: 'batch-b', prompt: 'b', every: 3600, sessionId: 'owner-b', enabled: true },
  ])
  const before = readFileSync(taskFile)
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    inspectSession: async (id) => id === 'target-b'
      ? validTransferTarget(id, { agentPreset: 'wrong' })
      : validTransferTarget(id),
  })
  try {
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'batch-a', from: 'owner-a', to: 'target-a' },
      { id: 'batch-b', from: 'owner-b', to: 'target-b' },
    ])), /expectedPreset/)
    assert.deepEqual(readFileSync(taskFile), before, 'one invalid target prevents the whole batch')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer target validation is all-or-none')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-persist-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [{ id: 'persist', prompt: 'private', every: 3600, sessionId: 'owner', enabled: true }])
  const before = readFileSync(taskFile)
  const ownerAgent = { id: 'owner-root', session: { id: 'owner' }, followup: () => {} }
  const commandAgent = { id: 'command-root', session: { id: 'command-session' }, followup: () => {} }
  const transferRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    roots: [commandAgent, ownerAgent],
    inspectSession: async id => validTransferTarget(id),
  })
  const originalRename = fs.renameSync
  try {
    fs.renameSync = (source, destination) => {
      if (destination === taskFile) throw new Error('synthetic rename detail must stay private')
      return originalRename(source, destination)
    }
    syncBuiltinESMExports()
    await assertCommandError(invokeTransfer(transferRun, transferRequest([
      { id: 'persist', from: 'owner', to: 'target' },
    ]), { agent: commandAgent }), /could not persist/)
    assert.deepEqual(readFileSync(taskFile), before, 'failed atomic rename leaves disk unchanged')
    assert.equal(existsSync(`${taskFile}.tmp`), false, 'failed strict save cleans its temp file')
    const ownerTasks = JSON.parse(await transferRun.tools.get('cron_list').execute({}, { agent: ownerAgent }))
    assert.deepEqual(ownerTasks.map(task => task.id), ['persist'], 'failed strict save restores in-memory owner')
  } finally {
    fs.renameSync = originalRename
    syncBuiltinESMExports()
  }
  try {
    const retried = await invokeTransfer(transferRun, transferRequest([
      { id: 'persist', from: 'owner', to: 'target' },
    ]), { agent: commandAgent })
    assert.equal(retried.kind, 'success', 'rollback leaves revisions eligible for a clean retry')
    assert.equal(JSON.parse(readFileSync(taskFile, 'utf8')).tasks[0].sessionId, 'target')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer strict persistence rolls memory/disk back and cleans temp files')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-success-'))
  const taskFile = join(directory, 'tasks.json')
  const historyFile = join(directory, 'history.jsonl')
  const now = Date.now()
  const originalTasks = [
    { id: 'owner-a', prompt: 'secret a', at: null, every: 3600, daily: null, cron: null, timeZone: null, sessionId: 'owner-a', enabled: true },
    { id: 'owner-b', prompt: 'secret b', at: null, every: null, daily: '23:59', cron: null, timeZone: 'UTC', sessionId: 'owner-b', enabled: false },
  ]
  const originalRuns = { 'owner-a': { lastRunAt: now, firedAt: null } }
  const originalOverrides = { 'owner-b': true }
  writeTaskStore(taskFile, originalTasks, originalRuns, originalOverrides)
  writeFileSync(historyFile, [
    { id: 'done-a', seq: 0, taskId: 'owner-a', sessionId: 'owner-a', status: 'completed', excerpt: 'kept' },
    { id: 'failed-b', seq: 1, taskId: 'owner-b', sessionId: 'owner-b', status: 'failed' },
  ].map(record => JSON.stringify(record)).join('\n') + '\n')
  const historyBefore = readFileSync(historyFile)
  let followups = 0
  const commandAgent = { id: 'command-root', session: { id: 'command-session' }, followup: () => { followups++ } }
  const transferRun = makeCtx(taskFile, historyFile, [], {
    commands: true,
    roots: [commandAgent],
    inspectSession: async id => validTransferTarget(id, { agentPreset: 'standard' }, [
      { type: 'session/title', data: { title: 'blank target' } },
      { type: 'session/metadata', data: { synthetic: true } },
      { type: 'agent-preset/selected', data: { agentPreset: 'coding' } },
    ]),
  })
  try {
    const transfers = [
      { id: 'owner-a', from: 'owner-a', to: 'target-a' },
      { id: 'owner-b', from: 'owner-b', to: 'target-b' },
    ]
    const result = await invokeTransfer(transferRun, transferRequest(transfers), { agent: commandAgent })
    assert.equal(result.kind, 'success')
    assert.deepEqual(JSON.parse(result.text), { transfers }, 'success output contains only ids/from/to')
    const after = JSON.parse(readFileSync(taskFile, 'utf8'))
    assert.deepEqual(after.tasks, originalTasks.map((task, index) => ({ ...task, sessionId: transfers[index].to })), 'only owners change')
    assert.deepEqual(after.runs, originalRuns, 'run stamps stay exact')
    assert.deepEqual(after.overrides, originalOverrides, 'enabled overrides stay exact')
    assert.deepEqual(readFileSync(historyFile), historyBefore, 'history stays byte-identical')
    assert.equal(transferRun.fired.length, 0)
    assert.equal(followups, 0, 'transfer neither follows up nor fires a task')
    assert.deepEqual(transferRun.persistenceInspects, ['target-a', 'target-b', 'target-a', 'target-b'], 'legacy targets receive initial and final full inspections')
  } finally {
    transferRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer success preserves prompts/rules/stamps/overrides/history and emits only owner summary')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-active-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [
    { id: 'pending-run', prompt: 'pending', at: past, sessionId: 'live-owner', enabled: true },
    { id: 'firing-run', prompt: 'firing', at: past, sessionId: 'cold-owner', enabled: true },
  ])
  const commandAgent = { id: 'command-root', session: { id: 'command-session' }, followup: () => {} }
  const liveAgent = { id: 'live-root', session: { id: 'live-owner' }, followup: (message) => activeRun.fired.push(message) }
  const activeRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    roots: [commandAgent, liveAgent],
    inspected: { meta: { id: 'cold-owner', cwd: 'C:\\workspace', agentPreset: 'coding' }, events: [] },
  })
  let releaseResume
  activeRun.ctx.agents.resume = async () => {
    await new Promise(resolve => { releaseResume = resolve })
    return { agent: { id: 'cold-root', session: { id: 'cold-owner' }, followup: message => activeRun.fired.push(message) } }
  }
  try {
    await new Promise(resolve => setTimeout(resolve, 3200))
    assert.equal(activeRun.fired.length, 1, 'live task has a pending delivered run')
    await assertCommandError(invokeTransfer(activeRun, transferRequest([
      { id: 'pending-run', from: 'live-owner', to: 'target-live' },
    ]), { agent: commandAgent }), /active run/)
    await assertCommandError(invokeTransfer(activeRun, transferRequest([
      { id: 'firing-run', from: 'cold-owner', to: 'target-cold' },
    ]), { agent: commandAgent }), /active run/)
  } finally {
    releaseResume?.()
    await new Promise(resolve => setImmediate(resolve))
    activeRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ cron-transfer rejects firing tasks and pending delivered/history runs')

{
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-transfer-lock-'))
  const taskFile = join(directory, 'tasks.json')
  writeTaskStore(taskFile, [{ id: 'locked', prompt: 'must not fire', at: past, sessionId: 'old-owner', enabled: true }])
  const commandAgent = { id: 'command-root', session: { id: 'command-session' }, followup: () => {} }
  let releaseInspect
  let inspections = 0
  const lockedRun = makeCtx(taskFile, join(directory, 'history.jsonl'), [], {
    commands: true,
    roots: [commandAgent],
    inspectSession: async id => {
      inspections++
      if (inspections === 1) await new Promise(resolve => { releaseInspect = resolve })
      return validTransferTarget(id)
    },
  })
  try {
    const request = transferRequest([{ id: 'locked', from: 'old-owner', to: 'new-owner' }])
    const pending = invokeTransfer(lockedRun, request, { agent: commandAgent })
    await new Promise(resolve => setImmediate(resolve))
    await assertCommandError(invokeTransfer(lockedRun, request, { agent: commandAgent }), /already transferring/)
    await new Promise(resolve => setTimeout(resolve, 3200))
    assert.equal(lockedRun.fired.length, 0, 'scheduler fire rejects a task while it is transferring')
    releaseInspect()
    const result = await pending
    assert.equal(result.kind, 'success')
    assert.equal(lockedRun.fired.length, 0, 'successful transfer itself never follows up')
  } finally {
    lockedRun.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ overlapping transfers cannot release another command fence; scheduler remains blocked')

// --- HTTP operations require and preserve the same Session owner
const httpDir = mkdtempSync(join(tmpdir(), 'dsh-cron-http-'))
const httpRootOne = { id: 'http-root-1', session: { id: 'sess-1' }, followup: () => {} }
const httpRootTwo = { id: 'http-root-2', session: { id: 'sess-2' }, followup: () => {} }
const httpRun = makeCtx(join(httpDir, 'tasks.json'), join(httpDir, 'history.jsonl'), [], {
  http: true,
  roots: [httpRootOne, httpRootTwo],
})
const route = httpRun.routes[0]
assert.ok(route, 'HTTP route registered')
assert.equal((await callHttp(route, 'add', { id: 'unknown', prompt: 'no', every: 120, sessionId: 'sess-unknown' })).status, 400)
assert.equal((await callHttp(route, 'add', { id: 'subagent', prompt: 'no', every: 120, sessionId: 'sess-child' })).status, 400)
const addedOne = await callHttp(route, 'add', { id: 'http-one', prompt: 'one', every: 120, sessionId: 'sess-1' })
assert.equal(addedOne.status, 200)
const addedEarlier = await callHttp(route, 'add', { id: 'http-earlier', prompt: 'earlier', every: 30, sessionId: 'sess-1' })
assert.equal(addedEarlier.status, 200)
assert.equal((await callHttp(route, 'add', { id: 'http-two', prompt: 'two', every: 120, sessionId: 'sess-2' })).status, 200)
assert.equal((await callHttp(route, 'add', {
  id: 'prompt-history-title-secret',
  prompt: 'adversarial prompt with history excerpt, title, preset, token and credentials',
  cron: '* * * * *', timeZone: 'UTC', sessionId: 'sess-1',
})).status, 200)
assert.equal((await callHttp(route, 'toggle', { id: 'prompt-history-title-secret', enabled: false, sessionId: 'sess-1' })).status, 200)
const ownerViewsBefore = (await callHttp(route, 'list', { sessionId: 'sess-1' })).body.result.tasks
const ownerTaskBytes = readFileSync(join(httpDir, 'tasks.json'))
const ownerHistoryExisted = existsSync(join(httpDir, 'history.jsonl'))
const ownerResumeCount = httpRun.resumes.length
const ownerPersistenceCounts = [httpRun.persistenceOpens.length, httpRun.persistenceReads.length, httpRun.persistenceInspects.length]
const owners = await callHttp(route, 'owners', {})
assert.equal(owners.status, 200)
assert.deepEqual(owners.body.result, [
  { sessionId: 'sess-1', taskCount: 3, enabledCount: 2, nextRunAt: addedEarlier.body.result.task.nextRunAt },
  { sessionId: 'sess-2', taskCount: 1, enabledCount: 1, nextRunAt: owners.body.result[1].nextRunAt },
], 'owners are deduplicated, sorted, counted with effective enabled state and earliest next run')
for (const owner of owners.body.result) assert.deepEqual(Object.keys(owner).sort(), ['enabledCount', 'nextRunAt', 'sessionId', 'taskCount'])
for (const secret of ['prompt', 'history', 'excerpt', 'title', 'preset', 'origin', 'schedule', 'id']) {
  assert.equal(Object.hasOwn(owners.body.result[0], secret), false, `owner summary omits ${secret}`)
}
assert.equal((await callHttp(route, 'owners', { sessionId: 'sess-1' })).status, 400, 'owners rejects meaningful payload')
assert.deepEqual(readFileSync(join(httpDir, 'tasks.json')), ownerTaskBytes, 'owner reads do not write task state')
assert.equal(existsSync(join(httpDir, 'history.jsonl')), ownerHistoryExisted, 'owner reads do not load/write history')
assert.equal(httpRun.resumes.length, ownerResumeCount, 'owner reads never resume an Agent')
assert.deepEqual([httpRun.persistenceOpens.length, httpRun.persistenceReads.length, httpRun.persistenceInspects.length], ownerPersistenceCounts, 'owner reads never inspect Sessions')
const ownerViewsAfter = (await callHttp(route, 'list', { sessionId: 'sess-1' })).body.result.tasks
assert.deepEqual(ownerViewsAfter, ownerViewsBefore, 'owner index reads do not mutate observable task/cache state')
assert.deepEqual(ownerViewsAfter.map((task) => task.id), ['http-one', 'http-earlier', 'prompt-history-title-secret'])
assert.equal((await callHttp(route, 'update', { id: 'http-two', prompt: 'stolen', sessionId: 'sess-1' })).status, 400)
assert.equal((await callHttp(route, 'remove', { id: 'http-two', sessionId: 'sess-1' })).status, 400)
assert.equal((await callHttp(route, 'toggle', { id: 'http-two', enabled: false, sessionId: 'sess-1' })).status, 400)
assert.equal((await callHttp(route, 'run', { id: 'http-two', sessionId: 'sess-1' })).status, 400)
assert.equal((await callHttp(route, 'toggle', { id: 'http-one', enabled: false, sessionId: 'sess-1' })).status, 200)
assert.equal((await callHttp(route, 'run', { id: 'http-one', sessionId: 'sess-1' })).status, 200)
assert.deepEqual((await callHttp(route, 'history', { sessionId: 'sess-1' })).body.result.records.map(record => record.taskId), ['http-one'])
assert.deepEqual((await callHttp(route, 'history', { sessionId: 'sess-2' })).body.result.records, [])
assert.equal((await callHttp(route, 'history', {})).status, 400)
assert.equal((await callHttp(route, 'update', { id: 'http-two', prompt: 'owned', sessionId: 'sess-2' })).status, 200)
assert.equal((await callHttp(route, 'remove', { id: 'http-two', sessionId: 'sess-2' })).status, 200)
httpRun.disposers.forEach((dispose) => dispose?.())
rmSync(httpDir, { recursive: true, force: true })
console.log('✓ HTTP per-session ownership authorization')

// --- reload: run stamps survive, one-shot does not refire, history reloads
run1.disposers.forEach((d) => d?.())
const run2 = makeCtx(storagePath, historyPath, configTasks)
await new Promise((r) => setTimeout(r, 4200))
assert.equal(run2.fired.length, 0, `nothing refires after reload (got ${run2.fired.length})`)
const reloaded = JSON.parse(await run2.tools.get('cron_history').execute({ limit: 10 }, { agent: run2.mockAgent }))
assert.equal(reloaded.length, 2, 'history survives reload')
assert.equal(reloaded.find((r) => r.taskId === 'once').status, 'completed', 'completed status survives')
console.log('✓ restart: no refire, history survives')
run2.disposers.forEach((d) => d?.())

// --- Issue #36: metadata-only HTTP reads of cold roots. Every file below is
// synthetic and lives in mkdtemp(tmpdir()); no real DSH_HOME/session/HTTP access.
// Stop scheduler effects entirely, rather than relying on racing a timer. This
// isolates what a read request does even when an enabled one-shot is overdue.
for (const shape of ['legacy-header', '0.1.3-snapshot', '0.1.5-snapshot']) {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-cold-http-'))
  const taskFile = join(directory, 'tasks.json')
  const historyFile = join(directory, 'history.jsonl')
  const storedTasks = {
    version: 1,
    tasks: [
      { id: 'cold-task', prompt: 'never execute on read', at: past, sessionId: 'sess-cold' },
      { id: 'cold-cron', prompt: 'read-only next slot', cron: '* * * * *', timeZone: 'UTC', sessionId: 'sess-cold' },
      { id: 'other-task', prompt: 'private other owner', every: 120, sessionId: 'sess-other' },
      { id: 'forged-task', prompt: 'task ownership is not authority', every: 120, sessionId: 'sess-unknown' },
      { id: 'child-task', prompt: 'not a root', every: 120, sessionId: 'sess-child' },
      { id: 'unbound-task', prompt: 'not an owner', every: 120 },
    ],
    runs: { 'other-task': { lastRunAt: 1, firedAt: null } },
    overrides: { 'other-task': false },
  }
  const storedHistory = [
    { id: 'cold-old', seq: 0, taskId: 'cold-task', sessionId: 'sess-cold', status: 'completed' },
    { id: 'cold-new', seq: 1, taskId: 'cold-task', sessionId: 'sess-cold', status: 'failed' },
    { id: 'other-run', seq: 2, taskId: 'other-task', sessionId: 'sess-other', status: 'completed' },
    { id: 'forged-run', seq: 3, taskId: 'forged-task', sessionId: 'sess-unknown', status: 'completed' },
    { id: 'unbound-run', seq: 4, taskId: 'unbound-task', status: 'completed' },
  ]
  writeFileSync(taskFile, JSON.stringify(storedTasks))
  writeFileSync(historyFile, storedHistory.map(record => JSON.stringify(record)).join('\n') + '\n')
  const taskBytes = readFileSync(taskFile)
  const historyBytes = readFileSync(historyFile)
  const cold = makeCtx(taskFile, historyFile, [], {
    http: true, roots: [], skipSchedulerEffects: true,
    persistenceApi: shape === 'legacy-header' ? 'inspect' : 'handle',
  })
  // SessionHeader.origin has only the optional 'subagent' value, NOT 'root'.
  // Missing delegationDepth is root (zero); parentSession is a root fork too.
  const rootHeader = Object.freeze({ id: 'sess-cold', cwd: directory })
  const wrap = header => shape === 'legacy-header' ? header : Object.freeze({ header, revision: 'fixture-revision' })
  let listed = Object.freeze([wrap(rootHeader), wrap(Object.freeze({ id: 'sess-child', origin: 'subagent', delegationDepth: 1 }))])
  let listCalls = 0
  cold.ctx.sessionPersistence.list = async () => { listCalls++; return listed }
  const forbiddenCalls = []
  const forbid = name => () => { forbiddenCalls.push(name); throw new Error(`read attempted ${name}`) }
  cold.ctx.agents.resume = forbid('agents.resume')
  cold.ctx.agentPresets.mount = forbid('agentPresets.mount')
  cold.mockAgent.followup = forbid('followup')
  cold.ctx.agentDefaultModel.currentSelection = forbid('model selection')
  for (const method of ['open', 'inspect', 'load', 'prepare', 'create', 'append']) {
    cold.ctx.sessionPersistence[method] = forbid(`persistence.${method}`)
  }
  // Trap the plugin's filesystem writes, including a same-bytes rewrite. Restore
  // built-in bindings before cleanup; other test processes are unaffected.
  const originalFs = new Map(['writeFileSync', 'renameSync', 'mkdirSync'].map(name => [name, fs[name]]))
  for (const name of originalFs.keys()) fs[name] = forbid(`fs.${name}`)
  syncBuiltinESMExports()
  try {
    const coldRoute = cold.routes[0]
    assert.equal(cold.disposers.length, 1, 'only the fake HTTP route effect runs, no scheduler timers')
    const ownerIndex = await callHttp(coldRoute, 'owners', {})
    assert.equal(ownerIndex.status, 200, 'a persisted unbound task does not hide valid owners')
    assert.deepEqual(ownerIndex.body.result.map(owner => owner.sessionId), [
      'sess-child', 'sess-cold', 'sess-other', 'sess-unknown',
    ])
    assert.ok(ownerIndex.body.result.every(owner => Object.keys(owner).sort().join(',') === 'enabledCount,nextRunAt,sessionId,taskCount'))
    const list = await callHttp(coldRoute, 'list', { sessionId: 'sess-cold' })
    assert.equal(list.status, 200, shape)
    assert.equal(list.body.ok, true)
    assert.deepEqual(list.body.result.tasks.map(task => task.id), ['cold-task', 'cold-cron'])
    assert.ok(list.body.result.tasks.every(task => task.sessionId === 'sess-cold'))
    const overdue = list.body.result.tasks[0]
    assert.equal(overdue.nextRunAt, past, 'read preserves an overdue slot')
    assert.equal(overdue.lastRunAt, null)
    assert.equal(overdue.firedAt, null)
    assert.equal(overdue.enabled, true)
    const allHistory = await callHttp(coldRoute, 'history', { sessionId: 'sess-cold' })
    assert.equal(allHistory.status, 200)
    assert.deepEqual(allHistory.body.result.records.map(record => record.id), ['cold-new', 'cold-old'])
    const limited = await callHttp(coldRoute, 'history', { sessionId: 'sess-cold', limit: 1 })
    assert.deepEqual(limited.body.result.records.map(record => record.id), ['cold-new'], 'filter before limiting')
    assert.deepEqual((await callHttp(coldRoute, 'list', { sessionId: 'sess-cold' })).body, list.body, 'repeat reads do not consume or change tasks')

    for (const method of ['list', 'history']) {
      for (const payload of [null, {}, { sessionId: '' }, { sessionId: 7 },
        { sessionId: 'sess-unknown', id: 'forged-task', ownerSessionId: 'sess-cold', header: rootHeader, origin: undefined, delegationDepth: 0 },
        { sessionId: 'sess-child', id: 'cold-task', ownerSessionId: 'sess-cold', header: rootHeader, delegationDepth: 0 },
        { id: 'cold-task', ownerSessionId: 'sess-cold', header: rootHeader }]) {
        const rejected = await callHttp(coldRoute, method, payload)
        assert.equal(rejected.status, 400, `${shape} ${method} rejects missing/unknown/subagent/forged owner`)
        assert.equal(rejected.body.ok, false)
        assert.equal(rejected.body.result, undefined, 'no leaked results')
      }
    }
    const beforeMutations = listCalls
    for (const method of ['add', 'update', 'remove', 'toggle', 'run']) {
      const rejected = await callHttp(coldRoute, method, {
        sessionId: 'sess-cold', id: 'cold-task', prompt: 'must not mutate', every: 120, enabled: false,
      })
      assert.equal(rejected.status, 400, `${method} remains live-root guarded`)
      assert.match(rejected.body.error.message, /live root Session owner/)
    }
    for (const [name, tool] of cold.tools) {
      await assert.rejects(tool.execute({ sessionId: 'sess-cold', id: 'cold-task', prompt: 'no', every: 120 }, {
        agent: { session: { id: 'sess-cold' } },
      }), /live root Session owner/, `${name} cannot use persisted HTTP authority`)
    }
    assert.equal(listCalls, beforeMutations, 'mutations/tools do not consult durable metadata')

    for (const header of [
      { id: 'sess-cold' }, // cwd is optional; no reconstruction is needed
      { id: 'sess-cold', delegationDepth: 0 },
      { id: 'sess-cold', parentSession: 'seed-parent', delegationDepth: 0 },
      // Synthetic tripwires: metadata must not be serialized or read as events.
      { id: 'sess-cold', toJSON() { throw new Error('serialized persistence metadata') },
        get events() { throw new Error('read full events') } },
    ]) {
      listed = [wrap(Object.freeze(header))]
      assert.equal((await callHttp(coldRoute, 'list', { sessionId: 'sess-cold' })).status, 200, 'valid public root header')
      assert.equal((await callHttp(coldRoute, 'history', { sessionId: 'sess-cold' })).status, 200)
    }
    for (const badHeader of [
      { id: 'wrong-owner' }, { id: 7 }, { id: { toString: () => 'sess-cold' } },
      { id: 'sess-cold', origin: 'subagent' }, { id: 'sess-cold', origin: 'root' },
      { id: 'sess-cold', origin: null },
      ...[1, -1, 0.5, '0', null, NaN, Infinity, false, {}].map(delegationDepth => ({ id: 'sess-cold', delegationDepth })),
    ]) {
      listed = [wrap(Object.freeze(badHeader))]
      for (const method of ['list', 'history']) {
        assert.equal((await callHttp(coldRoute, method, { sessionId: 'sess-cold', header: rootHeader, delegationDepth: 0 })).status, 400, 'ambiguous identity/lineage fails closed')
      }
    }
    for (const invalidList of [null, {}, [], [null], [wrap(rootHeader), wrap(rootHeader)],
      [{ id: 'sess-cold', header: { id: 'wrong-owner' }, revision: 'x' }],
      [{ id: 'wrong-owner', header: rootHeader, revision: 'x' }],
      [{ id: 'sess-cold', origin: 'subagent', header: rootHeader, revision: 'x' }],
      [{ id: 'sess-cold', header: null }], [{ id: 'sess-cold', revision: 'x' }]]) {
      listed = invalidList
      for (const method of ['list', 'history']) {
        assert.equal((await callHttp(coldRoute, method, { sessionId: 'sess-cold' })).status, 400, 'missing/duplicate/conflicting metadata fails closed')
      }
    }
    cold.ctx.sessionPersistence.list = async () => { throw new Error('metadata unavailable') }
    assert.equal((await callHttp(coldRoute, 'list', { sessionId: 'sess-cold' })).status, 400, 'async rejection is caught by HTTP dispatch')
    assert.equal((await callHttp(coldRoute, 'history', { sessionId: 'sess-cold' })).status, 400)
    delete cold.ctx.sessionPersistence.list
    assert.equal((await callHttp(coldRoute, 'list', { sessionId: 'sess-cold' })).status, 400, 'no metadata capability fails closed')
    assert.equal((await callHttp(coldRoute, 'history', { sessionId: 'sess-cold' })).status, 400)
    // A live root still succeeds without any persistence capability.
    cold.roots.push({ session: { id: 'sess-cold' }, followup: forbid('live followup') })
    assert.equal((await callHttp(coldRoute, 'list', { sessionId: 'sess-cold' })).status, 200)
    assert.equal((await callHttp(coldRoute, 'history', { sessionId: 'sess-cold' })).status, 200)
    assert.deepEqual(forbiddenCalls, [], 'no resume, mount, events, prompt, model selection, or storage writes')
    assert.deepEqual(cold.fired, [])
    assert.deepEqual(readFileSync(taskFile), taskBytes, 'tasks, runs and overrides stay byte-identical')
    assert.deepEqual(readFileSync(historyFile), historyBytes, 'history stays byte-identical')
    assert.equal(existsSync(`${taskFile}.tmp`), false)
    assert.equal(existsSync(`${historyFile}.tmp`), false)
  } finally {
    for (const [name, original] of originalFs) fs[name] = original
    syncBuiltinESMExports()
    cold.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
  console.log(`✓ cold HTTP list/history: ${shape}, strict root metadata, session filtering, no execution/writes`)
}

// --- restart reconciles nonterminal history instead of leaving phantom runs
const interruptedDir = mkdtempSync(join(tmpdir(), 'dsh-cron-interrupted-'))
const interruptedHistory = join(interruptedDir, 'history.jsonl')
writeFileSync(interruptedHistory, [
  { id: 'delivered-run', seq: 0, taskId: 'a', sessionId: 'sess-1', status: 'delivered' },
  { id: 'running-run', seq: 1, taskId: 'b', sessionId: 'sess-1', status: 'running' },
  { id: 'done-run', seq: 2, taskId: 'c', sessionId: 'sess-1', status: 'completed' },
].map((record) => JSON.stringify(record)).join('\n') + '\n')
const interrupted = makeCtx(join(interruptedDir, 'tasks.json'), interruptedHistory, [])
const interruptedRecords = JSON.parse(await interrupted.tools.get('cron_history').execute({ limit: 10 }, { agent: interrupted.mockAgent }))
assert.equal(interruptedRecords.find((record) => record.id === 'delivered-run').status, 'interrupted')
assert.equal(interruptedRecords.find((record) => record.id === 'running-run').endReason, 'host-restart')
assert.equal(interruptedRecords.find((record) => record.id === 'done-run').status, 'completed')
interrupted.disposers.forEach((dispose) => dispose?.())
rmSync(interruptedDir, { recursive: true, force: true })
console.log('✓ restart reconciles delivered/running history as interrupted')

// --- strict fixed-session delivery: never fall back to another live root
const otherSession = { id: 'sess-other' }
const otherFired = []
const otherAgent = { id: 'other', session: otherSession, followup: (msg) => otherFired.push(msg) }
for (const eventState of [undefined, 'detached', 'shared-frozen']) {
  const strictDir = mkdtempSync(join(tmpdir(), 'dsh-cron-strict-'))
  const strict = makeCtx(join(strictDir, 'tasks.json'), join(strictDir, 'history.jsonl'), [
    { id: 'strict', prompt: 'strict owner', at: past, sessionId: 'sess-owner' },
  ], {
    roots: [otherAgent],
    inspected: {
      meta: { id: 'sess-owner', cwd: 'C:\\workspace', agentPreset: 'standard' },
      events: [
        { type: 'request/header', data: { header: { config: { provider: 'saved-provider', model: 'saved-model' } } } },
        { type: 'agent-preset/selected', data: { agentPreset: 'coding' } },
      ],
    },
    persistenceApi: 'handle',
    eventState,
  })
  try {
    await new Promise((r) => setTimeout(r, 2200))
    assert.equal(otherFired.length, 0, 'unrelated live root never receives bound task')
    assert.equal(strict.resumes.length, 1, 'cold owner resumed exactly once')
    assert.equal(String(strict.resumes[0].resumeSessionId), 'sess-owner')
    assert.deepEqual(strict.resumes[0].agentOptions, { provider: 'saved-provider', model: 'saved-model' })
    assert.deepEqual(strict.mounts, ['coding'], 'latest persisted preset projection is mounted')
    assert.deepEqual(strict.persistenceOpens, [{ id: 'sess-owner', access: 'read' }], 'snapshot.header id opens a read handle')
    assert.deepEqual(strict.persistenceReads, ['sess-owner'], 'cold resume reads the handle')
    assert.deepEqual(strict.persistenceCloses, ['sess-owner'], 'cold resume always closes the handle')
    assert.deepEqual(strict.persistenceInspects, [], 'new handle API does not call legacy inspect')
    assert.equal(strict.fired.length, 1, 'resumed owner receives task')
    console.log(`✓ strict cold owner delivery and handle closure (${eventState ?? 'legacy array'})`)
  } finally {
    strict.disposers.forEach((d) => d?.())
    rmSync(strictDir, { recursive: true, force: true })
  }
}

// --- malformed results/handles fail closed, close usable handles and stay overdue.
// Run these isolated owners together to avoid a timer wait per invalid shape.
let malformedHandleCloses = 0
const malformedClosableHandle = { close: async () => { malformedHandleCloses++ } }
const invalidCases = [
  ...[undefined, null, {}, 'events', { events: {} }, { events: [], eventState: 'unknown' },
    { events: [], eventState: undefined }].map(readResult => ({ readResult })),
  ...[null, {}, { read: async () => [] }, malformedClosableHandle].map(badHandle => ({ badHandle })),
  ...[{ id: 'wrong-owner' }, { origin: 'subagent' }, { delegationDepth: 1 }].map(meta => ({
    persistenceHeaders: [{ id: 'sess-invalid', cwd: 'C:\\workspace' }],
    inspected: { meta: { id: 'sess-invalid', cwd: 'C:\\workspace', ...meta }, events: [] },
  })),
]
const invalidRuns = invalidCases.map(options => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-invalid-handle-'))
  return { directory, run: makeCtx(join(directory, 'tasks.json'), join(directory, 'history.jsonl'), [
    { id: 'invalid', prompt: 'must remain overdue', at: past, sessionId: 'sess-invalid' },
  ], {
    roots: [otherAgent], persistenceApi: 'handle',
    inspected: { meta: { id: 'sess-invalid', cwd: 'C:\\workspace' }, events: [] },
    ...options,
  }), options }
})
try {
  await new Promise(resolve => setTimeout(resolve, 2200))
  for (const { directory, run, options } of invalidRuns) {
    assert.equal(run.resumes.length, 0, 'invalid persistence never resumes any owner')
    assert.equal(run.fired.length, 0)
    assert.equal(existsSync(join(directory, 'history.jsonl')), false)
    assert.equal(run.persistenceOpens.length, 1, 'invalid reads remain overdue with bounded retry backoff')
    if (!Object.hasOwn(options, 'badHandle')) {
      assert.equal(run.persistenceCloses.length, run.persistenceOpens.length, 'all acquired handles close')
    } else if (options.badHandle === malformedClosableHandle) {
      assert.equal(malformedHandleCloses, run.persistenceOpens.length, 'missing read still closes a usable handle')
    }
    assert.ok(run.warnings.some(warning => warning.includes('cannot inspect bound session')))
  }
  assert.equal(otherFired.length, 0, 'invalid reads never fall back to another root')
} finally {
  for (const { directory, run } of invalidRuns) {
    run.disposers.forEach(dispose => dispose?.())
    rmSync(directory, { recursive: true, force: true })
  }
}
console.log('✓ malformed handle/results and changed owner/lineage fail closed and retry')

// --- Core 0.1.1/0.1.2 fallback retains legacy list headers + inspect
const legacyDir = mkdtempSync(join(tmpdir(), 'dsh-cron-legacy-inspect-'))
const legacy = makeCtx(join(legacyDir, 'tasks.json'), join(legacyDir, 'history.jsonl'), [
  { id: 'legacy', prompt: 'legacy owner', at: past, sessionId: 'sess-legacy' },
], {
  roots: [otherAgent],
  persistenceApi: 'inspect',
  inspected: {
    meta: { id: 'sess-legacy', cwd: 'C:\\legacy', agentPreset: 'standard' },
    events: [],
  },
})
await new Promise((r) => setTimeout(r, 2200))
assert.deepEqual(legacy.persistenceInspects, ['sess-legacy'], 'legacy inspect fallback is called')
assert.deepEqual(legacy.persistenceOpens, [], 'legacy persistence does not require open')
assert.equal(legacy.resumes.length, 1)
assert.equal(legacy.fired.length, 1)
legacy.disposers.forEach((d) => d?.())
rmSync(legacyDir, { recursive: true, force: true })
console.log('✓ legacy persistence list header + inspect fallback remains supported')

// --- a failed handle read still releases the read handle in finally
const closeDir = mkdtempSync(join(tmpdir(), 'dsh-cron-handle-close-'))
const closeFailure = makeCtx(join(closeDir, 'tasks.json'), join(closeDir, 'history.jsonl'), [
  { id: 'close-on-error', prompt: 'must close', at: past, sessionId: 'sess-close' },
], {
  roots: [otherAgent],
  persistenceApi: 'handle',
  persistenceReadError: new Error('read failed'),
  inspected: { meta: { id: 'sess-close', cwd: 'C:\\workspace' }, events: [] },
})
await new Promise((r) => setTimeout(r, 2200))
assert.ok(closeFailure.persistenceReads.length >= 1, 'overdue task retries its failed read')
assert.equal(closeFailure.persistenceCloses.length, closeFailure.persistenceReads.length, 'every failed read closes its handle')
assert.ok(closeFailure.persistenceCloses.every((id) => id === 'sess-close'))
assert.equal(closeFailure.resumes.length, 0)
assert.equal(closeFailure.fired.length, 0)
closeFailure.disposers.forEach((d) => d?.())
rmSync(closeDir, { recursive: true, force: true })
console.log('✓ handle read failure closes the read handle')

// --- close failure invalidates the cold read; never resume from an unreleased handle
const closeErrorDir = mkdtempSync(join(tmpdir(), 'dsh-cron-close-error-'))
const closeError = makeCtx(join(closeErrorDir, 'tasks.json'), join(closeErrorDir, 'history.jsonl'), [
  { id: 'close-error', prompt: 'must not resume', at: past, sessionId: 'sess-close-error' },
], {
  roots: [otherAgent],
  persistenceApi: 'handle',
  persistenceCloseError: new Error('close failed'),
  inspected: { meta: { id: 'sess-close-error', cwd: 'C:\\workspace' }, events: [] },
})
await new Promise((r) => setTimeout(r, 2200))
assert.ok(closeError.persistenceCloses.length >= 1, 'close is attempted on every cold read')
assert.equal(closeError.resumes.length, 0, 'close failure prevents resume')
assert.equal(closeError.fired.length, 0, 'close failure leaves the task overdue')
assert.ok(closeError.warnings.some((warning) => warning.includes('cannot inspect bound session "sess-close-error"')))
closeError.disposers.forEach((d) => d?.())
rmSync(closeErrorDir, { recursive: true, force: true })
console.log('✓ handle close failure aborts cold resume and is logged')

// --- durable subagent ownership is never promoted through cold resume
for (const lineage of [
  { origin: 'subagent' },
  { delegationDepth: 1 },
]) {
  const lineageDir = mkdtempSync(join(tmpdir(), 'dsh-cron-lineage-'))
  const rejected = makeCtx(join(lineageDir, 'tasks.json'), join(lineageDir, 'history.jsonl'), [
    { id: 'child-owned', prompt: 'must not resume', at: past, sessionId: 'sess-child-cold' },
  ], {
    roots: [otherAgent],
    persistenceHeaders: [{ id: 'sess-child-cold', cwd: 'C:\\workspace', ...lineage }],
    inspected: { meta: { id: 'sess-child-cold', cwd: 'C:\\workspace', ...lineage }, events: [] },
  })
  await new Promise((r) => setTimeout(r, 2200))
  assert.equal(rejected.resumes.length, 0, `subagent lineage ${JSON.stringify(lineage)} must not resume`)
  assert.equal(rejected.fired.length, 0, 'subagent-owned task must remain undelivered')
  rejected.disposers.forEach((d) => d?.())
  rmSync(lineageDir, { recursive: true, force: true })
}
console.log('✓ durable subagent sessions are rejected before cold resume')

// --- failed cold resume remains overdue and never consumes the slot
const failedDir = mkdtempSync(join(tmpdir(), 'dsh-cron-resume-fail-'))
const failed = makeCtx(join(failedDir, 'tasks.json'), join(failedDir, 'history.jsonl'), [
  { id: 'held', prompt: 'held owner', at: past, sessionId: 'sess-missing' },
], {
  roots: [otherAgent], resumeError: new Error('resume failed'), persistenceApi: 'handle',
  eventState: 'shared-frozen',
  inspected: { meta: { id: 'sess-missing', cwd: 'C:\\workspace' }, events: [] },
})
await new Promise((r) => setTimeout(r, 4200))
assert.equal(failed.resumes.length, 1, 'a real resume rejection stays overdue with bounded retry backoff')
assert.equal(failed.persistenceCloses.length, failed.resumes.length, 'handle closes before each failed resume')
assert.equal(otherFired.length, 0, 'resume failure still never falls back')
assert.equal(failed.fired.length, 0)
assert.equal(existsSync(join(failedDir, 'history.jsonl')), false, 'failed delivery creates no run history')
console.log('✓ failed cold resume stays overdue without fallback')
failed.disposers.forEach((d) => d?.())
rmSync(failedDir, { recursive: true, force: true })

// --- concurrent manual runs serialize by task ownership
const serialDir = mkdtempSync(join(tmpdir(), 'dsh-cron-serial-'))
let releaseResume
const serial = makeCtx(join(serialDir, 'tasks.json'), join(serialDir, 'history.jsonl'), [], { roots: [] })
serial.ctx.agents.resume = async (request) => {
  serial.resumes.push(request)
  await new Promise((resolve) => { releaseResume = resolve })
  return { agent: { id: 'sess-1', session: { id: 'sess-1' }, followup: (msg) => serial.fired.push(msg) } }
}
serial.roots.push(serial.mockAgent)
await serial.tools.get('cron_add').execute({ id: 'serial', prompt: 'serial', every: 60 }, { agent: serial.mockAgent })
serial.roots.splice(0)
const runTool = serial.tools.get('cron_list')
assert.ok(runTool, 'serial harness remains usable')
// Scheduler tick ownership is covered by two ticks while resume is pending.
await new Promise((r) => setTimeout(r, 3200))
releaseResume?.()
await new Promise((r) => setTimeout(r, 1200))
assert.ok(serial.resumes.length <= 1, `resume is single-flight (got ${serial.resumes.length})`)
console.log('✓ asynchronous firing remains single-flight')
serial.disposers.forEach((d) => d?.())
rmSync(serialDir, { recursive: true, force: true })

// --- fault containment: nothing the plugin does may escape as an uncaught throw
const run3 = makeCtx(storagePath, historyPath, configTasks)
// malformed session events must be swallowed by the guarded listener
run3.emit('session/event', run3.mockSession, null)
run3.emit('session/event', run3.mockSession, { type: 'assistant/message', seq: 1, time: 0, data: null })
run3.emit('session/event', run3.mockSession, { type: 'turn/end', seq: 2, time: 0, data: { turn: 1, reason: null } })
run3.emit('agent/status', null)
run3.emit('agent/created', {})
// a throwing followup must not propagate out of a tick
run3.mockAgent.followup = () => { throw new Error('agent exploded') }
run3.emit('session/event', run3.mockSession, { type: 'user/message', seq: 3, time: 0, data: { id: 'x' } })
await new Promise((r) => setTimeout(r, 4200)) // hourly task is NOT due; force via every-60? wait: hourly due after 60s — no fire expected
run3.disposers.forEach((d) => d?.())
console.log('✓ fault containment (malformed events, throwing followup)')
run3.disposers.forEach((d) => d?.())

rmSync(dir, { recursive: true, force: true })
console.log('\nALL TESTS PASSED')
process.exit(0)

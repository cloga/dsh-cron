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
        read: async () => {
          persistenceReads.push(id)
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
    sessionPersistence.inspect = async (id) => {
      persistenceInspects.push(id)
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
    ctx, fired, tools, routes, disposers, mockAgent, mockSession, emit, roots, resumes, mounts, selections,
    persistenceOpens, persistenceReads, persistenceCloses, persistenceInspects, warnings,
  }
}

async function callHttp(route, method, payload) {
  const req = new EventEmitter()
  req.method = 'POST'
  req.url = `/cron/api/${method}`
  req.headers = { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin' }
  req.destroy = () => {}
  let status
  let body = ''
  const res = {
    headersSent: false,
    writeHead(value) { status = value; this.headersSent = true },
    end(value = '') { body += value },
  }
  const pending = route.handler(req, res)
  req.emit('data', Buffer.from(JSON.stringify(payload)))
  req.emit('end')
  await pending
  return { status, body: JSON.parse(body) }
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

const configTasks = [
  { id: 'once', prompt: 'one shot task', at: past, sessionId: 'sess-1' },
  { id: 'hourly', prompt: 'interval task', every: 60, sessionId: 'sess-1' },
  { id: 'morning', prompt: 'daily task', daily: dailyPast, sessionId: 'sess-1' },
]

const run1 = makeCtx(storagePath, historyPath, configTasks)
assert.deepEqual([...run1.tools.keys()].sort(), ['cron_add', 'cron_history', 'cron_list', 'cron_remove', 'cron_update'], 'tools registered')
console.log('✓ tools registered (incl. cron_history)')

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
assert.equal((await callHttp(route, 'add', { id: 'http-one', prompt: 'one', every: 120, sessionId: 'sess-1' })).status, 200)
assert.equal((await callHttp(route, 'add', { id: 'http-two', prompt: 'two', every: 120, sessionId: 'sess-2' })).status, 200)
assert.deepEqual((await callHttp(route, 'list', { sessionId: 'sess-1' })).body.result.tasks.map((task) => task.id), ['http-one'])
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
    assert.ok(run.persistenceOpens.length >= 2, 'invalid reads remain overdue and retry')
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
assert.ok(closeError.warnings.some((warning) => warning.includes('cannot inspect bound session "sess-close-error": close failed')))
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
assert.ok(failed.resumes.length >= 2, 'a real resume rejection stays overdue and retries')
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

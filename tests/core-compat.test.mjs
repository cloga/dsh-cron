// Package policy, exact-source declarations, and source-backed cold-read contracts.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { CORE_COMMITS, CORE_READ_SHAPES, coreReadShape, assertSourceIdentity, openCoreSource, assertHandleContract, assertSlotContract, declaration, loadJsonlHandle } from './core-source.mjs'

const DSH_RANGE = '>=0.1.1-rc.2 <0.1.2-0 || >=0.1.2-alpha.4 <0.1.2 || >=0.1.3-alpha.1 <0.1.3-alpha.2 || 0.1.5-alpha.1 || 0.1.5-alpha.2 || 0.1.5-rc.2 || 0.1.6-alpha.1'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const requiredPeers = ['agent', 'agent-presets', 'agent-default-model', 'llm', 'session', 'session-persistence', 'tools'].map(name => `@deepseek-ai/dsh-${name}`)
const optionalPeers = ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-web']
assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
assert.equal(manifest.packageManager, 'pnpm@11.7.0')
assert.equal(manifest.engines.node, '^22.19.0 || >=24.0.0')
for (const name of [...requiredPeers, ...optionalPeers]) {
  assert.equal(manifest.peerDependencies[name], DSH_RANGE, `${name} must retain legacy lines and add only exact certified prereleases`)
}
for (const name of optionalPeers) assert.equal(manifest.peerDependenciesMeta[name]?.optional, true)
assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-layout'))
assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
console.log('✓ package policy retains legacy Core and admits only exact certified prereleases through 0.1.6-alpha.1')

assert.equal(CORE_COMMITS.size, 6, 'retain all previous exact pins plus 0.1.6-alpha.1')
assert.deepEqual([...CORE_READ_SHAPES.keys()], [...CORE_COMMITS.values()])
assert.equal(coreReadShape('0.1.2-rc.1'), 'inspection')
assert.equal(coreReadShape('0.1.3-alpha.1'), 'array')
for (const version of ['0.1.5-alpha.1', '0.1.5-alpha.2', '0.1.5-rc.2', '0.1.6-alpha.1']) {
  assert.equal(coreReadShape(version), 'event-state', `${version} must execute the actual JSONL handle fixture`)
}
for (const version of ['0.1.5-alpha.3', '0.1.5-rc.1', '0.1.5-rc.3', '0.1.5']) {
  assert.throws(() => coreReadShape(version), /exact supported version/)
}

for (const [commit, version] of CORE_COMMITS) {
  assertSourceIdentity(commit, '', version)
  assert.throws(() => assertSourceIdentity(commit, ' M package.json', version), /no tracked modifications/)
  assert.throws(() => assertSourceIdentity(commit, '', '0.1.5-alpha.99'), /version must match/)
}
assert.throws(() => assertSourceIdentity('0'.repeat(40), '', '0.1.5-alpha.1'), /exact supported official commit/)

const corePath = process.env.DSH_CORE_PATH?.trim()
const coreRef = process.env.DSH_CORE_REF?.trim()
assert.ok(!coreRef || corePath, 'DSH_CORE_REF requires DSH_CORE_PATH')
if (!corePath) {
  console.log('ℹ DSH_CORE_PATH is unset; skipping exact Core source and source-backed handle checks (manifest policy only)')
  process.exit(0)
}

if (coreRef || existsSync(join(corePath, 'packages/core/session/src/index.ts'))) {
  const { commit, version, read, mode } = openCoreSource(corePath, coreRef)
  const shape = coreReadShape(version)
  const modern = shape === 'event-state'
  const handles = shape !== 'inspection'
  const liveSession = read('packages/core/session/src/index.ts')
  for (const method of ['eventAt(seq: SessionSeq)', 'snapshotEvents(', 'ownEvents(): readonly SessionEvent[]', 'get seq(): SessionLogOffset']) {
    assert.ok(liveSession.includes(method), `live Session method unavailable: ${method}`)
  }
  const persistence = read('packages/session/session-persistence/src/index.ts')
  if (handles) {
    assert.match(persistence, /interface SessionPersistenceSnapshot[\s\S]*?readonly header: SessionHeader/)
    assert.match(persistence, /abstract stat\(id: SessionId, options\?: SessionPersistenceStatOptions\): Promise<SessionPersistenceSnapshot \| undefined>/)
    assert.match(persistence, /interface SessionPersistenceStatOptions[\s\S]*?readonly signal\?: AbortSignal/)
    assert.match(persistence, /abstract open\(id: SessionId, access: SessionAccess/)
    const handle = read('packages/session/session-persistence/src/handle.ts')
    assertHandleContract(handle, modern)
    // A retained method name with the WRONG return shape must fail certification.
    assert.throws(() => assertHandleContract(handle.replace(
      modern ? 'Promise<SessionHandleReadResult>' : 'Promise<readonly SessionEvent[]>',
      modern ? 'Promise<readonly SessionEvent[]>' : 'Promise<SessionHandleReadResult>',
    ), modern))
    if (modern) {
      const state = declaration(read('packages/core/session/src/types.ts'), 'SessionSeedEventState', ts.isTypeAliasDeclaration)
      assert.equal(state.type.getText(), "'detached' | 'shared-frozen'")
      for (const [path, name, kind, scope] of [
        ['ui-conversation/src/client/contract/slots.ts', 'conversation.session.header.utilities', 'list', 'session'],
        ['ui-layout/src/client/index.ts', 'shell.overlay', 'list', 'root'],
        ...(version === '0.1.5-alpha.1' ? [] : [
          ['ui-sidebar/src/client/contract/slots.ts', 'sidebar.panellist', 'list', 'root'],
          ['ui-layout/src/client/index.ts', 'main', 'keyed', 'root'],
        ]),
      ]) {
        const slots = read(`packages/client/${path}`)
        assertSlotContract(slots, name, kind, scope)
        assert.throws(() => assertSlotContract(slots, name, kind === 'list' ? 'single' : 'list', scope), /kind/)
        assert.throws(() => assertSlotContract(slots, name, kind, scope === 'root' ? 'session' : 'root'), /scope/)
      }
      const workspaceNavigation = read('packages/client/ui-workspace/src/client/navigation.ts')
      if (version === '0.1.5-alpha.1') {
        assert.doesNotMatch(workspaceNavigation, /openSession\(sessionId: SessionId\): void/)
        assert.doesNotMatch(read('packages/client/ui-sidebar/src/client/contract/slots.ts'), /'sidebar\.panellist'/)
        console.log('✓ Core alpha.1 lacks the optional global hub; existing Cron surfaces remain supported')
      } else {
        assert.match(workspaceNavigation, /openSession\(sessionId: SessionId\): void/)
      }
      await verifySourceHandleColdResume(read, version)
    }
  } else {
    assert.match(persistence, /interface SessionInspection[\s\S]*?readonly events: readonly SessionEvent\[\]/)
  }
  assert.match(read('packages/core/tools/src/index.ts'), /interface ToolExecutionInput[\s\S]*?readonly agent\?: Agent/)
  if (version === '0.1.6-alpha.1') {
    const agent = read('packages/core/agent/src/index.ts')
    assert.match(agent, /async resume\(options: ResumeAgentOptions\): Promise<AgentHandle>/)
    assert.match(agent, /await this\.ctx\.serial\(entry\.carrier, 'agent\/created', \{/)
    assert.doesNotMatch(agent, /agent\/session-start/)
    assert.match(liveSession, /@deprecated Existing logic may remain unmigrated for now, but new calls are prohibited\.[\s\S]*?snapshotEvents\(/)
    const cron = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
    assert.doesNotMatch(cron, /\.snapshotEvents\s*\(/, 'Cron production code must not add a deprecated synchronous Session history read')
    assert.match(cron, /Number\.isSafeInteger\(session\.seq\)/, 'live transfer freshness must use the public Session seq projection')
    const boot = read('packages/boot/app-boot/src/index.ts')
    const requiredEntries = boot.match(/const requiredStartupEntryIds = new Set<string>\(\[([\s\S]*?)\]\)/)?.[1]
    assert.ok(requiredEntries)
    assert.doesNotMatch(requiredEntries, /cron/, 'Cron remains an optional plugin whose activation failure must not abort DSH')
    assert.match(boot, /Other[\s*]+inactive entries produce one warning and leave successful siblings running\./)
    assert.match(boot, /reapply it to the boot Include without rollback/)
    assert.match(boot, /await entry\.update\([\s\S]*?await ctx\.loader\.await\(\)[\s\S]*?activationDiagnostic\(binName, 'warning'/)
    const watcher = read('packages/boot/app-boot/src/watch-config.ts')
    assert.match(watcher, /await refresh\(\)[\s\S]*?ctx\.logger\.warn\('config reload at %C failed'/)
  }
  for (const path of ['packages/core/agent', 'packages/core/session', 'packages/host/webserver', 'packages/web/web']) {
    const peer = JSON.parse(read(`${path}/package.json`))
    assert.equal(peer.version, version, `${peer.name} does not match CLI release`)
  }
  const clients = new Map([
    ['@deepseek-ai/dsh-client-locale', 'locale'],
    ['@deepseek-ai/dsh-client-ui-conversation', 'ui-conversation'],
    ['@deepseek-ai/dsh-client-ui-layout', 'ui-layout'],
    ['@deepseek-ai/dsh-client-ui-workspace', 'ui-workspace'],
  ])
  for (const name of manifest.dsh.client.inject) {
    assert.ok(clients.has(name), `unmapped client dependency ${name}`)
    assert.equal(JSON.parse(read(`packages/client/${clients.get(name)}/package.json`)).name, name)
  }
  console.log(`✓ exact-source declaration checks: Core ${version} ${commit} (${mode}); not full Host compatibility`)
  process.exit(0)
}

// Optional installed-package capability probe: names/prototypes only, not an
// exact-source certificate or live Host/GUI execution test.
const scope = join(corePath, 'node_modules', '@deepseek-ai')
const packageFile = (name, relative = 'lib/index.js') => join(scope, name, relative)
const importPackage = async name => import(pathToFileURL(packageFile(name)).href)
const dshManifestPath = packageFile('dsh', 'package.json')
assert.ok(existsSync(dshManifestPath), `DSH package not found under ${corePath}`)
const installed = JSON.parse(readFileSync(dshManifestPath, 'utf8')).version
assert.ok(['0.1.1-rc.2', ...CORE_COMMITS.values()].includes(installed))
const [{ AgentRegistry }, { AgentPresets }, { AgentDefaultModelConfig }, { JsonlSessionPersistence }] = await Promise.all([
  importPackage('dsh-agent'), importPackage('dsh-agent-presets'), importPackage('dsh-agent-default-model'), importPackage('dsh-session-persistence-jsonl'),
])
for (const [owner, method] of [[AgentRegistry, 'resume'], [AgentRegistry, 'roots'], [AgentPresets, 'mount'], [AgentDefaultModelConfig, 'currentSelection'], [JsonlSessionPersistence, 'list']]) {
  assert.equal(typeof owner?.prototype?.[method], 'function', `${owner?.name ?? 'service'}.${method} unavailable`)
}
const readMethod = installed !== '0.1.1-rc.2' && coreReadShape(installed) !== 'inspection' ? 'open' : 'inspect'
assert.equal(typeof JsonlSessionPersistence?.prototype?.[readMethod], 'function')
console.log(`✓ installed Core ${installed} capability probe only; no exact source or live Host verification`)

async function verifySourceHandleColdResume(read, version) {
  const JsonlSessionHandle = loadJsonlHandle(read)
  const { apply, Config } = await import('../index.js')
  // Use the actual tagged read/readCurrent/readPrimed/close implementation with
  // fake storage and AgentRegistry. This does not test JSONL IO or migrations.
  for (const [eventState, empty, primed] of ['detached', 'shared-frozen'].flatMap(state =>
    [false, true].flatMap(empty => [false, true].map(primed => [state, empty, primed])))) {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-source-handle-'))
    const disposers = []
    const meta = Object.freeze({ id: 'source-owner', cwd: directory, agentPreset: 'standard', delegationDepth: 0 })
    const events = empty ? [] : [
      { type: 'request/header', data: { header: { config: { provider: 'saved', model: 'saved-model' } } } },
      { type: 'agent-preset/selected', data: { agentPreset: 'coding' } },
    ]
    if (eventState === 'shared-frozen') {
      const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } }
      freeze(events)
    }
    const original = JSON.stringify(events)
    const source = { eventState, events }
    let releases = 0
    let opens = 0
    let deliveries = 0
    let timeout
    let resolveDelivery
    let rejectDelivery
    const delivered = new Promise((resolve, reject) => { resolveDelivery = resolve; rejectDelivery = reject })
    const resumes = []
    const mounts = []
    const storage = {
      resolveCurrentLog: async () => primed ? undefined : 'fixture-log',
      readStoredLog: async () => source,
      hasPendingSession: () => false,
      releaseHandle: () => { releases++ },
    }
    const makeHandle = () => new JsonlSessionHandle(storage, meta.id, meta, 'read', {
      cursor: 0, materialized: true, inheritedEventCount: 0, ...(primed ? { primed: source } : {}),
    })
    const probe = makeHandle()
    try {
      const result = await probe.read()
      assert.equal(result.eventState, eventState)
      assert.deepEqual(result.events, events)
      assert.notEqual(result.events, events, 'tagged handle supplies a caller-owned outer slice')
      const slice = await probe.read(1, 1)
      assert.equal(slice.eventState, eventState)
      assert.deepEqual(slice.events, events.slice(1, 2))
      const pastEnd = await probe.read(events.length, 1)
      assert.equal(pastEnd.eventState, eventState, 'empty slices retain producer ownership state')
      assert.deepEqual(pastEnd.events, [])
    } finally { await probe.close() }
    await probe.close()
    assert.equal(releases, 1, 'actual handle close is idempotent')
    await assert.rejects(() => probe.read(), 'actual closed handle must reject further reads')
    releases = 0
    try {
      apply({
        logger: { info() {}, warn: message => rejectDelivery(new Error(message)) },
        agents: {
          roots: () => [{ session: { id: 'unrelated' }, followup: () => rejectDelivery(new Error('wrong owner')) }],
          resume: async request => {
            assert.equal(releases, 1, 'read handle must close before root resume')
            resumes.push(request)
            await request.setup({})
            return { agent: { session: { id: meta.id }, followup: () => { deliveries++; resolveDelivery() } } }
          },
        },
        sessionPersistence: {
          list: async () => [{ header: meta, revision: 'fixture' }],
          open: async (id, access) => { assert.equal(id, meta.id); assert.equal(access, 'read'); opens++; return makeHandle() },
        },
        agentPresets: { mount: async (_ctx, preset) => mounts.push(preset) },
        agentDefaultModel: { currentSelection: () => ({ provider: 'default', model: 'default-model' }) },
        tools: { register() {} }, on() {}, inject() {}, effect: effect => disposers.push(effect()),
      }, Config({
        storagePath: join(directory, 'tasks.json'), historyPath: join(directory, 'history.jsonl'),
        tickSeconds: 1, systemNotify: false,
        tasks: [{ id: 'source-read', sessionId: meta.id, prompt: 'fixture only', at: new Date(Date.now() - 60000).toISOString() }],
      }))
      timeout = setTimeout(() => rejectDelivery(new Error('source-backed cold resume timed out')), 5000)
      await delivered
      assert.equal(opens, 1)
      assert.equal(releases, 1)
      assert.equal(deliveries, 1)
      assert.equal(resumes.length, 1)
      assert.equal(resumes[0].resumeSessionId, meta.id)
      assert.deepEqual(resumes[0].agentOptions, empty ? { provider: 'default', model: 'default-model' } : { provider: 'saved', model: 'saved-model' })
      assert.deepEqual(mounts, [empty ? 'standard' : 'coding'])
      assert.equal(JSON.stringify(events), original, 'Cron must not mutate producer-owned events')
    } finally {
      clearTimeout(timeout)
      for (const dispose of disposers) await dispose?.()
      rmSync(directory, { recursive: true, force: true })
    }
  }

  // Exercise /cron-transfer through the exact tagged modern handle class too.
  // The persistence backend remains synthetic; this certifies API shape,
  // ownership-state normalization, stable revision reads and handle cleanup.
  {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-cron-source-transfer-'))
    const taskFile = join(directory, 'tasks.json')
    const targetMeta = Object.freeze({ id: 'source-target', cwd: directory, agentPreset: 'standard', delegationDepth: 0 })
    const targetEvents = Object.freeze([{ type: 'session/title', data: Object.freeze({ title: 'blank target' }) }])
    const source = { eventState: 'shared-frozen', events: targetEvents }
    let releases = 0
    let opens = 0
    let stats = 0
    const storage = {
      resolveCurrentLog: async () => 'fixture-log',
      readStoredLog: async () => source,
      hasPendingSession: () => false,
      releaseHandle: () => { releases++ },
    }
    const makeHandle = () => new JsonlSessionHandle(storage, targetMeta.id, targetMeta, 'read', {
      cursor: 0, materialized: true, inheritedEventCount: 0,
    })
    const commands = new Map()
    const disposers = []
    const commandAgent = { session: { id: 'command-root' }, followup() {} }
    writeFileSync(taskFile, JSON.stringify({
      version: 1,
      tasks: [{ id: 'source-transfer', prompt: 'fixture only', every: 3600, sessionId: 'source-owner', enabled: true }],
      runs: {},
      overrides: {},
    }, null, 2))
    try {
      apply({
        logger: { info() {}, warn: message => { throw new Error(message) } },
        agents: { roots: () => [commandAgent], resume: async () => { throw new Error('transfer must not resume') } },
        sessionPersistence: {
          stat: async (id, options) => {
            assert.equal(id, targetMeta.id)
            assert.ok(options?.signal instanceof AbortSignal)
            stats++
            return { header: targetMeta, revision: 'source-stable' }
          },
          open: async (id, access) => {
            assert.equal(id, targetMeta.id)
            assert.equal(access, 'read')
            opens++
            return makeHandle()
          },
        },
        agentPresets: { mount: async () => { throw new Error('transfer must not mount') } },
        agentDefaultModel: { currentSelection: () => ({ provider: 'unused', model: 'unused' }) },
        tools: { register() {} },
        get: name => name === 'commands' ? {
          register: definition => { commands.set(definition.name, definition); return () => commands.delete(definition.name) },
        } : undefined,
        on() {}, inject() {}, effect: effect => disposers.push(effect()),
      }, Config({
        storagePath: taskFile,
        historyPath: join(directory, 'history.jsonl'),
        tickSeconds: 60,
        systemNotify: false,
      }))
      const command = commands.get('cron-transfer')
      assert.ok(command)
      const controller = new AbortController()
      const result = await command.handler({
        agent: commandAgent,
        rawInput: JSON.stringify({
          expectedPreset: 'standard',
          expectedCwd: directory,
          transfers: [{ id: 'source-transfer', from: 'source-owner', to: targetMeta.id }],
        }),
        attachments: [],
        signal: controller.signal,
      })
      assert.equal(result.kind, 'success')
      assert.equal(JSON.parse(readFileSync(taskFile, 'utf8')).tasks[0].sessionId, targetMeta.id)
      assert.equal(stats, 4, 'initial/final target reads each stat before and after')
      assert.equal(opens, 2)
      assert.equal(releases, 2, 'both exact tagged read handles close')
    } finally {
      for (const dispose of disposers) await dispose?.()
      rmSync(directory, { recursive: true, force: true })
    }
  }
  console.log(`✓ Core ${version} actual JSONL handle class → Cron cold resume + hot owner transfer; stable detached/shared-frozen reads and cleanup (fake storage/agents)`)
}

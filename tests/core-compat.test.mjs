// Package policy, exact-source declarations, and source-backed cold-read contracts.
import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { CORE_COMMITS, assertSourceIdentity, openCoreSource, assertHandleContract, declaration, loadJsonlHandle } from './core-source.mjs'

const DSH_RANGE = '>=0.1.1-rc.2 <0.1.2-0 || >=0.1.2-alpha.4 <0.1.2 || >=0.1.3-alpha.1 <0.1.3-alpha.2 || 0.1.5-alpha.1 || 0.1.5-alpha.2'
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const requiredPeers = ['agent', 'agent-presets', 'agent-default-model', 'llm', 'session', 'session-persistence', 'tools'].map(name => `@deepseek-ai/dsh-${name}`)
const optionalPeers = ['@deepseek-ai/dsh-host-webserver', '@deepseek-ai/dsh-web']
assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/)
assert.equal(manifest.packageManager, 'pnpm@11.7.0')
assert.equal(manifest.engines.node, '^22.19.0 || >=24.0.0')
for (const name of [...requiredPeers, ...optionalPeers]) {
  assert.equal(manifest.peerDependencies[name], DSH_RANGE, `${name} must retain legacy lines and only add the two exact 0.1.5 alphas`)
}
for (const name of optionalPeers) assert.equal(manifest.peerDependenciesMeta[name]?.optional, true)
assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-layout'))
assert.ok(!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
console.log('✓ package policy retains legacy Core and admits only 0.1.5-alpha.1 / alpha.2 additions')

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
  const modern = version.startsWith('0.1.5-')
  const handles = modern || version === '0.1.3-alpha.1'
  const liveSession = read('packages/core/session/src/index.ts')
  for (const method of ['eventAt(seq: SessionSeq)', 'snapshotEvents(', 'ownEvents(): readonly SessionEvent[]']) {
    assert.ok(liveSession.includes(method), `live Session method unavailable: ${method}`)
  }
  const persistence = read('packages/session/session-persistence/src/index.ts')
  if (handles) {
    assert.match(persistence, /interface SessionPersistenceSnapshot[\s\S]*?readonly header: SessionHeader/)
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
      await verifySourceHandleColdResume(read, version)
    }
  } else {
    assert.match(persistence, /interface SessionInspection[\s\S]*?readonly events: readonly SessionEvent\[\]/)
  }
  assert.match(read('packages/core/tools/src/index.ts'), /interface ToolExecutionInput[\s\S]*?readonly agent\?: Agent/)
  for (const path of ['packages/core/agent', 'packages/core/session', 'packages/host/webserver', 'packages/web/web']) {
    const peer = JSON.parse(read(`${path}/package.json`))
    assert.equal(peer.version, version, `${peer.name} does not match CLI release`)
  }
  const clients = new Map([
    ['@deepseek-ai/dsh-client-locale', 'locale'],
    ['@deepseek-ai/dsh-client-ui-conversation', 'ui-conversation'],
    ['@deepseek-ai/dsh-client-ui-layout', 'ui-layout'],
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
const readMethod = /^(?:0\.1\.3|0\.1\.5)-/.test(installed) ? 'open' : 'inspect'
assert.equal(typeof JsonlSessionPersistence?.prototype?.[readMethod], 'function')
console.log(`✓ installed Core ${installed} capability probe only; no exact source or live Host verification`)

async function verifySourceHandleColdResume(read, version) {
  const JsonlSessionHandle = loadJsonlHandle(read)
  const { apply, Config } = await import('../index.js')
  // Use the actual tagged read/readCurrent/readPrimed/close implementation with
  // fake storage and AgentRegistry. This does not test JSONL IO or migrations.
  for (const [eventState, empty, primed] of [
    ['detached', false, false], ['shared-frozen', false, false],
    ['detached', true, false], ['shared-frozen', true, true],
  ]) {
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
    } finally { await probe.close() }
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
  console.log(`✓ Core ${version} actual JSONL handle class → Cron cold resume; detached/shared-frozen, empty/current/primed slices, model/preset and close-before-resume (fake storage/agents)`)
}

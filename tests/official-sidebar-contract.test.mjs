// Issue34 public native-sidebar contracts against an exact allowlisted Core ref.
// DSH_CORE_PATH + optional DSH_NATIVE_CORE_REF/DSH_CORE_REF (otherwise HEAD).
// Missing native API is an explicit skip, not a compatibility success.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'
import { coreBlob, CORE_REV, SIDEBAR, upstreamHarness, nativeCoreSkipReason } from './fixtures/official-sidebar/upstream.mjs'
const nativeOptions = { skip: nativeCoreSkipReason() }

function nativeAdapter() {
  const path = new URL('../src/client/native-sidebar.ts', import.meta.url)
  assert.ok(existsSync(path), 'Cron must implement the native two-stage registration contract (old Cron has no native adapter)')
  const source = readFileSync(path, 'utf8')
  const module = { exports: {} }
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('module', 'exports', code)(module, module.exports)
  return module.exports
}
function declaration(source, name) {
  const ast = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true)
  const node = ast.statements.find(statement => statement.name?.text === name)
  assert.ok(node, `upstream declares ${name}`)
  return node
}
const memberNames = node => node.members.map(member => member.name?.getText())

test(`exact upstream public contracts at ${CORE_REV}`, nativeOptions, () => {
  const registry = coreBlob(SIDEBAR + 'tab-registry.ts')
  const slots = coreBlob(SIDEBAR + 'contract/slots.ts')
  const service = coreBlob(SIDEBAR + 'service.ts')
  const definition = declaration(registry, 'SidebarRightTabDefinition')
  for (const field of ['id', 'kind', 'title']) assert.ok(memberNames(definition).includes(field))
  assert.match(slots, /'sidebar\.right\.pane\.tab':\s*\{\s*kind: 'keyed'\s*scope: 'session'/)
  assert.match(slots, /dispatched with the `id` of the type in force/)
  const controller = memberNames(declaration(service, 'ISidebarRight'))
  assert.ok(controller.includes('openTab'))
  assert.ok(!controller.includes('getSnapshot'), 'public controller is not a snapshot store')
  assert.ok(!controller.includes('openTabIn'), 'private cross-session navigation is not a public service method')
  assert.deepEqual(memberNames(declaration(service, 'SidebarRightPlacement')), ['paneId', 'replaceTab', 'revealIfOpened'])
  assert.deepEqual(memberNames(declaration(service, 'SidebarRightOpenTabOptions')), ['params'])
  assert.match(slots, /readonly visible: boolean/)
  assert.match(slots, /readonly signal: AbortSignal/)
  assert.match(slots, /readonly actions: SidebarRightTabActions/)
  const files = coreBlob('packages/client/ui-sidebar-files/src/client/FilesBody.tsx')
  assert.match(files, /export function FilesBody\(\{\s*useTabInfo, sessionId, useSessions,/)
  assert.match(files, /const \{ signal, actions: tabActions \} = tab/)
  const registration = coreBlob('packages/client/ui-sidebar-files/src/client/index.ts')
  assert.match(registration, /sidebarRightTabs\.register\(filesDefinition\(t\)\)/)
  assert.match(registration, /name: 'sidebar\.right\.pane\.tab', key: FILES_ID/)
  const tabInfo = coreBlob(SIDEBAR + 'tab-info.ts')
  assert.match(tabInfo, /pane\.host === 'float' \|\| \(layout\.expanded && \(title \|\| pane\.activeTabId === tabId\)\)/)
})

test('Cron structural adapter has no new Core runtime dependency or private controller inventions', () => {
  nativeAdapter()
  for (const file of ['native-sidebar.ts', 'index.tsx']) {
    const source = readFileSync(new URL('../src/client/' + file, import.meta.url), 'utf8')
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    for (const statement of ast.statements) {
      if (!ts.isImportDeclaration(statement)) continue
      if (statement.importClause?.isTypeOnly) continue
      assert.doesNotMatch(statement.moduleSpecifier.text, /dsh-client-ui-sidebar-right/, 'older accepted Core must not load a new runtime module')
    }
    assert.doesNotMatch(source, /\.(?:openTabIn|openResourceIn)\s*\(/)
    assert.doesNotMatch(source, /(?:sidebarRight|nativeSidebar)\??\.getSnapshot\s*\(/)
  }
})

test('actual upstream registry accepts both Cron stages; does not change Files initial guide; release is reversible', nativeOptions, async () => {
  const h = upstreamHarness()
  try {
    const native = nativeAdapter()
    const initialPage = h.seed().kind
    const initialGuides = h.tabs.guide().map(entry => entry.kind)
    const effects = []
    const bodies = new Map()
    const readiness = []
    const body = () => null
    const inner = {
      get: name => name === 'sidebarRightTabs' ? h.tabs : h.controller,
      effect: callback => { const dispose = callback(); effects.push(dispose); return dispose },
      slots: { inject: (name, callback) => { assert.equal(name, 'sidebar.right.pane.tab'); return callback() },
        register: (spec, component) => { assert.equal(spec.key, native.NATIVE_CRON_ID); assert.equal(spec.locale, 'cron'); bodies.set(spec.key, component); return () => bodies.delete(spec.key) } },
    }
    native.registerNativeSidebar({ inject: (names, callback) => { assert.deepEqual(names, ['sidebarRightTabs', 'sidebarRight']); callback(inner) } }, body, () => 'Scheduled tasks', value => readiness.push(value))
    const definition = h.tabs.get(native.NATIVE_CRON_KIND)
    assert.equal(definition.id, native.NATIVE_CRON_ID)
    assert.equal(bodies.get(definition.id), body)
    assert.equal(definition.guide, undefined)
    assert.equal(h.seed().kind, initialPage, 'Cron registration must preserve the selected baseline initial page')
    assert.deepEqual(h.tabs.guide().map(entry => entry.kind), initialGuides, 'Cron must not change native Files guide entries')
    assert.equal(readiness.at(-1), h.controller)
    assert.throws(() => h.tabs.register(definition), /already registered/)
    effects.reverse().forEach(dispose => dispose())
    assert.equal(readiness.at(-1), null)
    assert.equal(h.tabs.get(native.NATIVE_CRON_KIND), undefined)
    assert.equal(bodies.size, 0)
    assert.equal(h.seed().kind, initialPage)
  } finally { await h.dispose() }
})

test('unchanged upstream controller/store/planners deduplicate pages, carry params, bind A/B actions and abort records', nativeOptions, async () => {
  const h = upstreamHarness()
  try {
    const native = nativeAdapter()
    h.tabs.register(native.nativeDefinition(() => 'Scheduled tasks'))
    assert.equal('getSnapshot' in h.controller, false)
    h.mount('fixture-owner-A')
    assert.equal(native.openNative(h.controller, 'fixture-owner-A', 'fixture-owner-A', 'tasks'), true)
    let a = Object.values(h.layout('fixture-owner-A').tabs).find(tab => tab.kind === native.NATIVE_CRON_KIND)
    assert.ok(a)
    const first = h.occurrence('fixture-owner-A', a.id)
    assert.equal(first.navigation.getSnapshot().params.view, 'tasks')
    const revision = first.navigation.getSnapshot().revision
    native.openNative(h.controller, 'fixture-owner-A', 'fixture-owner-A', 'history')
    assert.equal(Object.values(h.layout('fixture-owner-A').tabs).filter(tab => tab.kind === native.NATIVE_CRON_KIND).length, 1)
    assert.equal(first.navigation.getSnapshot().params.view, 'history')
    assert.ok(first.navigation.getSnapshot().revision > revision)
    h.mount('fixture-owner-B')
    assert.equal(native.openNative(h.controller, 'fixture-owner-A', 'fixture-owner-B', 'tasks'), false, 'stale owner must use owner-safe fallback, not mounted B')
    assert.equal(Object.values(h.layout('fixture-owner-B').tabs).filter(tab => tab.kind === native.NATIVE_CRON_KIND).length, 0)
    // Only the genuine occurrence-bound public tab action may target A after switching.
    first.tabActions.openTab(native.NATIVE_CRON_KIND, { params: { view: 'tasks' } })
    assert.equal(first.navigation.getSnapshot().params.view, 'tasks')
    assert.equal(Object.values(h.layout('fixture-owner-B').tabs).filter(tab => tab.kind === native.NATIVE_CRON_KIND).length, 0)
    assert.equal(first.signal.aborted, false, 'session switch alone does not abort an occurrence')
    h.mount('fixture-owner-A')
    h.controller.toggleExpanded()
    assert.equal(first.signal.aborted, false, 'hide alone does not close a record')
    first.tabActions.close()
    assert.equal(first.signal.aborted, true)
    h.controller.openTab(native.NATIVE_CRON_KIND)
    a = Object.values(h.layout('fixture-owner-A').tabs).find(tab => tab.kind === native.NATIVE_CRON_KIND)
    const restored = h.occurrence('fixture-owner-A', a.id)
    assert.notEqual(restored.signal, first.signal)
    h.controller.tabDomain.dispose()
    assert.equal(restored.signal.aborted, true)
    assert.ok(h.loaded().includes('packages/client/ui-dockkit/src/engine/planner.ts'))
    assert.ok(h.loaded().includes('packages/client/store/src/index.ts'))
  } finally { await h.dispose() }
})

test('moving an inactive native Cron tab through the actual store activates its destination and preserves occurrence', nativeOptions, async () => {
  const h = upstreamHarness()
  try {
    const native = nativeAdapter(), owner = 'fixture-owner-A'
    h.tabs.register(native.nativeDefinition(() => 'Scheduled tasks'))
    h.mount(owner)
    h.controller.openTab(native.NATIVE_CRON_KIND, { params: { view: 'tasks' } })
    const cron = Object.values(h.layout(owner).tabs).find(tab => tab.kind === native.NATIVE_CRON_KIND)
    const occurrence = h.occurrence(owner, cron.id)
    const source = Object.values(h.layout(owner).nodes).find(node => node.kind === 'pane' && node.tabs.includes(cron.id))
    h.controller.openTab('files', { paneId: source.id })
    assert.notEqual(h.layout(owner).nodes[source.id].activeTabId, cron.id, 'Cron body is inactive before the move')
    const destination = h.controller.split(source.id)
    assert.ok(destination)
    // The genuine seat-bound store action, as the upstream strip release uses;
    // this is NOT a made-up public controller move/openTabIn method.
    h.stores.get(owner).actions.placeTab(owner, cron.id, destination, 0)
    assert.equal(h.layout(owner).activePaneId, destination)
    assert.equal(h.layout(owner).nodes[destination].activeTabId, cron.id, 'real move activates the destination body')
    assert.equal(h.occurrence(owner, cron.id), occurrence)
    assert.equal(occurrence.signal.aborted, false)
    occurrence.tabActions.openTab(native.NATIVE_CRON_KIND, { params: { view: 'history' } })
    assert.equal(Object.values(h.layout(owner).tabs).filter(tab => tab.kind === native.NATIVE_CRON_KIND).length, 1)
    assert.equal(occurrence.navigation.getSnapshot().params.view, 'history')
    const render = coreBlob('packages/client/ui-dockkit/src/components/TabPanel.tsx')
    assert.match(render, /const active = pane\.activeTabId === undefined \? undefined : getTab\(state, pane\.activeTabId\)/)
    assert.match(render, /callbacks\.renderTab\(active\)/, 'upstream renders the activated destination, not every inactive body')
  } finally { await h.dispose() }
})

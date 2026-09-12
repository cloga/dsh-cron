// Pure, dependency-free contract tests. No Host, browser, timers or task mutations.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
const source = readFileSync(new URL('../src/client/native-sidebar.ts', import.meta.url), 'utf8')
const api = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('native public capabilities and page definition keep the Files first-open default', () => {
  assert.equal(api.supportsNativeSidebar(undefined, undefined), false)
  assert.equal(api.supportsNativeSidebar({ register() {} }, { openTab() {} }), true)
  assert.equal(api.supportsNativeSidebar({ register() {} }, { openTabIn() {} }), false)
  const definition = api.nativeDefinition(() => 'Scheduled tasks')
  assert.equal(definition.id, api.NATIVE_CRON_ID)
  assert.equal(definition.kind, api.NATIVE_CRON_KIND)
  assert.equal(definition.title(''), 'Scheduled tasks')
  assert.equal(definition.priority, 'extension')
  assert.equal(definition.guide, undefined)
  assert.equal(definition.patterns, undefined)
})

test('owner title uses the real displayTitle leaf, never a UUID or another owner', () => {
  const sessions = { current: 'A', byId: { A: { displayTitle: 'Weekly report', title: 'wrong leaf' }, B: { displayTitle: 'Other' } } }
  assert.equal(api.ownerTitle(sessions, 'A', 'New session'), 'Weekly report')
  assert.equal(api.ownerTitle(sessions, 'C', 'New session'), 'New session')
  assert.equal(api.ownerTitle({ byId: { A: { displayTitle: 'A' } } }, 'A', 'New session'), 'New session')
  assert.equal(api.ownerTitle({ byId: { A: { displayTitle: 'Stored', blank: true } } }, 'A', 'New session'), 'New session')
})

test('multiple pane consumers retain visibility and exact native pane independently', () => {
  const consumers = api.createPanelConsumers()
  const a = new AbortController(), b = new AbortController()
  const releaseA = consumers.add({ sessionId: 'A', visible: true, paneId: 'dock', tabId: '1', signal: a.signal })
  const releaseB = consumers.add({ sessionId: 'A', visible: true, paneId: 'float', tabId: '2', signal: b.signal })
  assert.equal(consumers.visible('A'), true)
  releaseA(); releaseA()
  assert.equal(consumers.visible('A'), true, 'one unmount cannot clear another visible pane')
  assert.equal(consumers.pane('A'), 'float')
  b.abort()
  assert.equal(consumers.visible('A'), false)
  assert.equal(consumers.pane('A'), 'dock', 'unmounted inactive body keeps its native occurrence until abort')
  a.abort()
  assert.equal(consumers.pane('A'), undefined)
  releaseB()
  const hidden = consumers.add({ sessionId: 'A', visible: false, paneId: 'hidden', tabId: '3' })
  assert.equal(consumers.visible('A'), false)
  assert.equal(consumers.pane('A'), 'hidden', 'hidden tab remains a dedupe target')
  assert.equal(consumers.pane('B'), undefined)
  hidden(); consumers.clear()
  const live = new AbortController()
  consumers.add({ sessionId: 'A', visible: true, paneId: 'new-dock', tabId: 'new', signal: live.signal })()
  assert.equal(consumers.pane('A'), 'new-dock')
  consumers.clearNative()
  assert.equal(consumers.pane('A'), undefined, 'provider disposal forgets native occurrences without waiting for React')
})

test('native open is current-owner-only and targets a known pane for page dedupe', () => {
  const calls = []
  const controller = { openTab: (...args) => calls.push(args) }
  assert.equal(api.openNative(controller, 'A', 'B', 'history', 'pane-a'), false)
  assert.equal(calls.length, 0, 'old-session toast never navigates the mounted session')
  assert.equal(api.openNative(controller, 'A', 'A', 'history', 'float-a'), true)
  assert.deepEqual(calls[0], [api.NATIVE_CRON_KIND, { params: { view: 'history' }, revealIfOpened: true, paneId: 'float-a' }])
  assert.equal(api.openNative(null, 'A', 'A', 'tasks'), false)
})

test('request lease rejects hidden, aborted, old-owner and superseded results', () => {
  const controller = new AbortController()
  let owner = 'A'
  const lease = api.createRequestLease('A', () => owner, controller.signal)
  const first = lease.begin(), next = lease.begin()
  assert.equal(lease.accepts(first), false)
  assert.equal(lease.accepts(next), true)
  owner = 'B'; assert.equal(lease.accepts(next), false)
  owner = 'A'; controller.abort(); assert.equal(lease.accepts(next), false)
  const hidden = api.createRequestLease('A', () => 'A')
  const request = hidden.begin(); hidden.stop()
  assert.equal(hidden.accepts(request), false)
})

test('native registration follows both service and slot arrival/removal, keyed by definition id', () => {
  let injectCallback, slotCallback, outerDispose, seatDispose, ready = null
  const definitions = [], registrations = [], releases = []
  const service = { openTab() {} }
  const inner = {
    get: name => name === 'sidebarRight' ? service : { register: def => { definitions.push(def); return () => releases.push('type') } },
    effect: fn => { outerDispose = fn(); return outerDispose },
    slots: { inject: (name, fn) => { assert.equal(name, 'sidebar.right.pane.tab'); slotCallback = fn; return () => seatDispose?.() },
      register: (spec, body) => { registrations.push({ spec, body }); return () => releases.push('body') } },
  }
  api.registerNativeSidebar({ inject: (names, fn) => { assert.deepEqual(names, ['sidebarRightTabs', 'sidebarRight']); injectCallback = fn } }, () => null, () => 'Cron', value => { ready = value })
  assert.equal(ready, null)
  injectCallback(inner)
  assert.equal(ready, null, 'service alone is not a usable body seat')
  seatDispose = slotCallback()
  assert.equal(ready, service)
  assert.equal(registrations[0].spec.key, definitions[0].id)
  assert.equal(registrations[0].spec.locale, 'cron')
  seatDispose(); assert.equal(ready, null)
  seatDispose = slotCallback(); assert.equal(ready, service)
  outerDispose(); assert.equal(ready, null)
  assert.deepEqual(releases, ['body', 'type', 'body', 'type'])
})

test('registration failure rolls back the definition and leaves fallback available', context => {
  context.mock.method(console, 'warn', () => {})
  let removed = 0, ready = null
  const service = { openTab() {} }
  const inner = { get: name => name === 'sidebarRight' ? service : { register: () => () => removed++ },
    effect: fn => fn(), slots: { inject: (_name, fn) => fn(), register: () => { throw new Error('fixture seat unavailable') } } }
  api.registerNativeSidebar({ inject: (_names, fn) => fn(inner) }, () => null, () => 'Cron', value => { ready = value })
  assert.equal(removed, 1)
  assert.equal(ready, null)
})

test('legacy adapter still gates versions/features and reveals right, bottom and floats', async () => {
  const legacySource = readFileSync(new URL('../src/client/sidebar.ts', import.meta.url), 'utf8')
  const legacy = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(legacySource)).toString('base64')}`)
  const service = { version: '0.18.0', features: ['targetedOpen', 'floatWindows'], registerTab() {}, openTab() {}, isTabEnabled() {}, getSnapshot() {} }
  assert.equal(legacy.supportsSidebar(service), true)
  assert.equal(legacy.supportsSidebar({ ...service, version: '0.17.9' }), false)
  assert.equal(legacy.supportsSidebar({ ...service, features: [] }), false)
  const state = { activePane: 'bottom', splits: { kind: 'leaf', id: 'right', tabs: [] }, bottomSplits: { kind: 'leaf', id: 'bottom', tabs: [] }, floats: [] }
  assert.deepEqual(legacy.createSidebarTab(state, 'Cron', 1200).patch, { bottomOpen: true })
  assert.deepEqual(legacy.createSidebarTab(state, 'Cron', 500).patch, { panelOpen: true })
  assert.equal(legacy.createSidebarTab({ ...state, floats: [{ tab: { id: legacy.CRON_TAB_ID } }] }, 'Cron', 1200).patch, undefined)
})

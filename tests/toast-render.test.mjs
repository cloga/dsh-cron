// Real React + portals, deterministic timers, and the optional Sidebar contract.
// jsdom verifies behavior/ownership; native dialog layout/focus needs browser tests.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div><div id="sidebar"></div></body></html>', { url: 'http://127.0.0.1:3080/', pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, KeyboardEvent: dom.window.KeyboardEvent, IS_REACT_ACT_ENVIRONMENT: true })
// Track settings-only observers/listeners so disclosure lifecycle cannot leak.
const liveObservers = new Set()
const originalObserver = globalThis.ResizeObserver
class MockResizeObserver {
  constructor() { liveObservers.add(this) }
  observe() {}
  disconnect() { liveObservers.delete(this) }
}
globalThis.ResizeObserver = MockResizeObserver
const trackedListeners = { pointerdown: new Set(), keydown: new Set() }
const addDocumentListener = document.addEventListener.bind(document)
const removeDocumentListener = document.removeEventListener.bind(document)
document.addEventListener = (type, listener, options) => { trackedListeners[type]?.add(listener); addDocumentListener(type, listener, options) }
document.removeEventListener = (type, listener, options) => { trackedListeners[type]?.delete(listener); removeDocumentListener(type, listener, options) }
// jsdom does not implement the top-layer dialog API.
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
const intervals = new Map()
let nextInterval = 1
const originalInterval = globalThis.setInterval
const originalClearInterval = globalThis.clearInterval
globalThis.setInterval = (fn, ms) => { const id = nextInterval++; intervals.set(id, { fn, ms }); return id }
globalThis.clearInterval = id => intervals.delete(id)
const react = (await import('react')).default
const jsxRuntime = await import('react/jsx-runtime')
const reactDom = await import('react-dom')
const { createRoot } = await import('react-dom/client')
const { act } = react
const registrations = []
window.__ModuleLoader__ = { load: registration => registrations.push(registration) }
eval(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
const plugin = registrations[0].factory(name => {
  if (name === 'react') return react
  if (name === 'react/jsx-runtime') return jsxRuntime
  if (name === 'react-dom') return reactDom
  throw new Error('unexpected require: ' + name)
})
const t = (key, params) => key + (params ? ':' + Object.values(params).join(',') : '')
const root = createRoot(document.getElementById('root'))
const sideRoot = createRoot(document.getElementById('sidebar'))
const slots = new Map()
const cleanup = []
let optionalCallback
let bridgeCleanup = []
const ctx = {
  effect: fn => { const dispose = fn(); if (dispose) cleanup.push(dispose) },
  inject: (names, callback) => { assert.deepEqual(names, ['betterSidebar']); optionalCallback = callback },
  locale: { register: () => () => {}, bind: () => t },
  slots: {
    inject: (_key, callback) => callback(),
    register: (spec, component) => { slots.set(spec.id, component); return () => {} },
  },
}
plugin.apply(ctx)
const requests = []
let pendingList = null
let pendingAction = null
let completeRun = false
let extraCompleted = 0
const task = owner => ({ id: 'task-' + owner, prompt: 'prompt-' + owner, enabled: true, origin: 'dynamic', sessionId: owner, schedule: { everySeconds: 60 }, lastRunAt: null, nextRunAt: null })
globalThis.fetch = async (url, options) => {
  const payload = JSON.parse(options.body)
  requests.push({ method: url.split('/').at(-1), payload })
  const owner = payload.sessionId
  assert.ok(owner, 'every request has an explicit owner')
  if (url.endsWith('/list') && pendingList?.owner === owner) await pendingList.promise
  if (url.endsWith('/run') && pendingAction) await pendingAction
  const result = url.endsWith('/list') ? { tasks: [task(owner)] }
    : url.endsWith('/history') ? { records: [{ id: 'run-' + owner, taskId: 'task-' + owner, sessionId: owner, prompt: '', scheduledFor: '', firedAt: '', status: completeRun ? 'completed' : 'delivered', excerpt: 'result-' + owner }, ...Array.from({ length: extraCompleted }, (_, i) => ({ id: `extra-${owner}-${i}`, taskId: 'task-' + owner, sessionId: owner, prompt: '', scheduledFor: '', firedAt: '', status: 'completed', excerpt: 'extra result' }))] } : {}
  return { json: async () => ({ ok: true, result }) }
}
const render = async (owner = 'A') => act(async () => {
  root.render(react.createElement(react.Fragment, null,
    react.createElement(slots.get('cron-trigger'), { t, sessionId: owner }),
    react.createElement(slots.get('cron-drawer'), { t })))
})
const findButton = (label, scope = document) => [...scope.querySelectorAll('button')].find(button => button.textContent === label || button.getAttribute('aria-label') === label)
const click = async button => { assert.ok(button, 'button exists'); await act(async () => button.click()) }
const cancel = async () => act(async () => document.querySelector('dialog').dispatchEvent(new dom.window.Event('cancel', { cancelable: true })))
const poll = async ms => act(async () => { for (const timer of [...intervals.values()]) if (timer.ms === ms) await timer.fn() })
const openSettings = async (scope = document.querySelector('dialog') ?? document.querySelector('.dsh-cron-sidebarPanel')) => {
  const details = scope.querySelector('.dsh-cron-settings')
  assert.ok(details)
  if (!details.open) await click(details.querySelector('summary'))
  assert.ok(details.open)
  return details
}
const escapeSettings = async details => {
  const target = details.querySelector('button')
  target.focus()
  const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  await act(async () => target.dispatchEvent(event))
  assert.equal(details.open, false)
  assert.ok(event.defaultPrevented, 'settings handles Escape before dialog cancellation')
  assert.equal(document.activeElement, details.querySelector('summary'), 'Escape restores disclosure focus')
}

await render()
const stableEntry = document.querySelector('#root .dsh-cron-trigger')
function assertClock(open) {
  const entry = document.querySelector('#root .dsh-cron-trigger')
  assert.equal(entry, stableEntry, 'entry DOM node remains mounted across states')
  assert.ok(entry.classList.contains('dsh-cron-triggerCompact'))
  assert.equal(entry.querySelectorAll('svg').length, 1)
  assert.equal(entry.querySelector('.dsh-cron-triggerLabel'), null, 'never switch back to text')
  assert.equal(entry.querySelector('.dsh-cron-count'), null, 'enabled count does not change width')
  assert.equal(entry.getAttribute('aria-label'), 'trigger.aria')
  assert.ok(entry.getAttribute('aria-description').startsWith('trigger.summary:'))
  assert.ok(entry.title.includes(entry.getAttribute('aria-description')), 'count summary remains discoverable')
  if (open !== undefined) assert.equal(entry.getAttribute('aria-expanded'), String(open))
  return entry
}
assertClock(false)
assert.equal(document.querySelector('dialog'), null, 'no hidden focusable fallback panel')
assert.equal(document.querySelector('.dsh-cron-toastStack').parentElement, document.body, 'real body portal')
assert.equal(intervals.size, 1, 'one owner watcher while closed')
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog[open]'), 'standalone fallback opens')
assertClock(true)
assert.ok(document.querySelector('dialog').textContent.includes('prompt-A'))
assert.equal(intervals.size, 2, 'only visible panel polls')
assert.equal(document.querySelectorAll('dialog .dsh-cron-drawerTitle').length, 1, 'fallback retains its title')
assert.equal(document.querySelectorAll('dialog .dsh-cron-owner').length, 1, 'fallback has one explicit owner')
assert.ok(document.querySelector('dialog .dsh-cron-owner').textContent.includes('A'))
const fallbackSettings = await openSettings()
await escapeSettings(fallbackSettings)
assert.ok(document.querySelector('dialog[open]'), 'closing settings must not close fallback')
await openSettings()
await click(findButton('drawer.test'))
assert.ok(document.querySelector('.dsh-cron-toast'), 'test notification produces a real toast')
assert.ok(document.querySelector('dialog .dsh-cron-toast'), 'modal toast stays within the active top-layer context')
await click(document.querySelector('.dsh-cron-toast'))
assert.ok(document.querySelector('dialog').textContent.includes('result-A'), 'toast works without closing the modal first')
await openSettings()
await click(findButton('drawer.test'))
await cancel()
assert.equal(document.querySelector('dialog'), null)
assert.equal(intervals.size, 1, 'closed panel stops polling')
await click(document.querySelector('.dsh-cron-toast'))
assert.ok(document.querySelector('dialog').textContent.includes('result-A'), 'toast opens owner history')
await cancel()
console.log('✓ standalone dialog, portal, toast routing and polling cleanup')

// A watcher primes per session: a finished record in B is not new activity.
completeRun = true
await render('B')
assert.equal(document.querySelectorAll('.dsh-cron-toast').length, 0, 'new owner primes independently')
completeRun = false
await render('A')
completeRun = true
await poll(20_000)
assert.equal(document.querySelectorAll('.dsh-cron-toast').length, 1, 'new terminal status notifies once')
assertClock(false)
assert.equal(stableEntry.querySelector('.dsh-cron-unreadBadge').textContent, '1', 'icon keeps unread feedback')
assert.equal(stableEntry.getAttribute('aria-description'), 'trigger.summary:1,1')
await poll(20_000)
assert.equal(document.querySelectorAll('.dsh-cron-toast').length, 1, 'repeated terminal state does not duplicate')
await click(document.querySelector('.dsh-cron-toast'))
await cancel()
console.log('✓ watcher owner reset and terminal-state deduplication')

const TAB = 'dsh-cron:tasks'
let descriptor
let enabled = true
let serviceOwner = 'A'
let currentVisible = true
const opens = []
const leaf = (id, tabs = []) => ({ kind: 'leaf', id, tabs, active: tabs[0]?.id ?? null })
const baseState = () => ({ panelOpen: false, bottomOpen: false, activePane: 'right', splits: leaf('right'), bottomSplits: leaf('bottom'), floats: [] })
const service = {
  version: '0.18.0', features: ['targetedOpen', 'floatWindows'],
  registerTab: value => { descriptor = value; return () => { descriptor = null; sideRoot.render(null) } },
  getSnapshot: () => ({ sessionId: serviceOwner }),
  isTabEnabled: () => enabled,
  openTab: (seed, scope) => {
    opens.push({ seed, scope })
    assert.equal(seed.type, TAB)
    assert.equal(scope.sessionId, serviceOwner)
    sideRoot.render(react.createElement(descriptor.component, { scope, visible: currentVisible }))
  },
}
async function attach(value = service) {
  await act(async () => optionalCallback({ get: () => value, effect: fn => { const dispose = fn(); if (dispose) bridgeCleanup.push(dispose) } }))
}
await attach({ ...service, version: '0.17.0' })
assert.equal(descriptor, undefined, 'unsupported versions leave fallback intact')
await attach({ ...service, features: [] })
assert.equal(descriptor, undefined, 'missing required capabilities leave fallback intact')
await attach()
assert.equal(descriptor.id, TAB)
assert.equal(descriptor.single, true)
assert.deepEqual(descriptor.createTab(baseState()).patch, { panelOpen: true })
const bottom = baseState(); bottom.activePane = 'bottom'
assert.deepEqual(descriptor.createTab(bottom).patch, { bottomOpen: true }, 'new tab opens active bottom pane')
const existing = baseState(); existing.bottomSplits.tabs = [{ id: TAB, type: TAB, title: 'Cron' }]
assert.deepEqual(descriptor.createTab(existing).patch, { bottomOpen: true }, 'dedupe opens existing bottom pane')
const detached = baseState(); detached.floats = [{ tab: { id: TAB, type: TAB, title: 'Cron' } }]
assert.equal(descriptor.createTab(detached).patch, undefined, 'float does not expand unrelated panels')
const oldWidth = window.innerWidth
window.innerWidth = 500
assert.deepEqual(descriptor.createTab(bottom).patch, { panelOpen: true }, 'narrow view reveals merged drawer')
window.innerWidth = oldWidth
assert.equal(bottom.bottomOpen, false, 'adapter does not mutate source state')
await click(findButton('trigger.aria'))
assert.equal(document.querySelector('dialog'), null, 'sidebar mode has no independent dialog/mask')
assert.ok(document.querySelector('.dsh-cron-sidebarPanel'))
const embedded = document.querySelector('.dsh-cron-sidebarPanel')
assert.equal(embedded.querySelector('.dsh-cron-drawerHead'), null, 'host tab supplies title; no inner header')
assert.equal(embedded.querySelector('.dsh-cron-drawerTitle'), null, 'no repeated visible panel title')
assert.equal(embedded.querySelectorAll('.dsh-cron-toolbar').length, 1, 'one compact toolbar')
assert.equal(embedded.querySelectorAll('.dsh-cron-owner').length, 1, 'owner remains discoverable once')
assert.ok(embedded.querySelector('.dsh-cron-owner').closest('details'), 'embedded owner is inside closed settings')
assert.equal(embedded.querySelector('details').open, false, 'Session UUID is not permanently displayed')
const headerEntry = document.querySelector('#root .dsh-cron-trigger')
assert.ok(headerEntry.classList.contains('dsh-cron-triggerCompact'), 'visible owner sidebar uses compact entry')
assert.equal(headerEntry.getAttribute('aria-label'), 'trigger.aria', 'icon keeps accessible name')
assert.equal(headerEntry.getAttribute('aria-expanded'), 'true')
assert.equal(headerEntry.querySelector('.dsh-cron-count'), null, 'compact entry does not repeat count')
const settings = await openSettings(embedded)
assert.ok(settings.querySelector('.dsh-cron-owner').textContent.includes('A'))
const sound = findButton('prefs.soundShort', settings)
const wasPressed = sound.getAttribute('aria-pressed')
await click(sound)
assert.notEqual(sound.getAttribute('aria-pressed'), wasPressed, 'preference control still works')
await click(sound)
await escapeSettings(settings)
await openSettings(embedded)
await act(async () => document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })))
assert.equal(settings.open, false, 'outside pointer dismisses settings')
await click(headerEntry)
assert.equal(document.querySelectorAll('.dsh-cron-sidebarPanel').length, 1, 'compact entry still reveals same tab')
assert.deepEqual(opens.at(-1), { seed: { type: TAB }, scope: { sessionId: 'A' } })
await click(findButton('tab.tasks'))
await click(findButton('action.run'))
assert.deepEqual(requests.findLast(request => request.method === 'run').payload, { id: 'task-A', sessionId: 'A' })
await click(findButton('action.pause'))
assert.deepEqual(requests.findLast(request => request.method === 'toggle').payload, { id: 'task-A', enabled: false, sessionId: 'A' })
await click(findButton('action.edit'))
await click(findButton('action.save'))
assert.deepEqual(requests.findLast(request => request.method === 'update').payload, { id: 'task-A', prompt: 'prompt-A', every: 60, sessionId: 'A' })
await click(findButton('action.remove'))
assert.deepEqual(requests.findLast(request => request.method === 'remove').payload, { id: 'task-A', sessionId: 'A' })
let finishAction
pendingAction = new Promise(resolve => { finishAction = resolve })
await click(findButton('action.run'))
await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: false })))
const readsBeforeCompletion = requests.filter(request => ['list', 'history'].includes(request.method)).length
await act(async () => { finishAction(); pendingAction = null })
assert.equal(requests.filter(request => ['list', 'history'].includes(request.method)).length, readsBeforeCompletion, 'late mutation must not restart hidden panel reads')
await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: true })))
console.log('✓ optional service arrival, reveal destinations, all mutation owners and late-mutation cleanup')

await openSettings(document.querySelector('.dsh-cron-sidebarPanel'))
await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: false })))
assert.equal(document.querySelector('.dsh-cron-settings').open, false, 'hidden panel dismisses settings')
assertClock(false) // another tab / collapsed pane uses the same clock, not text
assert.equal(intervals.size, 1, 'inactive sidebar tab pauses panel polling')
await act(async () => sideRoot.render(react.createElement(descriptor.component, { scope: { sessionId: 'A' }, visible: true })))
assert.equal(intervals.size, 2)
await openSettings()
await click(findButton('drawer.test')) // toast belongs to A, then switch session
serviceOwner = 'B'
await render('B')
await act(async () => service.openTab({ type: TAB }, { sessionId: 'B' }))
assert.ok(document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-B'))
assert.ok(!document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-A'))
await click(document.querySelector('.dsh-cron-toast'))
assert.ok(document.querySelector('dialog').textContent.includes('result-A'), 'old-session notification stays pinned to A')
assert.ok(document.querySelector('dialog .dsh-cron-owner').textContent.includes('A'), 'cross-session fallback still visibly identifies original owner')
assert.equal(document.querySelector('dialog .dsh-cron-owner').closest('details'), null, 'cross-session owner is never tucked inside settings')
assert.ok(document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-B'), 'old notification does not replace B state')
await cancel()
console.log('✓ session-isolated panel state, hidden polling and old-session toast fallback')

// Late A responses must not overwrite a newly mounted B panel or badge.
let release
pendingList = { owner: 'A', promise: new Promise(resolve => { release = resolve }) }
serviceOwner = 'A'
await render('A')
await act(async () => service.openTab({ type: TAB }, { sessionId: 'A' }))
serviceOwner = 'B'
await render('B')
await act(async () => service.openTab({ type: TAB }, { sessionId: 'B' }))
await act(async () => { release(); pendingList = null })
assert.ok(document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-B'))
assert.ok(!document.querySelector('.dsh-cron-sidebarPanel').textContent.includes('prompt-A'))
enabled = false
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog'), 'disabled tab type falls back without overriding user setting')
assertClock(true)
await cancel()
await act(async () => { for (const dispose of bridgeCleanup.splice(0).reverse()) dispose() })
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog'), 'service removal restores independent panel')
await cancel()
await attach({ ...service, registerTab: () => { throw new Error('expected registration failure') } })
assert.equal(descriptor, null, 'registration failure does not install a broken bridge')
await click(findButton('trigger.aria'))
assert.ok(document.querySelector('dialog'), 'registration failure retains fallback')
await cancel()
await attach()
assert.ok(descriptor, 'service can return without duplicate registration')
const originalOpen = service.openTab
enabled = true
let failedOpenAttempts = 0
service.openTab = () => { failedOpenAttempts++; throw new Error('expected open failure') }
await click(findButton('trigger.aria'))
assert.equal(failedOpenAttempts, 1, 'failure case actually attempts the enabled sidebar open')
assert.ok(document.querySelector('dialog'), 'open failure falls back without losing access')
await cancel()
service.openTab = originalOpen
console.log('✓ stale-response guard, disabled tab, service disposal, reattachment and failures')
assertClock(false)
extraCompleted = 100
await poll(20_000)
assert.equal(stableEntry.querySelector('.dsh-cron-unreadBadge').textContent, '99+', 'large unread counts are bounded')
assert.equal(stableEntry.getAttribute('aria-description'), 'trigger.summary:1,100', 'full unread count stays accessible')
await click(stableEntry)
assertClock(true)
assert.equal(stableEntry.querySelector('.dsh-cron-unreadBadge'), null, 'opening owner panel acknowledges unread activity')
const requestsBeforeNoOwner = requests.length
await render(null)
assertClock(false)
assert.ok(stableEntry.disabled, 'missing owner keeps the same icon but disables invocation')
await click(stableEntry)
assert.equal(requests.length, requestsBeforeNoOwner, 'no owner means no API invocation')
console.log('✓ constant icon across all destinations, accessible counters and disabled state')

await act(async () => {
  root.unmount()
  for (const dispose of bridgeCleanup.splice(0).reverse()) dispose()
  sideRoot.unmount()
  for (const dispose of cleanup.reverse()) dispose()
})
assert.equal(intervals.size, 0, 'all poll timers disposed')
assert.equal(liveObservers.size, 0, 'all settings size observers disconnected')
for (const [type, listeners] of Object.entries(trackedListeners)) assert.equal(listeners.size, 0, `${type} disclosure listeners disposed`)
document.addEventListener = addDocumentListener
document.removeEventListener = removeDocumentListener
if (originalObserver === undefined) delete globalThis.ResizeObserver
else globalThis.ResizeObserver = originalObserver
assert.equal(document.querySelector('style[data-plugin="dsh-cron"]'), null, 'style disposed')
globalThis.setInterval = originalInterval
globalThis.clearInterval = originalClearInterval
dom.window.close()
console.log('\nCLIENT SIDEBAR / TOAST RENDER TESTS PASSED')

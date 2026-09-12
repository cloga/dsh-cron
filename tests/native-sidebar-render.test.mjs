// Source-only React fixture. No bundle build, live Host, task creation or model calls.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { unrun } from 'unrun'
import { fileURLToPath } from 'node:url'

test('native shared body: owners, multi-pane visibility, pending actions and stale cleanup', async () => {
  const dom = new JSDOM('<html><head></head><body><div id="header"></div><div id="pane"></div><div id="float"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const previous = new Map(['window', 'document', 'Node', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'setInterval', 'clearInterval'].map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  const intervals = new Map()
  let seq = 0
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { act, createElement: h } = React
  const header = createRoot(document.getElementById('header'))
  const pane = createRoot(document.getElementById('pane'))
  const float = createRoot(document.getElementById('float'))
  const { module: plugin } = await unrun({ path: fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)) })
  const { module: locale } = await unrun({ path: fileURLToPath(new URL('../src/client/locale.ts', import.meta.url)) })
  globalThis.setInterval = (fn, ms) => { const id = ++seq; intervals.set(id, { fn, ms }); return id }
  globalThis.clearInterval = id => intervals.delete(id)
  const t = (key, params) => (locale.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
  const slots = new Map(), cleanups = [], optional = new Map()
  const ctx = { effect: fn => { const dispose = fn(); if (dispose) cleanups.push(dispose); return dispose },
    inject: (keys, fn) => optional.set(keys[0], fn),
    locale: { register: () => () => {}, bind: () => t },
    slots: { inject: (_key, fn) => fn(), register: (spec, body) => { slots.set(spec.key ?? spec.id, body); return () => slots.delete(spec.key ?? spec.id) } } }
  let current = 'A'
  const list = { current, byId: { A: { displayTitle: 'Weekly report' }, B: { displayTitle: 'Travel plans' } } }
  const useSessions = selector => selector(list)
  const renderHeader = () => header.render(h(React.Fragment, null, h(slots.get('cron-trigger'), { sessionId: current, useSessions, t }), h(slots.get('cron-drawer'), { t })))
  const data = { panel: { id: 'dock-a' }, tab: { id: 'tab-a', visible: true, signal: new AbortController().signal, navigation: { revision: 1, params: { view: 'tasks' } } } }
  const floating = { panel: { id: 'float-a' }, tab: { ...data.tab, id: 'tab-float', signal: new AbortController().signal } }
  const renderPane = (root = pane, info = data, owner = current) => root.render(h(slots.get('dsh-cron:native-tasks'), { key: owner, sessionId: owner, useSessions, useTabInfo: () => info, t }))
  const requests = [], opens = []
  let resolveList, resolveAction, failList = false, empty = false
  let listBarrier, actionBarrier
  globalThis.fetch = async (url, options) => {
    const method = url.split('/').at(-1), payload = JSON.parse(options.body)
    requests.push({ method, payload, signal: options.signal })
    if (method === 'list' && listBarrier) await listBarrier
    if (['run', 'toggle', 'remove'].includes(method) && actionBarrier) await actionBarrier
    if (method === 'list' && failList) return { json: async () => ({ ok: false, error: { message: 'fixture unavailable' } }) }
    const result = method === 'list' ? { tasks: empty ? [] : [{ id: `task-${payload.sessionId}`, sessionId: payload.sessionId, prompt: `Prompt ${payload.sessionId}`, enabled: true, origin: 'dynamic', schedule: { everySeconds: 60 }, nextRunAt: null }] }
      : method === 'history' ? { records: [] } : {}
    return { json: async () => ({ ok: true, result }) }
  }
  const click = async button => { assert.ok(button); await act(async () => button.click()) }
  const button = (name, root = document) => [...root.querySelectorAll('button')].find(el => el.textContent === name || el.getAttribute('aria-label') === name)
  const panelTimers = () => [...intervals.values()].filter(timer => timer.ms === 10_000)
  try {
    plugin.apply(ctx)
    await act(async () => renderHeader())
    assert.equal(panelTimers().length, 0, 'unopened native panel does not poll')
    const registry = { register: definition => { assert.equal(definition.guide, undefined); return () => {} } }
    const controller = { openTab: (...args) => opens.push(args) }
    await act(async () => optional.get('sidebarRightTabs')({ get: key => key === 'sidebarRightTabs' ? registry : controller, effect: ctx.effect, slots: ctx.slots }))
    assert.ok(slots.has('dsh-cron:native-tasks'))
    await click(button('Scheduled tasks'))
    assert.equal(opens.length, 1)
    assert.equal(document.querySelector('dialog'), null, 'native entry does not block chat')
    listBarrier = new Promise(resolve => { resolveList = resolve })
    await act(async () => renderPane())
    assert.ok(document.querySelector('[data-cron-native]').textContent.includes('Loading scheduled tasks'))
    assert.equal(document.querySelector('[data-cron-native]').textContent.includes('No scheduled tasks yet'), false)
    assert.equal(document.querySelectorAll('[data-cron-native] .dsh-cron-drawerTitle').length, 0)
    assert.equal(document.querySelector('[data-cron-native] > .dsh-cron-owner').textContent, 'This session · Weekly report')
    await act(async () => { listBarrier = null; resolveList() })
    assert.ok(document.querySelector('[data-cron-native]').textContent.includes('Prompt A'))
    assert.equal(panelTimers().length, 1)
    await act(async () => renderPane(float, floating))
    assert.equal(panelTimers().length, 2)
    await act(async () => pane.render(null))
    assert.equal(panelTimers().length, 1)
    assert.equal(button('Scheduled tasks').getAttribute('aria-expanded'), 'true', 'one unmount does not hide surviving float')
    await click(button('Scheduled tasks'))
    assert.equal(opens.at(-1)[1].paneId, 'float-a', 'clock targets existing float, not current dock pane')
    await click(button('History', document.getElementById('float')))
    await act(async () => float.render(null))
    assert.equal(panelTimers().length, 0)
    await click(button('Scheduled tasks'))
    assert.equal(opens.at(-1)[1].paneId, 'float-a', 'inactive unmounted native page remains the target until its record aborts')
    await act(async () => { floating.tab.visible = false; renderPane(float, floating) })
    assert.equal(panelTimers().length, 0, 'hidden bodies stop polling')
    await click(button('Scheduled tasks'))
    assert.equal(opens.at(-1)[1].paneId, 'float-a', 'hidden page stays the dedupe target')
    await act(async () => { floating.tab.visible = true; renderPane(float, floating) })
    assert.equal(button('History', document.getElementById('float')).getAttribute('aria-pressed'), 'true', 'remount does not replay old navigation over user-selected History')
    await click(button('Tasks', document.getElementById('float')))
    actionBarrier = new Promise(resolve => { resolveAction = resolve })
    await click(button('Run now', document.getElementById('float')))
    for (const name of ['Run now', 'Pause', 'Edit', 'Delete']) assert.equal(button(name, document.getElementById('float')).disabled, true)
    await click(button('Run now', document.getElementById('float')))
    assert.equal(requests.filter(req => req.method === 'run').length, 1, 'disabled pending action cannot send twice')
    await act(async () => { actionBarrier = null; resolveAction() })
    assert.equal(button('Delete', document.getElementById('float')).disabled, false)
    await click(button('Delete', document.getElementById('float')))
    assert.equal(requests.some(req => req.method === 'remove'), false, 'first delete click only asks inline confirmation')
    await click(button('Cancel', document.getElementById('float')))
    assert.equal(button('Confirm delete', document.getElementById('float')), undefined)
    await click(button('Delete', document.getElementById('float')))
    await click(button('Confirm delete', document.getElementById('float')))
    assert.equal(requests.filter(req => req.method === 'remove').length, 1)
    failList = true
    await act(async () => { for (const timer of panelTimers()) await timer.fn() })
    assert.ok(document.querySelector('[role="alert"]').textContent.includes('fixture unavailable'))
    failList = false; empty = true
    await click(button('Retry'))
    assert.equal(document.querySelector('[role="alert"]'), null)
    assert.ok(document.getElementById('float').textContent.includes('Just say it in chat'))
    assert.equal(requests.some(req => req.method === 'add'), false, 'empty guidance never creates or sends anything')
    // An ignored AbortSignal in the fake transport must still not leak owner A data.
    empty = false
    listBarrier = new Promise(resolve => { resolveList = resolve })
    await act(async () => { for (const timer of panelTimers()) void timer.fn() })
    const staleSignal = requests.filter(req => req.method === 'list').at(-1).signal
    await act(async () => { current = 'B'; list.current = 'B'; renderHeader(); renderPane(float, floating) })
    assert.equal(staleSignal.aborted, true)
    await act(async () => { listBarrier = null; resolveList() })
    assert.equal(document.getElementById('float').textContent.includes('Prompt A'), false)
    assert.ok(document.getElementById('float').textContent.includes('Travel plans'))
    const abort = new AbortController()
    await act(async () => { floating.tab.signal = abort.signal; renderPane(float, floating) })
    assert.equal(panelTimers().length, 1)
    await act(async () => abort.abort())
    assert.equal(panelTimers().length, 0, 'tab lifetime abort clears timers even before unmount')
    assert.equal(button('Scheduled tasks').getAttribute('aria-expanded'), 'false')
  } finally {
    await act(async () => { header.unmount(); pane.unmount(); float.unmount(); for (const cleanup of cleanups.reverse()) cleanup() })
    assert.equal(intervals.size, 0)
    dom.window.close()
    for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  }
})

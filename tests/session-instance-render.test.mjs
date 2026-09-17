import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'
import { unrun } from 'unrun'
import { fileURLToPath } from 'node:url'

test('alpha.2 coexisting Conversation headers keep standard identity and main-owner polling', async () => {
  const dom = new JSDOM('<html><head></head><body><div id="a"></div><div id="b"></div><div id="duplicate"></div><div id="overlay"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const keys = ['window', 'document', 'Node', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'setInterval', 'clearInterval']
  const previous = new Map(keys.map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true }
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false }
  const React = await import('react'), { createRoot } = await import('react-dom/client')
  const { act, createElement: h } = React
  const roots = Object.fromEntries(['a', 'b', 'duplicate', 'overlay'].map(id => [id, createRoot(document.getElementById(id))]))
  const { module: plugin } = await unrun({ path: fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)) })
  const slots = new Map(), cleanup = [], intervals = new Map(), calls = []
  let timerId = 0
  globalThis.setInterval = (fn, ms) => { intervals.set(++timerId, { fn, ms }); return timerId }
  globalThis.clearInterval = id => intervals.delete(id)
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/capabilities')) return Response.json({ ok: true, result: { transport: 'connection-fetch', version: 1 } })
    const payload = JSON.parse(options.body); calls.push({ url, payload })
    return Response.json({ ok: true, result: url.endsWith('/list') ? { tasks: [] } : { records: [] } })
  }
  const ctx = { effect: fn => { const dispose = fn(); if (dispose) cleanup.push(dispose); return dispose }, inject() {},
    locale: { register: () => () => {}, bind: () => key => key },
    slots: { inject: (_name, fn) => fn(), register: (spec, component) => { slots.set(spec.id, { spec, component }); return () => slots.delete(spec.id) } } }
  const list = { byId: { A: { displayTitle: 'Main A', retainedBy: { mainView: 1 } }, B: { displayTitle: 'Embedded B', retainedBy: { sidebar: 1 } } } }
  const useSessions = select => select(list)
  const render = (id, owner) => roots[id].render(h(slots.get('cron-trigger').component, { sessionId: owner, useSessions }))
  const click = async id => act(async () => document.querySelector(`#${id} button`).click())
  try {
    plugin.apply(ctx)
    assert.equal(slots.get('cron-trigger').spec.inject, undefined, 'scope target must not overwrite standard Session identity')
    await act(async () => { render('a', 'A'); roots.overlay.render(h(slots.get('cron-drawer').component, {})) })
    await click('a')
    assert.ok(document.querySelector('dialog'))
    await act(async () => { render('b', 'B'); render('duplicate', 'A') })
    assert.ok(document.querySelector('dialog'), 'mounting embedded headers must not close main-owner dialog')
    assert.ok(calls.every(call => call.payload.sessionId === 'A'), 'embedded B cannot hijack watcher')
    await act(async () => roots.a.render(null))
    assert.ok(document.querySelector('dialog'), 'unmounting one A occurrence keeps the surviving A owner')
    await click('b')
    assert.ok(calls.some(call => call.payload.sessionId === 'B'), 'B click explicitly addresses B, not global A')
    assert.equal(document.querySelector('#b button').getAttribute('aria-expanded'), 'true')
    await act(async () => roots.b.render(null))
    assert.equal(document.querySelector('#duplicate button').disabled, false)
  } finally {
    await act(async () => { for (const root of Object.values(roots)) root.unmount(); for (const dispose of cleanup.reverse()) dispose() })
    assert.equal(intervals.size, 0)
    dom.window.close()
    for (const [key, value] of previous) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value }
  }
})

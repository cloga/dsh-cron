// Source-backed React regression tests; no generated bundle or live Host needed.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { unrun } from 'unrun'

async function fixture() {
  const dom = new JSDOM('<html><head></head><body><div id="root"></div><div id="panel"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
  const keys = ['window', 'document', 'Node', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT', 'fetch', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout']
  const previous = new Map(keys.map(key => [key, globalThis[key]]))
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Node: dom.window.Node, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { module: plugin } = await unrun({ path: fileURLToPath(new URL('../src/client/index.tsx', import.meta.url)) })
  const { module: locale } = await unrun({ path: fileURLToPath(new URL('../src/client/locale.ts', import.meta.url)) })
  const { act, createElement: h } = React
  const root = createRoot(document.getElementById('root'))
  const panel = createRoot(document.getElementById('panel'))
  let now = 0, sequence = 0
  const timers = new Map()
  const schedule = (fn, ms, repeat) => {
    const id = ++sequence
    timers.set(id, { fn, at: now + ms, ms, repeat })
    return id
  }
  globalThis.setInterval = (fn, ms) => schedule(fn, ms, true)
  globalThis.setTimeout = (fn, ms) => schedule(fn, ms, false)
  globalThis.clearInterval = globalThis.clearTimeout = id => timers.delete(id)
  const advance = async ms => {
    const until = now + ms
    while (true) {
      const next = [...timers].filter(([, value]) => value.at <= until).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      const [id, timer] = next
      now = timer.at
      if (timer.repeat) timer.at += timer.ms
      else timers.delete(id)
      await act(async () => { timer.fn() })
    }
    now = until
  }
  const requests = []
  let behavior = () => 'ok'
  let hubOwners = []
  const task = owner => ({ id: `task-${owner}`, sessionId: owner, prompt: `Prompt ${owner}`, enabled: true, origin: 'dynamic', schedule: { everySeconds: 60 }, nextRunAt: null })
  const response = (request, result) => ({ json: async () => ({ ok: true, result: result ?? (request.method === 'list' ? { tasks: [task(request.owner)] } : request.method === 'history' ? { records: [] } : request.method === 'owners' ? hubOwners : {}) }) })
  globalThis.fetch = (url, options) => {
    const payload = JSON.parse(options.body)
    const request = { method: url.split('/').at(-1), owner: payload.sessionId, payload, signal: options.signal }
    if (request.method === 'owners') assert.deepEqual(payload, {}, 'global owner index sends no meaningful payload')
    else assert.ok(request.owner, 'owner-scoped requests explicitly name their owner')
    requests.push(request)
    return new Promise((resolve, reject) => {
      request.resolve = result => resolve(response(request, result))
      request.reject = reject
      const mode = behavior(request)
      if (mode === 'ok') request.resolve()
      else if (typeof mode === 'number') setTimeout(request.resolve, mode)
      else if (mode === 'error') reject(new Error('private prompt / credential must not enter watcher logs'))
      else if (mode === 'body-hang') resolve({ json: () => new Promise(resolveBody => { request.resolveBody = result => resolveBody({ ok: true, result }) }) })
      // "hang" deliberately ignores AbortSignal to also exercise stale-result guards.
    })
  }
  const slots = new Map(), optional = new Map(), cleanups = []
  const t = (key, params) => (locale.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
  const ctx = {
    effect: fn => { const dispose = fn(); if (dispose) cleanups.push(dispose); return dispose },
    inject: (names, callback) => optional.set(names[0], callback),
    locale: { register: () => () => {}, bind: () => t },
    slots: { inject: (_key, callback) => callback(), register: (spec, body) => { slots.set(spec.key ?? spec.id, body); return () => {} } },
  }
  plugin.apply(ctx)
  optional.get('sidebarRightTabs')({
    get: key => key === 'sidebarRightTabs' ? { register: () => () => {} } : { openTab: () => {} },
    effect: ctx.effect, slots: ctx.slots,
  })
  let owner = 'A'
  let visible = true
  let lifetime = new AbortController()
  const renderPanel = async (options = {}) => {
    owner = options.owner ?? owner
    visible = options.visible ?? visible
    lifetime = options.lifetime ?? lifetime
    await act(async () => panel.render(h(slots.get('dsh-cron:native-tasks'), {
      sessionId: owner, t, useSessions: select => select({ current: owner, byId: {} }),
      useTabInfo: () => ({ panel: { id: 'pane' }, tab: { id: 'tab', visible, signal: lifetime.signal, navigation: { revision: 1, params: { view: 'tasks' } } } }),
    })))
  }
  const renderWatcher = async (sessionId = 'A') => act(async () => root.render(h(React.Fragment, null,
    h(slots.get('cron-trigger'), { sessionId, t }), h(slots.get('cron-drawer'), { t }))))
  const openedSessions = []
  let hubActivated = false
  const renderHub = async ({ open = true, owners = hubOwners, byId = {} } = {}) => {
    hubOwners = owners
    if (!hubActivated) {
      optional.get('uiWorkspace')({
        get: name => name === 'uiWorkspace' ? { openSession: id => openedSessions.push(id) } : name === 'sessions' ? {} : undefined,
        effect: ctx.effect,
        slots: ctx.slots,
      })
      hubActivated = true
    }
    await act(async () => panel.render(h(slots.get(plugin.SCHEDULED_SESSIONS_ID), {
      open, t, useSessions: select => select({ byId }),
    })))
  }
  const setVisibility = async state => act(async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
    document.dispatchEvent(new dom.window.Event('visibilitychange'))
  })
  const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label)
  const click = async label => act(async () => { assert.ok(button(label), `${label} button exists`); button(label).click() })
  let closed = false
  return {
    requests, timers, advance, renderPanel, renderWatcher, renderHub, openedSessions, setVisibility, click, button, act, panel,
    behavior: value => { behavior = value },
    text: () => document.getElementById('panel').textContent,
    alert: () => document.querySelector('[role="alert"]')?.textContent,
    busy: () => document.querySelector('.dsh-cron-body')?.getAttribute('aria-busy'),
    close: async () => {
      if (closed) return
      closed = true
      await act(async () => { root.unmount(); panel.unmount(); for (const dispose of cleanups.reverse()) dispose() })
      dom.window.close()
      for (const [key, value] of previous) if (value === undefined) delete globalThis[key]; else globalThis[key] = value
    },
  }
}

test('panel publishes 12-second reads rather than invalidating them every 10 seconds', async () => {
  const f = await fixture()
  try {
    f.behavior(() => 12_000)
    await f.renderPanel()
    await f.advance(10_000)
    assert.equal(f.requests.length, 2, 'only one list/history batch can be in flight')
    await f.advance(2_000)
    assert.match(f.text(), /Prompt A/, 'slow successful responses publish')
    assert.equal(f.busy(), 'false')
    await f.advance(8_000)
    assert.equal(f.requests.length, 4, 'later ticks can start a new batch')
    await f.advance(12_000)
    assert.match(f.text(), /Prompt A/)
  } finally { await f.close() }
})

test('hung panel reads reach a deadline; repeated Retry coalesces and late results cannot publish', async () => {
  const f = await fixture()
  try {
    f.behavior(() => 'hang')
    await f.renderPanel()
    const abandoned = [...f.requests]
    await f.advance(30_000)
    assert.ok(abandoned.every(request => request.signal?.aborted), 'deadline aborts both reads')
    assert.match(f.alert(), /timed out/i)
    // If a scheduled tick is already retrying, finish it with a recoverable error.
    for (const request of f.requests.filter(request => !request.signal.aborted)) {
      await f.act(async () => request.reject(new Error('Host unavailable; retry')))
    }
    assert.equal(f.button('Retry').disabled, false, 'deadline does not leave Retry stuck busy')
    assert.equal(f.busy(), 'false')
    const before = f.requests.length
    await f.act(async () => { f.button('Retry').click(); f.button('Retry').click(); f.button('Retry').click() })
    assert.equal(f.requests.length, before + 2, 'repeated Retry creates exactly one batch')
    assert.equal(f.button('Retry').disabled, true)
    const latest = f.requests.slice(-2)
    await f.act(async () => { latest.forEach(request => request.resolve()); abandoned.forEach(request => request.resolve({ tasks: [{ id: 'stale', prompt: 'STALE', schedule: {}, enabled: true }], records: [] })) })
    assert.match(f.text(), /Prompt A/)
    assert.doesNotMatch(f.text(), /STALE/)
    assert.equal(f.alert(), undefined)
  } finally { await f.close() }
})

test('hide, document hide, owner switch, record abort and unmount cancel reads immediately', async () => {
  const f = await fixture()
  try {
    f.behavior(() => 'hang')
    await f.renderPanel()
    const first = [...f.requests]
    await f.renderPanel({ visible: false })
    assert.ok(first.every(request => request.signal?.aborted))
    await f.advance(60_000)
    assert.equal(f.requests.length, 2, 'hidden panel starts no reads')
    await f.renderPanel({ visible: true })
    const reattached = f.requests.slice(-2)
    await f.setVisibility('hidden')
    assert.ok(reattached.every(request => request.signal?.aborted), 'backgrounding cancels active panel reads')
    await f.advance(60_000)
    assert.equal(f.requests.length, 4)
    await f.setVisibility('visible')
    assert.equal(f.requests.length, 6, 'returning starts one fresh read')
    const oldOwner = f.requests.slice(-2)
    await f.renderPanel({ owner: 'B' })
    assert.ok(oldOwner.every(request => request.signal?.aborted))
    const current = f.requests.slice(-2)
    assert.ok(current.every(request => request.owner === 'B'))
    await f.act(async () => { current.forEach(request => request.resolve()); [...first, ...reattached, ...oldOwner].forEach(request => request.resolve()) })
    assert.match(f.text(), /Prompt B/)
    assert.doesNotMatch(f.text(), /Prompt A/)
    const lifetime = new AbortController()
    await f.renderPanel({ lifetime })
    const aborted = f.requests.slice(-2)
    await f.act(async () => lifetime.abort())
    assert.ok(aborted.every(request => request.signal?.aborted), 'record abort cancels without needing a rerender')
    await f.advance(60_000)
    assert.deepEqual(f.requests.slice(-2), aborted)
    await f.renderPanel({ lifetime: new AbortController() })
    const unmounted = f.requests.slice(-2)
    await f.act(async () => f.panel.render(null))
    assert.ok(unmounted.every(request => request.signal?.aborted))
  } finally { await f.close() }
})

test('watcher is single-flight, deadline bounded, safely diagnostic and visibility/owner cancellable', async () => {
  const f = await fixture()
  const warnings = []
  const warn = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    f.behavior(() => 'hang')
    await f.renderWatcher('A')
    await f.advance(20_000)
    assert.equal(f.requests.length, 1, 'watcher does not overlap its pending read')
    await f.advance(10_000)
    assert.equal(f.requests[0].signal?.aborted, true)
    assert.match(JSON.stringify(warnings), /timed out/i)
    assert.match(JSON.stringify(warnings), /retry/i)
    f.behavior(() => 'error')
    await f.advance(10_000)
    assert.equal(f.requests.length, 2, 'watcher retries after its deadline')
    assert.match(JSON.stringify(warnings), /failed/i)
    assert.doesNotMatch(JSON.stringify(warnings), /private prompt|credential/)
    f.behavior(() => 'hang')
    await f.advance(20_000)
    const hidden = f.requests.at(-1)
    const warningCount = warnings.length
    await f.setVisibility('hidden')
    assert.equal(hidden.signal?.aborted, true)
    await f.advance(60_000)
    assert.equal(f.requests.length, 3)
    assert.equal(warnings.length, warningCount, 'expected cancellations are not failures')
    await f.setVisibility('visible')
    const oldOwner = f.requests.at(-1)
    assert.equal(f.requests.length, 4)
    await f.renderWatcher('B')
    assert.equal(oldOwner.signal?.aborted, true)
    const current = f.requests.at(-1)
    assert.equal(current.owner, 'B')
    await f.act(async () => current.resolve({ records: [] }))
    await f.act(async () => oldOwner.resolve({ records: [{ id: 'late', taskId: 'private-task', status: 'completed' }] }))
    assert.equal(document.querySelectorAll('.dsh-cron-toast').length, 0, 'old watcher result cannot notify new owner')
    await f.advance(20_000)
    const unmounted = f.requests.at(-1)
    await f.close()
    assert.equal(unmounted.signal?.aborted, true, 'watcher unmount aborts transport')
  } finally { console.warn = warn; await f.close() }
})

test('polling recovery never replays a mutation and keeps the per-task busy guard', async () => {
  const f = await fixture()
  try {
    await f.renderPanel()
    f.behavior(request => request.method === 'run' ? 'hang' : 'ok')
    await f.act(async () => { f.button('Run now').click(); f.button('Run now').click() })
    assert.equal(f.requests.filter(request => request.method === 'run').length, 1)
    assert.equal(f.button('Run now').disabled, true)
    await f.advance(60_000)
    assert.equal(f.requests.filter(request => request.method === 'run').length, 1, 'read polling never replays pending mutation')
    const mutation = f.requests.find(request => request.method === 'run')
    await f.act(async () => mutation.reject(new Error('Mutation outcome unknown')))
    f.behavior(() => 'ok')
    await f.click('Retry')
    assert.equal(f.requests.filter(request => request.method === 'run').length, 1, 'Retry only reads state')
    assert.equal(f.button('Run now').disabled, false)
  } finally { await f.close() }
})

test('successful mutation replaces an older pending snapshot without replaying the action', async () => {
  const f = await fixture()
  try {
    await f.renderPanel()
    f.behavior(request => request.method === 'run' ? 'ok' : 'hang')
    await f.advance(10_000)
    const stale = f.requests.slice(-2)
    await f.click('Run now')
    assert.ok(stale.every(request => request.signal.aborted), 'read started before mutation cannot supply the post-action refresh')
    const fresh = f.requests.slice(-2)
    assert.deepEqual(fresh.map(request => request.method), ['list', 'history'])
    await f.act(async () => {
      fresh.forEach(request => request.resolve())
      stale.forEach(request => request.resolve({ tasks: [{ id: 'stale', prompt: 'STALE', enabled: true, schedule: {} }], records: [] }))
    })
    assert.match(f.text(), /Prompt A/)
    assert.doesNotMatch(f.text(), /STALE/)
    assert.equal(f.requests.filter(request => request.method === 'run').length, 1)
    assert.equal(f.button('Run now').disabled, false)
  } finally { await f.close() }
})

test('a failed half-batch aborts its sibling; a hanging JSON body is deadline bounded too', async () => {
  const f = await fixture()
  try {
    f.behavior(request => request.method === 'list' ? 'error' : 'hang')
    await f.renderPanel()
    assert.match(f.alert(), /Could not refresh/)
    assert.equal(f.requests.find(request => request.method === 'history').signal.aborted, true)
    assert.equal(f.busy(), 'false')
    f.behavior(request => request.method === 'list' ? 'body-hang' : 'ok')
    await f.click('Retry')
    const body = f.requests.find(request => request.resolveBody)
    assert.ok(body, 'response headers arrived; JSON parsing remains pending')
    await f.advance(30_000)
    assert.equal(body.signal.aborted, true)
    assert.match(f.alert(), /timed out/i)
    await f.act(async () => body.resolveBody({ tasks: [{ id: 'late-body', prompt: 'LATE BODY', enabled: true, schedule: {} }] }))
    assert.doesNotMatch(f.text(), /LATE BODY/)
  } finally { await f.close() }
})

test('global hub renders five privacy-minimal owners and opens an exact blank cordis session', async () => {
  const f = await fixture()
  try {
    const owners = ['A', 'B', 'C', 'D', 'unknown'].map((sessionId, index) => ({
      sessionId, taskCount: index + 1, enabledCount: index, nextRunAt: index === 0 ? null : `2026-09-1${index}T09:00:00Z`,
    }))
    await f.renderHub({ owners, byId: {
      A: { displayTitle: 'Morning review' },
      B: { blank: true, projectionValues: { agentPreset: 'cordis' } },
      C: { blank: true, displayTitle: 'Prepared blank' },
      D: { displayTitle: 'Release watch', running: true },
    } })
    assert.equal(document.querySelectorAll('.dsh-cron-hubRow').length, 5)
    assert.match(f.text(), /Morning review/)
    assert.match(f.text(), /New session/)
    assert.match(f.text(), /cordis/)
    assert.match(f.text(), /Prepared blank/)
    assert.match(f.text(), /Running/)
    assert.match(f.text(), /unknown/)
    assert.equal(document.querySelectorAll('.dsh-cron-hubRow')[4].disabled, true, 'an owner absent from the public Session list cannot call openSession')
    await f.act(async () => document.querySelectorAll('.dsh-cron-hubRow')[1].click())
    assert.deepEqual(f.openedSessions, ['B'], 'row navigation calls public openSession with the exact id')
    assert.deepEqual([...new Set(f.requests.map(request => request.method))], ['owners'], 'hub never calls task, prompt or history APIs')
  } finally { await f.close() }
})

test('global hub cancels hidden reads, rejects stale results and exposes retryable errors', async () => {
  const f = await fixture()
  try {
    f.behavior(request => request.method === 'owners' ? 'hang' : 'ok')
    await f.renderHub({ owners: [{ sessionId: 'stale', taskCount: 1, enabledCount: 1, nextRunAt: null }] })
    const stale = f.requests.at(-1)
    await f.renderHub({ open: false })
    assert.equal(stale.signal.aborted, true)
    await f.act(async () => stale.resolve([{ sessionId: 'stale', taskCount: 1, enabledCount: 1, nextRunAt: null }]))
    assert.doesNotMatch(f.text(), /stale/)
    f.behavior(request => request.method === 'owners' ? 'error' : 'ok')
    await f.renderHub({ open: true, owners: [] })
    assert.match(f.alert(), /Could not refresh scheduled sessions/)
    f.behavior(() => 'ok')
    await f.click('Retry')
    assert.match(f.text(), /No sessions currently own scheduled tasks/)
    f.behavior(request => request.method === 'owners' ? 'hang' : 'ok')
    const beforePoll = f.requests.length
    await f.advance(20_000)
    assert.equal(f.requests.length, beforePoll + 1, 'visible hub continues bounded polling')
    const hidden = f.requests.at(-1)
    await f.setVisibility('hidden')
    assert.equal(hidden.signal.aborted, true, 'document hide cancels the active global owner read')
    const hiddenCount = f.requests.length
    await f.advance(40_000)
    assert.equal(f.requests.length, hiddenCount, 'document-hidden intervals do not start owner reads')
    await f.setVisibility('visible')
    assert.equal(f.requests.length, hiddenCount + 1, 'document reveal refreshes the owner index once')
  } finally { await f.close() }
})

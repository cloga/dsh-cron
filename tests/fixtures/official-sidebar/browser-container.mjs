// SYNTHETIC CONTAINER, not the official Web shell/renderer. It draws real Cron
// registrations and transports commands to unchanged upstream controller/store.
// All conversation, owner, task, and history content below is invented test data.
export const html = `<!doctype html><html><head><style>
:root {font-family:system-ui,sans-serif;color-scheme:light dark}
body{margin:0;background:Canvas;color:CanvasText}button,input{font:inherit}
header{height:42px;display:flex;align-items:center;gap:12px;padding:0 12px;border-bottom:1px solid GrayText}
#layout{display:flex;height:calc(100vh - 43px);min-width:0}main{box-sizing:border-box;flex:1;min-width:100px;padding:16px}
#panes{display:flex;max-width:70vw;min-width:0} .fixture-pane{box-sizing:border-box;flex:1 1 360px;width:360px;max-width:70vw;min-width:0;display:flex;flex-direction:column;border-left:1px solid GrayText}
.fixture-pane[hidden],.fixture-body[hidden]{display:none}.fixture-tabstrip{display:flex;gap:4px;flex-shrink:0;padding:6px;border-bottom:1px solid GrayText}
.fixture-body{min-height:0;flex:1;overflow:hidden}.fixture-body>section{height:100%}
#chat-input{width:100%;box-sizing:border-box}#fixture-label{font-size:11px}#legacy{position:fixed;right:0;top:43px;bottom:0;width:360px;max-width:70vw}#legacy:empty{display:none}
</style></head><body><header><span id="fixture-label">SYNTHETIC CONTAINER · Issue34</span><div id="trigger"></div></header>
<div id="layout"><main><h1>Fixture chat</h1><label>Chat message<input id="chat-input"></label><button id="chat-send">Send fixture message</button><output id="chat-output"></output></main><aside id="panes"></aside></div><div id="drawer"></div><div id="legacy"></div></body></html>`

// Runs inside a page that already loaded React UMD and the actual built Cron bundle.
export function mountContainer() {
  const R = window.React, D = window.ReactDOM
  const jsx = (type, props, key) => R.createElement(type, { ...props, ...(key === undefined ? {} : { key }) })
  const plugin = window.cronRegistration.factory(name => {
    if (name === 'react') return R
    if (name === 'react-dom') return D
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: R.Fragment }
    throw new Error('Unexpected Cron runtime import: ' + name)
  })
  const roots = { trigger: D.createRoot(document.querySelector('#trigger')), drawer: D.createRoot(document.querySelector('#drawer')), panes: D.createRoot(document.querySelector('#panes')), legacy: D.createRoot(document.querySelector('#legacy')) }
  const slots = new Map(), optional = new Map(), effects = [], nativeEffects = [], legacyEffects = []
  const lifetimes = new Map(), requests = [], held = [], calls = [], faults = []
  const modes = new Map(), removed = new Set()
  let dictionaries, current = 'fixture-owner-A', snapshot = { owners: [] }, disposed = false, legacyDefinition
  let queue = Promise.resolve()
  const t = (key, params) => (dictionaries.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
  const sessions = () => ({ current, byId: { 'fixture-owner-A': { displayTitle: 'Fixture project A' }, 'fixture-owner-B': { displayTitle: 'Fixture project B' } } })
  const useSessions = selector => selector(sessions())
  const enqueue = (action, args = {}) => {
    calls.push({ action, ...args })
    queue = queue.then(async () => { snapshot = await window.upstreamRPC({ action, ...args }); render() }).catch(error => { faults.push(error.message); throw error })
    return queue
  }
  const requestData = (owner, method) => {
    const empty = modes.get(owner) === 'empty'
    const tasks = empty ? [] : [0, 1].filter(i => !removed.has(owner + '/task-' + i)).map(i => ({ id: 'task-' + i, sessionId: owner,
      prompt: owner === 'fixture-owner-A' ? 'Synthetic A task ' + i : 'Synthetic B task ' + i, enabled: true, origin: 'dynamic',
      schedule: { daily: '09:00', timeZone: 'UTC' }, nextRunAt: '2030-01-01T09:00:00Z' }))
    const records = empty ? [] : [{ id: owner + '-run-1', taskId: 'task-0', sessionId: owner, status: 'completed', firedAt: '2026-01-01T09:00:00Z', scheduledFor: '2026-01-01T09:00:00Z', startedAt: 0, completedAt: 1000, excerpt: owner === 'fixture-owner-A' ? 'Synthetic A history' : 'Synthetic B history' }]
    return { ok: true, result: method === 'list' ? { tasks } : method === 'history' ? { records } : {} }
  }
  window.fetch = async (url, options) => {
    if (!/^\/cron\/api\/(list|history|remove|toggle|update|run)$/.test(String(url))) throw new Error('Real API/network forbidden: ' + url)
    const method = String(url).split('/').at(-1), payload = JSON.parse(options.body)
    if (!['fixture-owner-A', 'fixture-owner-B'].includes(payload.sessionId)) throw new Error('Non-fixture owner')
    const request = { method, owner: payload.sessionId, id: payload.id, signal: options.signal, aborted: options.signal?.aborted ?? false }
    requests.push(request)
    options.signal?.addEventListener('abort', () => { request.aborted = true }, { once: true })
    const mode = modes.get(payload.sessionId)
    if (mode === 'loading' || (method === 'remove' && mode === 'delete-pending')) {
      // Deliberately ignore abort at the fake carrier: Cron must reject stale success.
      return new Promise(resolve => held.push({ request, resolve: () => {
        if (method === 'remove') removed.add(payload.sessionId + '/' + payload.id)
        resolve({ json: async () => requestData(payload.sessionId, method) })
      } }))
    }
    if (method === 'remove') removed.add(payload.sessionId + '/' + payload.id)
    return { json: async () => mode === 'error' ? { ok: false, error: { message: 'Synthetic carrier unavailable' } } : requestData(payload.sessionId, method) }
  }
  const slotsFace = {
    inject: (_name, callback) => callback(),
    register: (spec, component) => { const key = spec.key ?? spec.id; slots.set(key, component); return () => { slots.delete(key); render() } },
  }
  const controller = { openTab(kind, options = {}) {
    if ('sessionId' in options) throw new Error('Invented native sessionId option')
    enqueue('open', { kind, options })
  } }
  const registry = { register(definition) {
    enqueue('register', { definition: { id: definition.id, kind: definition.kind, title: definition.title(''), priority: definition.priority, guide: definition.guide } })
    return () => { enqueue('unregister', { id: definition.id }) }
  } }
  const ctx = {
    effect: fn => { const dispose = fn(); if (dispose) effects.push(dispose); return dispose },
    locale: { register: (_ns, values) => { dictionaries = values; return () => {} }, bind: () => t },
    slots: slotsFace,
    inject: (names, callback) => {
      optional.set(names.join(','), callback)
      if (names.join(',') === 'sidebarRightTabs,sidebarRight') callback({
        get: name => name === 'sidebarRightTabs' ? registry : controller,
        slots: slotsFace, effect: fn => { const dispose = fn(); if (dispose) nativeEffects.push(dispose); return dispose },
      })
    },
  }
  function render() {
    if (!dictionaries || disposed) return
    const Trigger = slots.get('cron-trigger'), Drawer = slots.get('cron-drawer')
    if (Trigger) roots.trigger.render(R.createElement(Trigger, { sessionId: current, useSessions, t }))
    if (Drawer) roots.drawer.render(R.createElement(Drawer, { t }))
    const valid = new Set()
    const panes = []
    for (const owner of snapshot.owners) for (const pane of owner.panes) {
      const bodies = pane.tabs.map(tab => {
        const key = owner.id + '/' + tab.id
        valid.add(key)
        let lifetime = lifetimes.get(key)
        if (!lifetime) { lifetime = new AbortController(); lifetimes.set(key, lifetime) }
        const actions = {
          openTab: (kind, options) => { enqueue('boundOpen', { owner: owner.id, id: tab.id, kind, options }) },
          close: () => { enqueue('boundClose', { owner: owner.id, id: tab.id }) },
        }
        const info = { sidebar: { expanded: owner.expanded, fullscreen: false }, panel: { id: pane.id },
          tab: { id: tab.id, kind: tab.kind, visible: tab.visible, signal: lifetime.signal, navigation: tab.navigation, actions } }
        const Body = slots.get(tab.definitionId)
        return R.createElement('div', { key, className: 'fixture-body', hidden: owner.id !== current || !tab.visible, 'data-owner': owner.id, 'data-tab-id': tab.id },
          Body ? R.createElement(Body, { sessionId: owner.id, useSessions, useTabInfo: () => info, t }) : R.createElement('p', null, tab.title + ' · synthetic body'))
      })
      panes.push(R.createElement('section', { key: owner.id + '/' + pane.id, className: 'fixture-pane', hidden: owner.id !== current || (!owner.expanded && pane.host !== 'float') },
        R.createElement('nav', { className: 'fixture-tabstrip', 'aria-label': 'Synthetic native tabs' }, pane.tabs.map(tab => R.createElement('button', { key: tab.id, onClick: () => enqueue('focus', { id: tab.id }) }, tab.title))), ...bodies))
    }
    for (const [key, lifetime] of lifetimes) if (!valid.has(key)) { lifetime.abort(); lifetimes.delete(key) }
    roots.panes.render(panes)
  }
  plugin.apply(ctx)
  render()
  document.querySelector('#chat-send').onclick = () => { document.querySelector('#chat-output').textContent = document.querySelector('#chat-input').value }
  window.fixture = {
    sync: () => queue,
    mode(owner, value) { modes.set(owner, value) },
    async switchOwner(owner) { current = owner; await enqueue('mount', { owner }) },
    open(view = 'tasks', paneId) { controller.openTab('dsh-cron:scheduled-tasks', { params: { view }, ...(paneId ? { paneId } : {}) }); return queue },
    hide: () => enqueue('collapse'),
    split: () => enqueue('split'),
    close(owner, id) { return enqueue('boundClose', { owner, id }) },
    resolveHeld() { held.splice(0).forEach(item => item.resolve()) },
    state: () => ({ current, snapshot, calls, faults, held: held.length, requests: requests.map(({ signal, ...request }) => request) }),
    async detachNative() { nativeEffects.splice(0).reverse().forEach(dispose => dispose()); await queue; render() },
    attachLegacy() {
      const callback = optional.get('betterSidebar')
      // Separate legacy Better Sidebar fixture contract only. The native
      // sidebarRight service above exposes openTab and NO getSnapshot.
      const service = { version: '0.18.0', features: ['targetedOpen', 'floatWindows'],
        getSnapshot: () => ({ sessionId: current }), isTabEnabled: () => true,
        registerTab(definition) { legacyDefinition = definition; return () => { legacyDefinition = null; roots.legacy.render(null) } },
        openTab(_seed, scope) { calls.push({ action: 'legacyOpen', owner: scope.sessionId }); roots.legacy.render(R.createElement(legacyDefinition.component, { scope, visible: true })) },
      }
      callback({ get: () => service, effect: fn => { const dispose = fn(); legacyEffects.push(dispose); return dispose } })
    },
    detachLegacy() { legacyEffects.splice(0).reverse().forEach(dispose => dispose()) },
    async cleanup() { disposed = true; nativeEffects.splice(0).reverse().forEach(dispose => dispose()); legacyEffects.splice(0).reverse().forEach(dispose => dispose()); Object.values(roots).forEach(root => root.unmount()); effects.reverse().forEach(dispose => dispose()); await queue; lifetimes.forEach(lifetime => lifetime.abort()) },
  }
  return enqueue('mount', { owner: current })
}

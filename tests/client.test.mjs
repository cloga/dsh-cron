// Verify the drawer-version client bundle registers both slot entries.
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const regs = []
globalThis.window = { __ModuleLoader__: { load: (r) => regs.push(r) } }
eval(src)

const req = (n) => {
  if (n === 'react') {
    return {
      useState: (v) => [v, () => {}],
      useEffect: () => {},
      useRef: () => ({ current: null }),
      useCallback: (f) => f,
      useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
    }
  }
  if (n === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}), Fragment: {} }
  if (n === 'react-dom') return { createPortal: (node) => node }
  throw new Error('unexpected require: ' + n)
}

const ex = regs[0].factory(req)
console.log('✓ id:', regs[0].id, '| exports:', Object.keys(ex).join(','), '| inject:', ex.inject.join(','))

const registered = []
const ctx = {
  inject: () => {}, // no Better Sidebar service installed
  effect: () => {},
  locale: { register: () => () => {} },
  slots: {
    inject: (key, cb) => { registered.push(`inject(${key})`); return cb() },
    register: (spec) => { registered.push(`${spec.name}#${spec.id}@order${spec.order}`); return () => {} },
  },
}
ex.apply(ctx)
console.log('✓ registrations:', registered.join(' | '))

if (!registered.includes('conversation.session.header.utilities#cron-trigger@order-50')) throw new Error('trigger registration missing')
if (!registered.includes('shell.overlay#cron-drawer@order100')) throw new Error('drawer registration missing')
if (!ex.inject.includes('slots')) throw new Error('slots service injection missing')
if (!ex.inject.includes('locale')) throw new Error('locale service injection missing')
if (!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-layout')) throw new Error('current layout client module missing')
if (!manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-workspace')) throw new Error('optional workspace navigation client module missing')
if (manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime')) throw new Error('removed legacy client runtime still referenced')

const hubRegistrations = [], hubReleases = []
let hubActivation
const hubCtx = {
  effect: () => {},
  locale: { register: () => () => {}, bind: () => key => key },
  inject: (names, callback) => {
    if (names.join(',') === 'uiWorkspace,sessions') hubActivation = callback
  },
  slots: { inject: () => {}, register: () => () => {} },
}
ex.apply(hubCtx)
if (typeof hubActivation !== 'function') throw new Error('global hub optional service activation missing')
hubActivation({ get: () => undefined, effect: fn => fn(), slots: hubCtx.slots })
if (hubRegistrations.length) throw new Error('hub must contribute nothing without capabilities')
const services = { uiWorkspace: { openSession() {} }, sessions: {} }
let releaseHub
hubActivation({
  get: name => services[name],
  effect: fn => { releaseHub = fn(); return releaseHub },
  slots: {
    inject: (_name, callback) => callback(),
    register: (spec, component) => {
      if (hubRegistrations.some(entry => entry.spec.name === spec.name && (entry.spec.id ?? entry.spec.key) === (spec.id ?? spec.key))) throw new Error('hub registration collision')
      const entry = { spec, component, released: false }
      hubRegistrations.push(entry)
      return () => { if (!entry.released) { entry.released = true; hubReleases.push(spec.name) } }
    },
  },
})
const hubIcon = hubRegistrations.find(entry => entry.spec.name === 'sidebar.panellist')
const hubMain = hubRegistrations.find(entry => entry.spec.name === 'main')
if (!hubIcon || hubIcon.spec.id !== ex.SCHEDULED_SESSIONS_ID || hubIcon.spec.label() !== 'hub.title') throw new Error('global icon registration mismatch')
if (!hubMain || hubMain.spec.key !== ex.SCHEDULED_SESSIONS_ID) throw new Error('global main registration mismatch')
releaseHub(); releaseHub()
if (hubReleases.sort().join(',') !== 'main,sidebar.panellist') throw new Error('paired hub registrations did not clean up exactly once')
let rollbackIcon = 0
const previousWarn = console.warn
const hubWarnings = []
console.warn = (...args) => hubWarnings.push(args)
try {
  hubActivation({
    get: name => services[name],
    effect: fn => fn(),
    slots: {
      inject: (_name, callback) => callback(),
      register: (spec) => {
        if (spec.name === 'main') throw new Error('synthetic occupied main key')
        return () => { rollbackIcon++ }
      },
    },
  })
} finally {
  console.warn = previousWarn
}
if (rollbackIcon !== 1 || hubWarnings.length !== 1) throw new Error('failed paired registration did not warn and roll back the icon exactly once')
if (ex.ownerLabel('blank-id', { blank: true, displayTitle: '  ' }, 'New session') !== 'New session') throw new Error('blank title fallback mismatch')
if (ex.ownerLabel('unknown-id', undefined, 'New session') !== 'unknown-id') throw new Error('unknown session fallback mismatch')
for (const token of ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay', '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-border-l2']) {
  if (!src.includes(token)) throw new Error(`current theme token missing: ${token}`)
}
for (const legacy of ['--dsw-alias-fill-', '--dsw-specific-menu', '--dsw-alias-label-tertiary', '--dsw-alias-label-caption', '--dsw-alias-state-business-primary', '--dsw-alias-bg-mask-1']) {
  if (src.includes(legacy)) throw new Error(`legacy theme token remains: ${legacy}`)
}
for (const lightOnlyFallback of ['#f2f2f2', '#f5f5f5', '#eeeeee', '#e5e5e5']) {
  if (src.toLowerCase().includes(lightOnlyFallback)) throw new Error(`light-only fallback remains: ${lightOnlyFallback}`)
}
if (src.includes('color-scheme:light dark') || src.includes('color-scheme: light dark')) {
  throw new Error('plugin must inherit the DSH-selected color scheme instead of reverting to OS preference')
}
console.log('✓ current light/dark theme token contract')
console.log('\nCLIENT BUNDLE OK')

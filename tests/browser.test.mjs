// Optional real-browser smoke: actual Cron bundle + React in an isolated page.
// No server, live DSH session, or real task API is modified.
// Set DSH_PLAYWRIGHT_MODULE to an existing playwright/index.mjs, or install
// Playwright in your test environment. Chromium must already be installed.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = await import(process.env.DSH_PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.DSH_PLAYWRIGHT_MODULE)).href : '@playwright/test')
const artifacts = process.env.DSH_BROWSER_ARTIFACTS
  ?? await mkdtemp(join(tmpdir(), 'dsh-cron-browser-'))
await mkdir(artifacts, { recursive: true })
const browser = await chromium.launch({ headless: true,
  ...(process.env.DSH_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DSH_CHROMIUM_EXECUTABLE } : {}),
})
const errors = []
const results = []
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
  page.on('pageerror', error => errors.push(error.message))
  await page.setContent(`<!doctype html><html><head><style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
    body { margin:0; background:Canvas; color:CanvasText; }
    #shell { position:relative; z-index:20; padding:24px; }
    #conversation { max-width:660px; line-height:1.7; }
    #panel-host { position:fixed; inset:0; z-index:25; pointer-events:none; }
    #rail { position:absolute; top:14px; right:10px; pointer-events:auto; }
    #sidebar { position:absolute; top:50px; bottom:0; right:0; width:400px; max-width:100vw; pointer-events:auto; }
    #sidebar:empty { display:none; }
  </style></head><body>
    <div id="shell"><div id="root"></div><main id="conversation"><h1>Conversation · isolated test fixture</h1>
    <p>The task scheduler remains independent. The optional panel should not cover sidebar controls or leak task ownership.</p>
    <button id="background-button">Conversation action</button></main></div>
    <div id="panel-host"><button id="rail">Sidebar controls</button><div id="sidebar"></div></div>
  </body></html>`)
  await page.addScriptTag({ path: join(dirname(require.resolve('react/package.json')), 'umd/react.development.js') })
  await page.addScriptTag({ path: join(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js') })
  await page.evaluate(() => { window.__ModuleLoader__ = { load: registration => { window.cronRegistration = registration } } })
  await page.addScriptTag({ path: fileURLToPath(new URL('../lib/client.js', import.meta.url)) })
  await page.evaluate(() => {
    const R = window.React
    const D = window.ReactDOM
    const jsx = (type, props, key) => R.createElement(type, { ...props, ...(key === undefined ? {} : { key }) })
    const plugin = window.cronRegistration.factory(name => {
      if (name === 'react') return R
      if (name === 'react-dom') return D
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: R.Fragment }
      throw new Error('Unexpected import: ' + name)
    })
    let dictionaries
    let language = 'en'
    const t = (key, params) => (dictionaries[language][key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ''))
    const slots = new Map()
    const disposers = []
    let optional
    let owner = 'demo-session-00000000-1111-2222-3333-444444444444'
    window.fetch = async (url, options) => {
      const payload = JSON.parse(options.body)
      if (payload.sessionId !== owner) throw new Error('Unexpected owner')
      const tasks = [0, 1, 2].map(index => ({ id: 'daily-report-' + index, sessionId: owner, prompt: 'Summarize the latest project progress and verification results.', enabled: true, origin: 'dynamic', schedule: { daily: '09:00', timeZone: 'Asia/Shanghai' }, nextRunAt: '2026-09-06T01:00:00Z' }))
      const records = [{ id: 'run-1', taskId: tasks[0].id, sessionId: owner, status: 'completed', firedAt: '2026-09-05T01:00:00Z', scheduledFor: '2026-09-05T01:00:00Z', startedAt: 0, completedAt: 42000, excerpt: 'Task finished. All three reports were reused; no duplicate publication.' }]
      return { json: async () => ({ ok: true, result: String(url).endsWith('/list') ? { tasks } : { records } }) }
    }
    const ctx = {
      effect: fn => { const dispose = fn(); if (dispose) disposers.push(dispose) },
      inject: (_names, callback) => { optional = callback },
      locale: { register: (_ns, value) => { dictionaries = value; return () => {} }, bind: () => t },
      slots: { inject: (_name, fn) => fn(), register: (spec, component) => { slots.set(spec.id, component); return () => {} } },
    }
    plugin.apply(ctx)
    const root = D.createRoot(document.getElementById('root'))
    const sideRoot = D.createRoot(document.getElementById('sidebar'))
    const render = () => root.render(R.createElement(R.Fragment, null,
      R.createElement(slots.get('cron-trigger'), { t, sessionId: owner }),
      R.createElement(slots.get('cron-drawer'), { t })))
    let descriptor
    let bridgeDispose
    let opens = 0
    window.fixture = {
      attach() {
        const service = {
          version: '0.18.0', features: ['targetedOpen', 'floatWindows'],
          registerTab(value) { descriptor = value; return () => { descriptor = null; sideRoot.render(null) } },
          getSnapshot: () => ({ sessionId: owner }), isTabEnabled: () => true,
          openTab(_seed, scope) {
            opens++
            document.getElementById('sidebar').hidden = false
            const state = { activePane: 'right', splits: { kind: 'leaf', id: 'right', tabs: [] }, bottomSplits: { kind: 'leaf', id: 'bottom', tabs: [] }, floats: [] }
            if (descriptor.createTab(state).patch.panelOpen !== true) throw new Error('Panel was not revealed')
            sideRoot.render(R.createElement(descriptor.component, { scope, visible: true }))
          },
        }
        optional({ get: () => service, effect: fn => { bridgeDispose = fn() } })
      },
      detach() { bridgeDispose?.(); bridgeDispose = null },
      opens: () => opens,
      visibility(value) {
        document.getElementById('sidebar').hidden = !value
        sideRoot.render(R.createElement(descriptor.component, { scope: { sessionId: owner }, visible: value }))
      },
      language(value) {
        language = value; render()
        if (descriptor) sideRoot.render(R.createElement(descriptor.component, { scope: { sessionId: owner }, visible: !document.getElementById('sidebar').hidden }))
      },
      cleanup() { bridgeDispose?.(); root.unmount(); sideRoot.unmount(); disposers.reverse().forEach(dispose => dispose()) },
    }
    render()
  })
  const trigger = page.getByRole('button', { name: 'Scheduled tasks', exact: true })
  const dialog = page.locator('dialog')
  await trigger.click()
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true, 'native modal top layer')
  const close = page.getByRole('button', { name: 'Close', exact: true })
  assert.equal(await close.evaluate(element => {
    const box = element.getBoundingClientRect()
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element
  }), true, 'sidebar rail cannot cover dialog close')
  await page.keyboard.press('Tab')
  assert.equal(await page.evaluate(() => document.querySelector('dialog').contains(document.activeElement)), true, 'focus remains in modal')
  assert.equal(await dialog.locator('.dsh-cron-owner').isVisible(), true, 'fallback owner stays visible')
  assert.equal(await dialog.locator('.dsh-cron-drawerTitle').count(), 1, 'fallback retains its own title')
  const fallbackSettings = dialog.locator('.dsh-cron-settings > summary')
  await fallbackSettings.click()
  await page.getByRole('button', { name: 'Sound', exact: true }).focus()
  await page.keyboard.press('Escape')
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true, 'settings Escape must not dismiss modal')
  assert.equal(await fallbackSettings.evaluate(el => el === document.activeElement), true, 'settings Escape restores summary focus')
  assert.equal(await dialog.locator('.dsh-cron-settings').evaluate(el => el.open), false)
  await fallbackSettings.click()
  await page.getByRole('button', { name: 'Test notification', exact: true }).click()
  const toast = page.locator('dialog .dsh-cron-toast')
  await toast.waitFor({ state: 'visible' })
  await toast.click()
  await page.getByText('Task finished. All three reports were reused; no duplicate publication.', { exact: true }).waitFor()
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true, 'toast works while modal stays open')
  await page.screenshot({ path: join(artifacts, 'fallback-light.png') })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'Escape restores trigger focus')
  await trigger.click()
  await dialog.waitFor({ state: 'visible' })
  await page.mouse.click(100, 400)
  await dialog.waitFor({ state: 'detached' })
  assert.equal(await trigger.evaluate(element => element === document.activeElement), true, 'backdrop dismissal restores focus')
  results.push('Native modal, rail layering, focus containment/restoration, Escape, backdrop, modal toast click')

  await page.evaluate(() => window.fixture.attach())
  await trigger.click()
  await page.locator('.dsh-cron-sidebarPanel').waitFor({ state: 'visible' })
  assert.equal(await dialog.count(), 0, 'sidebar mode has no modal')
  const panel = page.locator('.dsh-cron-sidebarPanel')
  assert.equal(await panel.locator('.dsh-cron-drawerHead').count(), 0, 'no repeated embedded heading row')
  assert.equal(await panel.locator('.dsh-cron-drawerTitle').count(), 0, 'outer tab supplies the only visible title')
  assert.equal(await panel.locator('.dsh-cron-owner').isVisible(), false, 'UUID hidden at rest')
  assert.equal(await trigger.locator('.dsh-cron-triggerLabel').count(), 0, 'visible sidebar uses icon-only entry')
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
  const toolbarBox = await panel.locator('.dsh-cron-toolbar').boundingBox()
  assert.ok(toolbarBox.height <= 52, 'embedded chrome fits one compact row')
  for (const button of await panel.locator('.dsh-cron-tabs > button').all()) {
    assert.ok((await button.boundingBox()).width < 150, 'view buttons do not stretch across the whole pane')
  }
  const settingsSummary = panel.locator('.dsh-cron-settings > summary')
  await settingsSummary.click()
  assert.equal(await panel.locator('.dsh-cron-owner').isVisible(), true, 'full owner remains discoverable in settings')
  assert.equal(await panel.locator('.dsh-cron-owner').innerText(), 'Session: demo-session-00000000-1111-2222-3333-444444444444')
  await page.getByRole('button', { name: 'Conversation action', exact: true }).click()
  assert.equal(await panel.locator('.dsh-cron-settings').evaluate(el => el.open), false, 'outside pointer closes menu')
  await trigger.click()
  assert.equal(await page.locator('.dsh-cron-sidebarPanel').count(), 1, 'one sidebar pane')
  assert.equal(await page.evaluate(() => window.fixture.opens()), 2, 'repeat entry focuses sidebar through service')
  await settingsSummary.click()
  await page.evaluate(() => window.fixture.visibility(false))
  await trigger.locator('.dsh-cron-triggerLabel').waitFor({ state: 'visible' })
  assert.equal(await panel.locator('.dsh-cron-settings').evaluate(el => el.open), false, 'hiding pane closes disclosure')
  await trigger.click()
  await panel.waitFor({ state: 'visible' })
  assert.equal(await trigger.locator('.dsh-cron-triggerLabel').count(), 0, 'reopening safely returns compact entry')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.screenshot({ path: join(artifacts, 'sidebar-dark.png') })
  await page.setViewportSize({ width: 360, height: 740 })
  await page.locator('.dsh-cron-settings > summary').click()
  assert.equal(await page.locator('.dsh-cron-sidebarPanel').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'narrow pane does not overflow')
  const assertMenuFits = async () => {
    const host = await panel.boundingBox()
    const menu = await panel.locator('.dsh-cron-settingsBody').boundingBox()
    assert.ok(menu.x >= host.x && menu.x + menu.width <= host.x + host.width + 1, 'settings width stays in host pane')
    assert.ok(menu.y >= host.y && menu.y + menu.height <= host.y + host.height + 1, 'settings is not vertically clipped')
  }
  await assertMenuFits()
  await panel.locator('.dsh-cron-settingsBody button').last().focus()
  await page.keyboard.press('Escape')
  await page.locator('#sidebar').evaluate(el => { el.style.width = '240px'; el.style.height = '200px'; el.style.bottom = 'auto' })
  await settingsSummary.click()
  await assertMenuFits()
  // A short split/float must scroll INSIDE settings rather than clip controls.
  await page.locator('#sidebar').evaluate(el => { el.style.height = '140px' })
  for (const language of ['en', 'zh']) {
    await page.evaluate(value => window.fixture.language(value), language)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await assertMenuFits()
    const lastControl = panel.locator('.dsh-cron-settingsBody button').last()
    await lastControl.focus()
    assert.equal(await lastControl.evaluate(el => {
      const box = el.getBoundingClientRect()
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === el
    }), true, 'last settings control is keyboard-reachable, not clipped by short host')
  }
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.fixture.language('en'))
  await page.locator('#sidebar').evaluate(el => { el.style.removeProperty('width'); el.style.removeProperty('height'); el.style.removeProperty('bottom') })
  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'Tasks', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  assert.equal(await page.locator('.dsh-cron-body').evaluate(element => element.scrollWidth <= element.clientWidth), true, 'narrow editor has no horizontal overflow')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.screenshot({ path: join(artifacts, 'sidebar-narrow.png') })
  await page.evaluate(() => window.fixture.detach())
  await page.locator('.dsh-cron-sidebarPanel').waitFor({ state: 'detached' })
  await trigger.click()
  await dialog.waitFor({ state: 'visible' })
  assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'narrow fallback does not overflow')
  await page.keyboard.press('Escape')
  results.push('Optional sidebar attach/detach, repeated entry, interactive conversation, dark and 360px layout')
  await page.evaluate(() => window.fixture.cleanup())
  assert.deepEqual(errors, [], 'no browser runtime errors')
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ fixture: true, liveGuiModified: false, browserVersion: browser.version(), results, errors }, null, 2))
  console.log(results.map(result => '✓ ' + result).join('\n'))
  console.log('Browser fixture artifacts: ' + artifacts)
} finally {
  await browser.close()
}

// Issue34 SYNTHETIC CONTAINER integration: real built Cron + React + unchanged
// selected upstream registry/controller/store/planners. Not a live GUI claim.
// Every API response, owner, conversation and screenshot is fixture-only.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect } from '@playwright/test'
import { upstreamHarness, CORE_REV, nativeCoreSkipReason } from './fixtures/official-sidebar/upstream.mjs'
import { html, mountContainer } from './fixtures/official-sidebar/browser-container.mjs'

const skip = nativeCoreSkipReason()
if (skip) { console.log('SKIP official native browser integration: ' + skip); process.exit(0) }
const require = createRequire(import.meta.url)
const kind = 'dsh-cron:scheduled-tasks'
const A = 'fixture-owner-A', B = 'fixture-owner-B'
const artifacts = process.env.DSH_BROWSER_ARTIFACTS ?? fileURLToPath(new URL('./fixtures/official-sidebar/artifacts/', import.meta.url))
await mkdir(artifacts, { recursive: true })
const h = upstreamHarness()
const registrations = new Map()
const report = { container: 'SYNTHETIC CONTAINER; not live GUI or official renderer', coreRef: CORE_REV, passed: [], screenshots: [] }
const browser = await chromium.launch({ headless: true, ...(process.env.DSH_CHROMIUM_EXECUTABLE ? { executablePath: process.env.DSH_CHROMIUM_EXECUTABLE } : {}) })
let page
const errors = []
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 820 }, colorScheme: 'light' })
  page.setDefaultTimeout(6000)
  page.on('pageerror', error => errors.push(error.message))
  // Block every browser network request; the sole Cron transport is the local fake fetch.
  await page.route('**/*', route => route.abort('blockedbyclient'))
  const snapshot = () => ({ owners: [...h.stores.keys()].map(owner => {
    const layout = h.layout(owner)
    return { id: owner, expanded: layout.expanded, panes: Object.values(layout.nodes).filter(node => node.kind === 'pane').map(pane => ({
      id: pane.id, host: pane.host, tabs: pane.tabs.map(id => {
        const tab = layout.tabs[id], occurrence = h.occurrence(owner, id)
        return { id, kind: tab.kind, title: tab.title, definitionId: h.tabs.get(tab.kind)?.id,
          visible: pane.host === 'float' || (layout.expanded && pane.activeTabId === id), navigation: occurrence.navigation.getSnapshot() }
      }),
    })) }
  }) })
  await page.exposeFunction('upstreamRPC', command => {
    switch (command.action) {
      case 'register': {
        const { title, ...definition } = command.definition
        assert.equal(definition.guide, undefined, 'Cron must not change Files guide')
        registrations.set(definition.id, h.tabs.register({ ...definition, title: () => title }))
        assert.equal(h.seed().kind, 'files')
        break
      }
      case 'unregister': registrations.get(command.id)?.(); registrations.delete(command.id); break
      case 'mount': h.mount(command.owner); break
      case 'open':
        assert.equal('sessionId' in command.options, false)
        h.controller.openTab(command.kind, command.options); break
      case 'focus': h.controller.focus(command.id); break
      case 'collapse': if (h.controller.isExpanded()) h.controller.toggleExpanded(); break
      case 'split': h.controller.split(); break
      case 'boundOpen': h.occurrence(command.owner, command.id).tabActions.openTab(command.kind, command.options); break
      case 'boundClose': h.occurrence(command.owner, command.id).tabActions.close(); break
      default: throw new Error('Unknown fixture command ' + command.action)
    }
    return snapshot()
  })
  await page.setContent(html)
  await page.clock.install()
  await page.addScriptTag({ path: join(dirname(require.resolve('react/package.json')), 'umd/react.development.js') })
  await page.addScriptTag({ path: join(dirname(require.resolve('react-dom/package.json')), 'umd/react-dom.development.js') })
  await page.evaluate(() => { window.__ModuleLoader__ = { load: registration => { window.cronRegistration = registration } } })
  await page.addScriptTag({ path: fileURLToPath(new URL('../lib/client.js', import.meta.url)) })
  await page.evaluate(mountContainer)
  const clock = page.locator('#trigger button')
  const panel = page.locator('[data-cron-native]:visible')
  const panelsA = () => Object.values(h.layout(A).tabs).filter(tab => tab.kind === kind)
  const screenshot = async name => { const file = 'synthetic-' + name + '.png'; await page.screenshot({ path: join(artifacts, file) }); report.screenshots.push(file) }
  await expect(clock).toBeVisible()
  await clock.click()
  // Old built Cron fails here on missing native behavior, not an import error.
  await expect(panel).toHaveCount(1)
  await expect(panel.getByText('Synthetic A task 0', { exact: true })).toBeVisible()
  await expect(panel.getByText('This session · Fixture project A', { exact: true })).toBeVisible()
  assert.equal((await panel.innerText()).includes(A), false, 'technical owner id stays out of visible resting chrome')
  assert.equal(panelsA().length, 1)
  const originalTab = panelsA()[0].id
  await expect(page.locator('dialog')).toHaveCount(0)
  await expect(panel.locator('.dsh-cron-drawerHead,.dsh-cron-drawerTitle')).toHaveCount(0)
  await expect(clock).toHaveAttribute('aria-expanded', 'true')
  await clock.click()
  await page.evaluate(() => window.fixture.sync())
  assert.deepEqual(panelsA().map(tab => tab.id), [originalTab], 'repeated clock reveals the same genuine upstream-owned page')
  await page.getByLabel('Chat message', { exact: true }).fill('Synthetic chat remains usable')
  await page.getByRole('button', { name: 'Send fixture message', exact: true }).click()
  await expect(page.locator('#chat-output')).toHaveText('Synthetic chat remains usable')
  await screenshot('desktop-light-populated')
  report.passed.push('real registry/controller page dedup; native no-dialog/no repeated title; usable chat')

  await page.evaluate(() => window.fixture.open('history'))
  await expect(panel.getByText('Synthetic A history', { exact: true })).toBeVisible()
  assert.equal(h.occurrence(A, originalTab).navigation.getSnapshot().params.view, 'history')
  await page.evaluate(() => window.fixture.open('tasks'))
  await expect(panel.getByRole('button', { name: 'Tasks', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const settings = panel.locator('.dsh-cron-settings > summary')
  await settings.focus()
  await page.keyboard.press('Enter')
  await expect(panel.locator('.dsh-cron-settings')).toHaveJSProperty('open', true)
  await panel.getByRole('button', { name: 'Sound', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(settings).toBeFocused()
  await expect(panel.locator('.dsh-cron-settings')).toHaveJSProperty('open', false)
  report.passed.push('actual navigation params Tasks/History; settings keyboard Escape restores focus')

  // An A-owned toast retained after switching to B may not use the mounted
  // public native controller to open B. The owner-safe fallback is required.
  await settings.click()
  await panel.getByRole('button', { name: 'Test notification', exact: true }).click()
  await expect(page.locator('.dsh-cron-toast')).toHaveCount(1)
  await page.evaluate(owner => window.fixture.switchOwner(owner), B)
  await page.locator('.dsh-cron-toast').click()
  await expect(page.locator('dialog')).toBeVisible()
  await expect(page.locator('dialog').getByText('Synthetic A history', { exact: true })).toBeVisible()
  assert.equal(Object.values(h.layout(B).tabs).filter(tab => tab.kind === kind).length, 0, 'old A toast must not open mounted B native page')
  await page.keyboard.press('Escape')
  await page.evaluate(owner => window.fixture.switchOwner(owner), A)
  await page.evaluate(() => window.fixture.open('tasks'))
  await expect(panel.getByText('Synthetic A task 0', { exact: true })).toBeVisible()
  report.passed.push('old A toast after switching to B uses A-owned history fallback, not B native controller')

  // Pending destructive action is fake transport only; it must never double submit.
  await page.evaluate(owner => window.fixture.mode(owner, 'delete-pending'), A)
  await panel.getByRole('button', { name: 'Delete', exact: true }).first().click()
  const confirm = panel.getByRole('button', { name: 'Confirm delete', exact: true })
  await confirm.click()
  await expect(confirm).toBeDisabled()
  await expect(panel.locator('.dsh-cron-actions[aria-busy="true"]')).toHaveCount(1)
  let state = await page.evaluate(() => window.fixture.state())
  assert.equal(state.requests.filter(request => request.method === 'remove').length, 1)
  await screenshot('desktop-light-delete-pending')
  await page.evaluate(owner => { window.fixture.mode(owner, 'populated'); window.fixture.resolveHeld() }, A)
  await expect(panel.getByText('Synthetic A task 0', { exact: true })).toHaveCount(0)
  report.passed.push('delete confirmation, pending disabled controls, one fixture-only mutation')

  // Hold old A fetches across owner switch. Carrier intentionally ignores abort.
  await page.evaluate(owner => window.fixture.mode(owner, 'loading'), A)
  await page.evaluate(() => window.fixture.hide())
  await expect(clock).toHaveAttribute('aria-expanded', 'false')
  await clock.click()
  await expect(panel.locator('.dsh-cron-body')).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(owner => window.fixture.switchOwner(owner), B)
  await expect(clock).toHaveAttribute('aria-expanded', 'false')
  await clock.click()
  await expect(panel.getByText('Synthetic B task 0', { exact: true })).toBeVisible()
  await page.evaluate(owner => { window.fixture.mode(owner, 'populated'); window.fixture.resolveHeld() }, A)
  await expect(panel.getByText(/Synthetic A/)).toHaveCount(0)
  state = await page.evaluate(() => window.fixture.state())
  assert.ok(state.requests.some(request => request.owner === A && request.aborted), 'A in-flight request lease aborts when hidden/switched')
  await page.evaluate(() => window.fixture.open('history'))
  await expect(panel.getByText('Synthetic B history', { exact: true })).toBeVisible()
  await page.emulateMedia({ colorScheme: 'dark' })
  await screenshot('desktop-dark-history-owner-B')
  report.passed.push('A/B tasks/history ownership; stale success ignored; hidden lease aborts; dark history')

  // Genuine upstream split planner creates a second pane. Closing one occurrence
  // cannot clear visibility held by another occurrence in the same owner.
  await page.evaluate(() => window.fixture.split())
  let nativeB = Object.values(h.layout(B).tabs).filter(tab => tab.kind === kind)
  const splitPane = Object.values(h.layout(B).nodes).find(node => node.kind === 'pane' && !node.tabs.includes(nativeB[0].id)).id
  await page.evaluate(paneId => window.fixture.open('tasks', paneId), splitPane)
  await expect(panel).toHaveCount(2)
  nativeB = Object.values(h.layout(B).tabs).filter(tab => tab.kind === kind)
  await page.evaluate(({ owner, id }) => window.fixture.close(owner, id), { owner: B, id: nativeB[0].id })
  await expect(panel).toHaveCount(1)
  await expect(clock).toHaveAttribute('aria-expanded', 'true')
  report.passed.push('actual split planner; multi-pane visibility reference retained after one occurrence closes')

  // Batch light/dark/narrow states once. Reload through hide/reveal exercises
  // the same public navigation, not private Cron hooks or direct state writes.
  // Close synthetic Files seed tabs through their public occurrence actions;
  // native product room rules would not create a second tiny split at 390px.
  for (const tab of Object.values(h.layout(B).tabs).filter(tab => tab.kind !== kind)) {
    await page.evaluate(({ owner, id }) => window.fixture.close(owner, id), { owner: B, id: tab.id })
  }
  await page.setViewportSize({ width: 390, height: 780 })
  for (const mode of ['empty', 'loading', 'error']) {
    await page.evaluate(({ owner, mode }) => window.fixture.mode(owner, mode), { owner: B, mode })
    if (mode === 'loading') {
      for (const tab of Object.values(h.layout(B).tabs).filter(tab => tab.kind === kind)) {
        await page.evaluate(({ owner, id }) => window.fixture.close(owner, id), { owner: B, id: tab.id })
      }
    }
    await page.evaluate(() => window.fixture.hide())
    await expect(clock).toHaveAttribute('aria-expanded', 'false')
    await clock.click()
    await page.evaluate(() => window.fixture.sync())
    if (mode === 'empty') await expect(panel.locator('.dsh-cron-list')).toContainText(/No scheduled tasks/i)
    if (mode === 'loading') {
      await expect(panel.locator('.dsh-cron-body')).toHaveAttribute('aria-busy', 'true')
      await expect(panel.getByRole('status')).toContainText(/Loading/i)
    }
    if (mode === 'error') await expect(panel.getByRole('alert')).toContainText('Synthetic carrier unavailable')
    assert.equal(await panel.evaluate(element => element.scrollWidth <= element.clientWidth), true, 'narrow native panel does not overflow')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'synthetic container fits the viewport too')
    const panelBox = await panel.boundingBox()
    assert.ok(panelBox.x >= 0 && panelBox.x + panelBox.width <= 390, 'the entire native body is on screen')
    await screenshot('narrow-dark-' + mode)
  }
  await page.evaluate(owner => { window.fixture.mode(owner, 'populated'); window.fixture.resolveHeld() }, B)
  await panel.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(panel.getByText('Synthetic B task 0', { exact: true })).toBeVisible()
  await page.emulateMedia({ colorScheme: 'light' })
  await screenshot('narrow-light-populated')
  report.passed.push('narrow empty/loading/error/retry/populated, light/dark, horizontal overflow guard')

  // Native service disappears: real built Cron must still offer old-Core paths.
  await page.evaluate(() => window.fixture.detachNative())
  await clock.click()
  const dialog = page.locator('dialog')
  await expect(dialog).toBeVisible()
  assert.equal(await dialog.evaluate(element => element.matches(':modal')), true)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(clock).toBeFocused()
  await page.evaluate(() => window.fixture.attachLegacy())
  await clock.click()
  await expect(page.locator('#legacy .dsh-cron-sidebarPanel')).toBeVisible()
  await expect(dialog).toHaveCount(0)
  state = await page.evaluate(() => window.fixture.state())
  assert.equal(state.calls.filter(call => call.action === 'legacyOpen').at(-1).owner, B)
  await page.evaluate(() => window.fixture.detachLegacy())
  report.passed.push('native-unavailable modal focus restoration and compatible legacy sidebar fallback')
  await page.evaluate(() => window.fixture.cleanup())
  await expect(page.locator('style[data-plugin="dsh-cron"]')).toHaveCount(0)
  assert.deepEqual(errors, [])
  assert.deepEqual(state.faults, [])
  report.passed.push('plugin disposal removes style and body registrations; no browser page errors')
  console.log('OFFICIAL NATIVE SIDEBAR SYNTHETIC INTEGRATION PASSED\n' + JSON.stringify(report, null, 2))
} catch (error) {
  report.failure = String(error.message ?? error)
  throw error
} finally {
  await writeFile(join(artifacts, 'synthetic-report.json'), JSON.stringify(report, null, 2) + '\n')
  await browser.close()
  registrations.forEach(dispose => dispose())
  await h.dispose()
}

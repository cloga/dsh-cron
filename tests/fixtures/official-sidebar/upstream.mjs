// Read-only immutable Core loader. No Core worktree, artifact, source, or config writes.
// TypeScript syntax erasure only; executed modules are unchanged tagged Git blobs.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import { CORE_COMMITS } from '../../core-source.mjs'
export const CORE_SOURCE = process.env.DSH_CORE_PATH?.trim()
const requestedRef = process.env.DSH_NATIVE_CORE_REF?.trim() || process.env.DSH_CORE_REF?.trim() || 'HEAD'
if (!CORE_SOURCE && requestedRef !== 'HEAD') throw new Error('An explicit Core ref requires DSH_CORE_PATH')
export const CORE_REV = CORE_SOURCE ? execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${requestedRef}^{commit}`], { cwd: CORE_SOURCE, encoding: 'utf8', windowsHide: true }).trim() : 'not configured'
if (CORE_SOURCE && !CORE_COMMITS.has(CORE_REV)) throw new Error('Native tests require an exact allowlisted official Core commit')
export function nativeCoreSkipReason() {
  if (!CORE_SOURCE) return 'DSH_CORE_PATH not supplied: native Core execution was NOT exercised'
  if (!existsSync(CORE_SOURCE)) throw new Error('DSH_CORE_PATH does not exist')
  try {
    execFileSync('git', ['cat-file', '-e', `${CORE_REV}:packages/client/ui-sidebar-right/src/client/tab-registry.ts`], { cwd: CORE_SOURCE, stdio: 'ignore', windowsHide: true })
  } catch {
    // An invalid revision is a configuration failure, not an old-Core skip.
    execFileSync('git', ['rev-parse', '--verify', `${CORE_REV}^{commit}`], { cwd: CORE_SOURCE, stdio: 'ignore', windowsHide: true })
    return `Core ${CORE_REV} has no native tab registry: native tests skipped; existing legacy/dialog suites remain required`
  }
  return false
}
export const SIDEBAR = 'packages/client/ui-sidebar-right/src/client/'
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../../../', import.meta.url))
const blobs = new Map()
export function coreBlob(path) {
  if (!/^(?:packages\/client\/(?:ui-sidebar-right|ui-sidebar-files|ui-dockkit|store)\/src\/|packages\/util\/crypto\/src\/)[\w./-]+\.(?:ts|tsx)$/.test(path) || path.split('/').includes('..')) {
    throw new Error(`Outside readonly native fixture source allowlist: ${path}`)
  }
  if (!blobs.has(path)) blobs.set(path, execFileSync('git', ['show', `${CORE_REV}:${path}`], {
    cwd: CORE_SOURCE, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  }))
  return blobs.get(path)
}

// This is import resolution, not replacement implementations. Resolve only ordinary
// installed dependencies; never install, download, rewrite, or load another Core.
function ordinary(name) {
  if (!['picomatch/posix', 'zustand/vanilla', 'zustand/middleware', 'zustand/shallow', 'immer'].includes(name)) {
    throw new Error(`Unreviewed ordinary dependency ${name}`)
  }
  try { return require(name) } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    const packageName = name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]
    const cache = join(root, 'node_modules', '.pnpm')
    const prefix = packageName.replace('/', '+') + '@'
    const candidates = readdirSync(cache).filter(entry => entry.startsWith(prefix)).sort()
    if (candidates.length !== 1) throw new Error(`Expected one installed ordinary dependency ${packageName}, got ${candidates.length}`)
    return createRequire(join(cache, candidates[0], 'node_modules', packageName, 'package.json'))(name)
  }
}

export function createCoreLoader() {
  const modules = new Map()
  const load = path => {
    if (modules.has(path)) return modules.get(path).exports
    const module = { exports: {} }
    modules.set(path, module)
    const source = coreBlob(path)
    // Dockkit's barrel exports UI too. Lazily resolve its exact public named
    // re-exports so engine tests do not load unrelated React/CSS/drag surfaces.
    // Export names and module paths come from the actual tagged barrel AST.
    if (path === 'packages/client/ui-dockkit/src/index.ts') {
      const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
      for (const statement of ast.statements) {
        if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || !statement.moduleSpecifier || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue
        for (const entry of statement.exportClause.elements) {
          if (entry.isTypeOnly) continue
          Object.defineProperty(module.exports, entry.name.text, { enumerable: true,
            get: () => load(posix.join(posix.dirname(path), statement.moduleSpecifier.text))[entry.propertyName?.text ?? entry.name.text] })
        }
      }
      return module.exports
    }
    const output = ts.transpileModule(source, { fileName: path, compilerOptions: {
      target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
    } }).outputText
    const localRequire = name => {
      if (name.startsWith('.')) return load(posix.join(posix.dirname(path), name))
      if (name === '@deepseek-ai/dsh-client-store') return load('packages/client/store/src/index.ts')
      if (name === '@deepseek-ai/dsh-client-ui-dockkit') return load('packages/client/ui-dockkit/src/index.ts')
      if (name === '@deepseek-ai/dsh-util-crypto') return load('packages/util/crypto/src/index.ts')
      if (name.startsWith('@deepseek-ai/')) throw new Error(`Unreviewed Core runtime dependency ${name}`)
      return ordinary(name)
    }
    new Function('require', 'module', 'exports', output + '\n//# sourceURL=tagged-core/' + path)(localRequire, module, module.exports)
    return module.exports
  }
  return { load, loaded: () => [...modules.keys()] }
}

export function upstreamHarness() {
  const { load, loaded } = createCoreLoader()
  const { Context } = require('@deepseek-ai/cordis')
  const ctx = new Context()
  const { SidebarRightTabRegistry } = load(SIDEBAR + 'tab-registry.ts')
  const { createSidebarRightController } = load(SIDEBAR + 'service.ts')
  const { createSidebarRightStore } = load(SIDEBAR + 'stores.ts')
  const { defaultSeed, makeGuideTab } = load(SIDEBAR + 'contract/seed.ts')
  // alpha.1's actual store accepted a guide-title thunk; alpha.2/rc.2 accept
  // the registry-selected seed thunk. Preserve, rather than backport, each.
  const initialSeed = () => defaultSeed ? defaultSeed(tabs) : makeGuideTab('fixture-seed', 'Guide')
  const storeSeed = () => defaultSeed ? initialSeed() : 'Guide'
  const tabs = new SidebarRightTabRegistry(ctx)
  tabs.register({ id: 'fixture/guide', kind: 'guide', title: () => 'Guide', priority: 'builtin' })
  tabs.register({ id: 'fixture/files', kind: 'files', title: () => 'Files', priority: 'builtin', guide: [{ id: 'workspace', order: 0, title: () => 'Files' }] })
  const pins = []
  const { controller, adopt } = createSidebarRightController(tabs, (address, signal) => pins.push({ address, signal }))
  const stores = new Map()
  const releases = []
  let mounted
  let bindingRelease
  const publish = () => {
    if (!mounted) return
    const instance = stores.get(mounted)
    bindingRelease?.()
    bindingRelease = controller.bind({ sessionId: mounted, actions: instance.actions,
      surfaces: instance.getSnapshot().bySession, canSplitPane: () => true })
  }
  const ensure = owner => {
    if (!stores.has(owner)) {
      const instance = createSidebarRightStore(storeSeed).create(owner)
      stores.set(owner, instance)
      releases.push(adopt(owner, instance), instance.subscribe(publish))
      instance.actions.open(owner)
    }
    return stores.get(owner)
  }
  const mount = owner => { ensure(owner); mounted = owner; publish() }
  const layout = owner => ensure(owner).getSnapshot().bySession[owner].layout
  const occurrence = (owner, id) => controller.tabDomain.occurrence(owner, { id })
  return { tabs, controller, stores, mount, layout, occurrence, pins, loaded,
    seed: initialSeed,
    dispose() { bindingRelease?.(); releases.reverse().forEach(release => release()); controller.tabDomain.dispose(); return ctx.fiber.dispose() },
  }
}

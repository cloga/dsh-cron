// Immutable source-backed modern transport fixture. No Core build, installed
// Desktop dependency, credential lookup, Connection.apply, sockets or Agents.
// Only TypeScript syntax/module transformation; Context, Service, registry,
// request trust and HTTP bridge execute the unchanged allowlisted Git blobs.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { posix } from 'node:path'
import ts from 'typescript'

export const CORE_REF = 'fb2c4b9e698e30edb738bca4cf0618587db7d203'
export const CORE_SOURCE = process.env.DSH_TRANSPORT_CORE_PATH?.trim() || process.env.DSH_CORE_PATH?.trim()
if (!CORE_SOURCE) throw new Error('Modern Connection tests require DSH_TRANSPORT_CORE_PATH (or DSH_CORE_PATH) containing the fixed Core rc.2 commit; modern verification cannot skip')
if (!existsSync(CORE_SOURCE)) throw new Error('Modern Connection Core source path does not exist')

const allowed = new Set([
  ...['index', 'context', 'events', 'utils', 'logger', 'reflect', 'fiber', 'registry', 'service'].map(name => `vendor/cordis/src/${name}.ts`),
  ...['index', 'array', 'misc', 'types', 'string', 'time'].map(name => `vendor/cosmokit/src/${name}.ts`),
  ...['rpc-host', 'rpc', 'rpc-schema', 'http-bridge', 'api-request-trust', 'loopback-hostname', 'api-path'].map(name => `packages/client/connection/src/${name}.ts`),
])
const env = { ...process.env }
// Harness callers can inherit a partial process-scoped Git configuration tuple.
// The fixture needs no injected Git configuration and never changes global Git.
for (const key of Object.keys(env)) if (key.startsWith('GIT_CONFIG_')) delete env[key]
const git = (args) => execFileSync('git', args, {
  cwd: CORE_SOURCE, env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
})
let actual
try { actual = git(['rev-parse', '--verify', '--end-of-options', `${CORE_REF}^{commit}`]).trim() } catch (error) {
  throw new Error(`Modern Connection source checkout must contain fixed commit ${CORE_REF}; fetch that object without changing its checkout`, { cause: error })
}
assert.equal(actual, CORE_REF, 'modern transport always executes the exact audited commit, not matrix HEAD/DSH_CORE_REF')

const require = createRequire(import.meta.url)
assert.equal(require('zod/package.json').version, '4.4.3', 'modern fixture requires the frozen root zod 4.4.3 dependency')
const modules = new Map()
function load(path) {
  if (!allowed.has(path)) throw new Error(`Outside modern transport source allowlist: ${path}`)
  if (modules.has(path)) return modules.get(path).exports
  const module = { exports: {} }
  modules.set(path, module) // preserve the actual Cordis circular module graph
  const source = git(['show', `${CORE_REF}:${path}`])
  const output = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const localRequire = (name) => {
    if (name.startsWith('.')) return load(posix.join(posix.dirname(path), name))
    if (name === '@deepseek-ai/cordis') return load('vendor/cordis/src/index.ts')
    if (name === '@deepseek-ai/cosmokit') return load('vendor/cosmokit/src/index.ts')
    if (name === 'node:stream' || name === 'zod') return require(name)
    throw new Error(`Unreviewed modern transport runtime dependency: ${name}`)
  }
  new Function('require', 'module', 'exports', output + `\n//# sourceURL=tagged-core/${CORE_REF}/${path}`)(localRequire, module, module.exports)
  return module.exports
}

// rpc-host.ts is the actual implementation re-exported by Connection's public
// index. Its BrowserAuth/WebRoute/brand references are type-only, not stubbed
// dependencies. Loading index/apply would unnecessarily include activation code.
export const { Context } = load('vendor/cordis/src/index.ts')
export const { HostConnectionService } = load('packages/client/connection/src/rpc-host.ts')
export const { bridge } = load('packages/client/connection/src/http-bridge.ts')
export const loaded = Object.freeze([...modules.keys()])
assert.equal(loaded.length, 22, 'audit any change to the executable source closure')

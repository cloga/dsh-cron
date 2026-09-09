// Read immutable source blobs without checking out, installing or modifying Core.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

export const CORE_COMMITS = new Map([
  ['a66e4702047846cdaa10c66c9d3df3951f5ea70d', '0.1.2-rc.1'],
  ['d347e703908d0406b7a7ef80e3a0e594d86b2215', '0.1.3-alpha.1'],
  ['5dda764ed3aa172535a7967b06ff95d9cbfe536a', '0.1.5-alpha.1'],
  ['b2e3b2a0125854567a4a5fcba75782e42fe84901', '0.1.5-alpha.2'],
])

export function assertSourceIdentity(commit, status, version) {
  assert.ok(CORE_COMMITS.has(commit), 'Core must resolve to an exact supported official commit')
  assert.equal(status, '', 'Core source checkout must have no tracked modifications')
  assert.equal(version, CORE_COMMITS.get(commit), 'Core version must match the exact commit')
}

export function openCoreSource(corePath, ref) {
  const git = args => execFileSync('git', ['-C', corePath, ...args], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  }).trim()
  // Resolve before using it in any pathspec. No checkout, fetch or working-tree writes.
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${ref || 'HEAD'}^{commit}`])
  assert.ok(CORE_COMMITS.has(commit), 'Core must resolve to an exact supported official commit')
  const read = ref
    ? path => git(['show', `${commit}:${path}`])
    : path => readFileSync(join(corePath, path), 'utf8')
  const version = JSON.parse(read('apps/cli/package.json')).version
  const status = ref ? '' : git(['status', '--porcelain', '--untracked-files=no'])
  assertSourceIdentity(commit, status, version)
  return { commit, version, read, mode: ref ? 'immutable git ref' : 'clean checkout' }
}

export function declaration(source, name, predicate) {
  const file = ts.createSourceFile('contract.ts', source, ts.ScriptTarget.Latest, true)
  const node = file.statements.find(node => predicate(node) && node.name?.text === name)
  assert.ok(node, `missing declaration ${name}`)
  return node
}

export function assertHandleContract(source, modern) {
  const handle = declaration(source, 'SessionHandle', ts.isInterfaceDeclaration)
  const read = handle.members.find(member => member.name?.getText() === 'read')
  assert.ok(read && ts.isMethodSignature(read), 'SessionHandle.read must be a method')
  assert.equal(read.type?.getText(), modern ? 'Promise<SessionHandleReadResult>' : 'Promise<readonly SessionEvent[]>')
  assert.deepEqual(read.parameters.map(parameter => parameter.name.getText()), ['offset', 'length', 'options'])
  assert.ok(read.parameters.every(parameter => parameter.questionToken), 'read() must allow no arguments')
  assert.equal(handle.members.find(member => member.name?.getText() === 'close')?.type?.getText(), 'Promise<void>')
  assert.equal(handle.members.find(member => member.name?.getText() === 'header')?.type?.getText(), 'SessionHeader')
  if (modern) {
    const result = declaration(source, 'SessionHandleReadResult', ts.isInterfaceDeclaration)
    assert.equal(result.members.find(member => member.name?.getText() === 'events')?.type?.getText(), 'readonly SessionEvent[]')
    assert.equal(result.members.find(member => member.name?.getText() === 'eventState')?.type?.getText(), 'SessionSeedEventState')
  }
}

// Execute the exact JSONL handle class, not a handwritten read-shape marker.
// Only the class is transpiled; storage IO and imported error classes are test doubles.
// This is a source-backed handle test, NOT a full Core/JSONL migration integration.
export function loadJsonlHandle(read) {
  const node = declaration(read('packages/session/session-persistence-jsonl/src/storage.ts'), 'JsonlSessionHandle', ts.isClassDeclaration)
  const code = ts.transpileModule(node.getText().replace(/^export /, ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  const failWrite = () => { throw new Error('source-backed read test attempted a write') }
  return new Function('SessionHandleClosedError', 'SessionPersistenceNotFoundError', 'SessionReadOnlyError',
    'errorChain', 'materializeAppendBatch', 'assertContiguous', `${code}\nreturn JsonlSessionHandle`)(
    Error, Error, Error, String, failWrite, failWrite,
  )
}

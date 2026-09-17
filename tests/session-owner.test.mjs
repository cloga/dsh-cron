import assert from 'node:assert/strict'
import { test } from 'node:test'
import { unrun } from 'unrun'
import { fileURLToPath } from 'node:url'
const { module: { mainSessionOwner, createHeaderOwners } } = await unrun({ path: fileURLToPath(new URL('../src/client/session-owner.ts', import.meta.url)) })

test('alpha.2 main retention wins over embedded instances and rejects ambiguity', () => {
  assert.equal(mainSessionOwner({ byId: { A: { retainedBy: { mainView: 1 } }, B: { retainedBy: { sidebar: 1 } } } }), 'A')
  assert.equal(mainSessionOwner({ current: 'B', byId: { A: { retainedBy: { mainView: 1 } }, B: {} } }), 'A')
  assert.equal(mainSessionOwner({ current: 'A', byId: { A: { retainedBy: {} } } }), null)
  assert.equal(mainSessionOwner({ byId: { A: { retainedBy: { mainView: 1 } }, B: { retainedBy: { mainView: 1 } } } }), null)
  assert.equal(mainSessionOwner({ current: 'A', byId: { A: {} } }), 'A')
})
test('embedded mount/unmount and duplicate main headers cannot hijack or clear watcher owner', () => {
  let owner
  const leases = createHeaderOwners(value => { owner = value })
  const a = leases.mount('A', 'A')
  const duplicate = leases.mount('A', 'A')
  const b = leases.mount('B', 'A')
  assert.equal(owner, 'A')
  a(); a()
  assert.equal(owner, 'A')
  b()
  assert.equal(owner, 'A')
  duplicate()
  assert.equal(owner, null)
  const legacyA = leases.mount('A')
  const legacyB = leases.mount('B')
  assert.equal(owner, null, 'legacy multi-owner ambiguity fails closed')
  legacyB(); assert.equal(owner, 'A')
  leases.clear(); legacyA(); assert.equal(owner, null)
})

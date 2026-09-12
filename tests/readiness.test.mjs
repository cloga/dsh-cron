import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { assertReleaseMetadata } from '../scripts/release-policy.mjs'
import { CORE_COMMITS } from './core-source.mjs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const manifest = JSON.parse(read('package.json'))
const ci = read('.github/workflows/ci.yml')
const release = read('.github/workflows/release.yml')

test('version, published install examples and release notes agree', () => {
  assertReleaseMetadata({ version: manifest.version, changelog: read('CHANGELOG.md'), readme: read('README.md') })
  assert.equal(manifest.scripts['release:check'], 'node scripts/release-policy.mjs')
  assert.match(manifest.scripts.verify, /pnpm test:release/)
  assert.match(manifest.scripts['test:release'], /tests\/readiness\.test\.mjs/)
  for (const script of ['prepare', 'preinstall', 'install', 'postinstall']) {
    assert.equal(manifest.scripts[script], undefined, 'package must not gain install-time code execution')
  }
})

test('fresh agents have discoverable source, test, safety and delivery instructions', () => {
  const guide = read('AGENTS.md')
  for (const marker of ['pwd', 'git status', 'pnpm verify', 'pnpm test:sidebar', 'DSH_CORE_PATH',
    'release-ready', 'SHA256SUMS', 'immutable', 'main CI', 'checkout', 'Expected vs Actual',
    'Merged ≠ released ≠ installed ≠ active']) assert.ok(guide.includes(marker), `Agent guide missing ${marker}`)
  for (const path of ['AGENTS.md', 'docs/agentic-readiness.md', 'RELEASE.md',
    '.github/pull_request_template.md', 'index.js', 'src/client/sidebar.ts',
    'scripts/release-policy.mjs', 'scripts/publish-release.mjs', 'tests/sidebar-contract.test.mjs']) {
    assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), `Missing agent entrypoint ${path}`)
  }
  assert.ok(read('README.md').includes('[`AGENTS.md`](AGENTS.md)'))
  assert.ok(read('.github/pull_request_template.md').includes('Release decision (required)'))
  assert.ok(read('RELEASE.md').includes('original exact-SHA main CI run'))
})

test('PR policy and immutable source build are wired into CI', () => {
  assert.ok(ci.includes('BASE_SHA: ${{ github.event.pull_request.base.sha || github.event.before }}'))
  assert.ok(ci.includes('run: node scripts/release-policy.mjs --base "$BASE_SHA"'))
  assert.ok(ci.includes('fetch-depth: 0'))
  for (const workflow of [ci, release]) {
    assert.ok(workflow.includes('git diff --exit-code -- lib/client.js'))
    assert.ok(workflow.includes('persist-credentials: false'))
    assert.ok(!workflow.includes('pull_request_target:'))
    assert.ok(!workflow.includes('workflow_run:'))
  }
})

test('every exact Core baseline remains wired into CI, release and documentation', () => {
  assert.equal(CORE_COMMITS.get('fb2c4b9e698e30edb738bca4cf0618587db7d203'), '0.1.5-rc.2')
  assert.equal(CORE_COMMITS.size, 5)
  assert.ok(ci.includes("os: [ubuntu-latest, windows-latest]"))
  assert.ok(ci.includes("node: ['22.19.0', '24']"))
  for (const [commit, version] of CORE_COMMITS) {
    assert.ok(ci.includes(`ref: ${commit}`), `CI missing Core ${version}`)
    const checkout = release.match(new RegExp(`ref: ${commit}\\n +path: ([^\\n]+)`))
    assert.ok(checkout, `Release missing Core ${version} checkout`)
    const path = checkout[1].trim()
    const sourceStep = release.split(/\n      - /).find(step => step.includes('DSH_CORE_PATH: ${{ github.workspace }}/' + path))
    assert.ok(sourceStep, `Release must test ${version}, not just check it out`)
    assert.match(sourceStep, /run: pnpm (?:verify|test:core)\s*$/, `Release must execute the source suite for ${version}`)
    assert.ok(!sourceStep.includes('continue-on-error'), 'Source compatibility must not be advisory')
    for (const document of ['README.md', 'RELEASE.md', 'docs/agentic-readiness.md']) {
      assert.ok(read(document).includes(commit), `${document} missing exact Core ${version}`)
    }
  }
})

test('stable required gate fails for failed, cancelled and skipped dependencies', () => {
  const gate = ci.split('\n  release-ready:\n')[1]?.split('\n  publish:\n')[0]
  assert.ok(gate)
  assert.ok(gate.includes('if: ${{ always() }}'))
  assert.ok(gate.includes('needs: [release-policy, verify, sidebar-browser]'))
  const command = gate.match(/run: node -e '([^']+)'/)
  assert.ok(command, 'Required-check command must stay testable without Actions')
  for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
    for (const name of ['release-policy', 'verify', 'sidebar-browser']) {
      const needs = Object.fromEntries(['release-policy', 'verify', 'sidebar-browser'].map(key => [key, { result: key === name ? result : 'success' }]))
      const run = spawnSync(process.execPath, ['-e', command[1]], {
        env: { ...process.env, NEEDS_RESULTS: JSON.stringify(needs) }, encoding: 'utf8',
      })
      assert.equal(run.status, result === 'success' ? 0 : 1, `${name}: ${result}`)
    }
  }
})

test('publishing has only the gated trusted main CI entry point', () => {
  const publish = ci.split('\n  publish:\n')[1]
  assert.ok(publish?.includes('needs: [release-ready]'))
  assert.ok(publish.includes('uses: ./.github/workflows/release.yml'))
  const guard = "github.event_name == 'push' && github.ref == 'refs/heads/main' && github.repository == 'cloga/dsh-cron'"
  assert.ok(publish.includes(guard))
  assert.ok(release.includes(guard))
  const events = release.split('\non:\n')[1]?.split('\npermissions:\n')[0]
  assert.equal(events?.trim(), 'workflow_call:', 'No standalone tag/dispatch path may bypass the CI matrix')
  assert.ok(release.includes('group: dsh-cron-release-${{ github.sha }}'))
  assert.ok(release.includes('cancel-in-progress: false'))
  assert.ok(release.includes('timeout-minutes: 30'))
  assert.ok(release.includes('ref: ${{ needs.plan.outputs.sha }}'))
  assert.ok(release.includes('run: node scripts/release-policy.mjs --plan'))
  assert.ok(release.includes('run: node scripts/publish-release.mjs "${RELEASE_TAG#v}"'))
  assert.ok(release.includes('GITHUB_TOKEN: ${{ github.token }}'))
  assert.ok(!release.includes('secrets.GH_TOKEN'), 'Do not require a personal token for automatic publication')
  assert.ok(!release.includes('gh release create'), 'Publisher owns draft/retry/digest invariants')
  assert.ok(release.indexOf('pnpm test:sidebar') < release.indexOf('node scripts/publish-release.mjs'))
  assert.ok(release.indexOf('sha256sum --check SHA256SUMS') < release.indexOf('node scripts/publish-release.mjs'))
})

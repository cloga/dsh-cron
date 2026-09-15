# Agentic readiness and delivery map

The entry contract is [`../AGENTS.md`](../AGENTS.md). This document explains how a fresh agent finds the right code, chooses evidence, and finishes a release without relying on another session's memory.

## Architecture boundaries

```text
Session-bound model Tools ─┐
                          ├─ index.js ─ task store + history ─ owning Session followup
Session-bound /cron/api ───┘                 │
                                            └─ run lifecycle correlation
src/client/index.tsx ─ shared Session-aware UI/notification state
    ├─ global-hub.tsx ─ optional root owner index + public Workspace navigation
    ├─ native-sidebar.ts ─ optional official registry + keyed body Slot adapter
    ├─ header action selects the current owner's native tab
    ├─ sidebar.ts ─ retained optional Better Sidebar public adapter
    ├─ shell overlay ─ pinned old-owner / unavailable-service dialog fallback
    └─ locale.ts / styles.ts
                  │ tsdown
                  └─ lib/client.js (committed ModuleLoader distribution)
```

The official native adapter is preferred when its registry, controller and keyed body seat are available. It contributes no guide card, preserving the selected Core's first-open behavior. Do not conflate Cron's scheduled-task tab with Better Sidebar's subagent **Tasks** tab. The legacy adapter is secondary; no compatible surface or an old-owner notification still uses a pinned dialog. UI availability depends on the installed Cron version and active Client, not merely a merged commit. Never call native private openTabIn or infer another session's ownership from the current header.

Host mutations must carry a live root Session owner. A cold owner is resumed only from its own durable state, never from a fallback Session; a failed read/close/resume remains retryable. Client polling must reject stale-owner results and unwind listeners/timers on disposal. These boundaries matter more than cosmetic test snapshots.

Version 0.7.0 adds an optional human-only global owner index without changing Core blank-Session semantics. The Host `owners` read groups current tasks in memory, omits legacy unbound records without rewriting them, and returns only the owner Session id, task/enabled counts and earliest next-run time; it never reads Session events/history, wakes an Agent, returns task content or mutates scheduler state. The Client enriches those rows from the already-available public Session-list snapshot, then navigates with `uiWorkspace.openSession`. Paired root `sidebar.panellist`/`main` registrations belong to one optional service/Slot lifetime; missing capabilities leave the existing current-owner panels and scheduler untouched. Tests must prove privacy-minimal output, no task/cache writes, exact blank-owner navigation, cancellation/stale-response behavior and complete paired disposal.

Version 0.6.0 adds the direct-human `/cron-transfer` ownership mutation. It is a command-registry surface only: no model tool or HTTP route. The batch fences all task IDs before awaiting, rejects overlap, verifies modern targets through stable `stat/open/read/close/stat` snapshots (legacy public `inspect` only on old seams), applies the latest `agent-preset/selected` projection, and takes final parallel reads. Version 0.7.1 removes the final live check's deprecated synchronous history read: after all awaits it compares the already validated persisted snapshot with the live target's public immutable `session.header` and monotonic `session.seq` (legacy event-array length only on old Core), rechecks every task invariant, mutates owners and performs one strict atomic save. That final freshness boundary covers one Host process; concurrent cross-process Session/Cron writers are unsupported and require external serialization. History and recorded presets remain untouched.

The source retry hardening uses one in-flight resume and a 30s exponential failure backoff per cold owner, capped at 300s and checked by the ordinary scheduler tick. Live roots bypass/reset backoff. At most four cold owners are inspected/resumed concurrently; others remain due for a later tick. Per-task in-flight dispatch prevents a slow owner from holding other owners' ticks; successful delivery stamps and overdue catch-up rules are unchanged. Removing, disabling or editing a task invalidates its pending delivery. Disposal cancels supported persistence operations, prevents late followups and disposes late-created resume handles. Core resume itself has no assumed cancellation API: a non-settling resume stays single-flight, without spawning replacement agents. Four indefinitely hung cold operations exhaust cold-start capacity, but do not block live-owner tasks; there is no unsafe forced Core cancellation.

Metadata-only HTTP reads prefer public `stat(id, { signal })`, falling back to `list({ signal })` only when `stat` is absent. Both shapes retain strict root/identity checks; modern stat errors never fall back to enumeration. Concurrent reads of one owner coalesce until settlement; no settled header/revision authority is cached. One disconnected subscriber cannot abort another's read; the last disconnect cancels the backend. A backend that ignores cancellation keeps its pending slot until settlement, so repeated client retries fail explicitly rather than growing backend scans. HTTP reads never open event handles, resume agents or mutate schedule state.

`src/client/read-poll.ts` bounds each panel/watcher read lifecycle to one refresh and a 30s deadline, including response-body consumption. `tests/client-polling.test.mjs` runs source-backed React regressions in the standard test gate: 12s slow success, hanging reads/bodies, repeated Retry, hide/reattach/owner changes, watcher cancellation, mutation non-replay and post-mutation freshness. These fake-network tests do not establish the cause of every real browser `Failed to fetch`; the observed incident was repaired by fixing the incompatible preset field.

Version 0.7.1 is a pre-1.0 compatibility patch over 0.7.0: it adds only the exact 0.1.6-alpha.1 baseline and removes Cron's deprecated live Session history read while retaining the global owner hub, scheduling, tool/HTTP ownership, history format and Client behavior. The 0.1.6 audit confirms Cron does not touch Sandbox, Shell, workflow/PTC, config HMR, attachment cache or Team APIs. Versioned changelog/install examples and a committed PR candidate are required for delivery. Recheck the base version before merging; do not report the committed-HEAD release gate as verification of an uncommitted worktree, or a release as proof of live installation.

## Fast paths for a new agent

| Change | Read first | Minimum focused evidence |
| --- | --- | --- |
| Schedule / tools / HTTP / restart | `index.js`, `tests/host.test.mjs` | Host suite including owner rejection and restart/no-refire cases |
| Core compatibility | `tests/core-compat.test.mjs`, peer ranges in `package.json` | Exact source identity and both persistence API seams; do not widen peer ranges speculatively |
| UI / notification | `src/client/index.tsx`, `src/client/global-hub.tsx`, `tests/toast-render.test.mjs`, `tests/client-polling.test.mjs` | Real React/portal lifecycle tests plus global Slot pairing, exact blank-owner navigation, browser focus, owner and stale-response tests |
| Native Sidebar | `src/client/native-sidebar.ts`, `tests/native-sidebar*.test.mjs`, `tests/official-sidebar-*.test.mjs` | Two-stage public registration, current-owner open, slot/service lifetime, hidden BODY unmount vs record abort, multi-pane visibility, exact upstream controller/store/planners and synthetic-container browser behavior |
| Legacy Sidebar | `src/client/sidebar.ts`, `tests/sidebar-contract.test.mjs` | Retained version/capability/fallback/disabled/disposal; scopes, dedupe, floats; optional installed-source contract test |
| Build / packaging | `tsdown.config.ts`, `tests/package.test.mjs` | Fresh bundle, one ModuleLoader wrapper, packed entrypoints, no install scripts |
| Release automation | `scripts/release-policy.mjs`, `scripts/publish-release.mjs` | Pure policy and fake-API publisher tests, wiring contract tests, then actual CI/Release evidence |

## Commands and evidence levels

- `pnpm install --frozen-lockfile`: install the committed closure. Do not commit local registry/mirror URL churn or unrequested dependency updates.
- `pnpm verify`: typecheck, build, Host/client tests, release/readiness tests, and tarball checks. Node 22.19/24 and Windows/Linux are covered by CI.
- `pnpm test:release`: fast, offline Node tests for release policy, retries/conflicts, credential routing and workflow wiring. No real GitHub writes.
- `pnpm test:sidebar`: real Chromium-based **fixture** tests. Install Chromium with `pnpm exec playwright install chromium`. `PLAYWRIGHT_CHANNEL=msedge` selects Edge for the collapse test; `DSH_CHROMIUM_EXECUTABLE` selects a browser executable for the integration test on an existing local setup.
- `pnpm release:check --base <base-sha>`: inspect a committed PR candidate against its actual base, not a remembered branch version.
- `node scripts/release-policy.mjs --plan`: read-only local release decision using manifest, commit and annotated tags. Run with fetched tags. This does not create a release.

`DSH_CORE_PATH` is optional locally, but its absence is a **reported skip**, not Core-source verification. Exact commits: `a66e4702047846cdaa10c66c9d3df3951f5ea70d` (0.1.2-rc.1), `d347e703908d0406b7a7ef80e3a0e594d86b2215` (0.1.3-alpha.1), `5dda764ed3aa172535a7967b06ff95d9cbfe536a` (0.1.5-alpha.1), `b2e3b2a0125854567a4a5fcba75782e42fe84901` (0.1.5-alpha.2), `fb2c4b9e698e30edb738bca4cf0618587db7d203` (0.1.5-rc.2), and `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d` (0.1.6-alpha.1). All six remain in CI/release; the three exact 0.1.5 versions and 0.1.6-alpha.1 select the event-state native-handle fixture. Default checkout mode requires no tracked edits. Optional `DSH_CORE_REF` reads immutable Git blobs at an allowlisted SHA without altering the checkout. Exact source declarations (including serialized awaited `agent/created`, async resume, deprecated Session readers, `session.seq`, session-scoped header utilities and root-scoped shell overlay Slots) are checked separately from package policy; modern tests execute the tagged JSONL handle class through Cron cold resume and owner transfer using fake storage/agents, not real JSONL IO/migration or Core startup. `DSH_BETTER_SIDEBAR_PATH` enables the additional 0.18.0 source-contract test. Discover existing checkouts before obtaining sources.

The native contract/browser suites resolve `DSH_NATIVE_CORE_REF ?? DSH_CORE_REF ?? checkout HEAD` only within the same allowlisted source identities. The three 0.1.5 refs and 0.1.6-alpha.1 execute their tagged registry/controller/domain/store/dockkit planners; the 0.1.6 loader also executes the tagged cross-context UUID utility required by the controller. The two earlier refs explicitly skip native-only cases. Browser CI and Release bind the 0.1.6-alpha.1 source path/ref so the native fixture cannot silently disappear; the outer React fixture is synthetic, not the complete official renderer. Ordinary dependencies resolve only from the repository's frozen closure, never a developer's Desktop installation.

Distinguish four levels in reports: unit/fake context → real browser fixture → isolated package/Profile installation → actual running Host/GUI. Passing one does not prove the next. Do not start models or real scheduled tasks merely to fill a checkbox.

## Delivery state machine

```text
Issue/scope → important-change decision → version + notes + source/bundle
  → PR checks + review → release-ready → merge exact head
  → main CI success → reusable Release plan
  → build/test/package/checksum → annotated exact-SHA tag
  → draft + verified assets → publish immutable release
  → download/checksum + isolated install → delivery report
  → [separate user authorization] live install/restart/refresh
```

Documentation/tests-only commits with no important changes since the existing version tag skip publication. Important commits without a new version fail both the PR policy and the post-merge plan. This dual check catches release debt even if someone bypasses pre-merge checks. A same-commit rerun resumes publication rather than generating another version.

The reusable workflow publishes directly; it does not assume its own `GITHUB_TOKEN` tag will trigger a second workflow. Release concurrency is per commit so retries serialize without canceling another version. Agents must still serialize important merges: two PRs that both select the same next version must reconcile against updated `main` before merging.

### Branch protection

The intended `main` policy requires PRs, an up-to-date branch and the stable **release-ready** status, including administrators. The status runs with `always()` and explicitly fails if release-policy, any matrix verification, or browser checks failed/cancelled/skipped. This avoids GitHub treating a skipped required check as success.

Workflows alone cannot prevent an administrator disabling protection. Verify the actual repository setting when configuring this project or a fork; do not claim enforcement from YAML alone. Never remove protection to merge a failing change. Public forks do not auto-publish: the workflow and publisher are explicitly bound to `cloga/dsh-cron`.

## Failure recovery

| Failure | Correct response |
| --- | --- |
| PR policy says missing bump/notes | Update version, changelog and README in that PR; reverify |
| Generated bundle differs after build | Inspect source change, rebuild and commit `lib/client.js`; no hand-edit |
| Main CI fails after merge | Fix the failed check through a new PR; release remains unfinished |
| Existing tag points elsewhere / lightweight tag | Stop; never move it. Inspect provenance and prepare a new reviewed version if necessary |
| Upload interrupted with a draft | Rerun the original exact-SHA main CI run; its gated reusable Release job reuses matching assets (no standalone dispatch/tag trigger) |
| Existing asset digest differs | Stop; do not delete/overwrite an immutable or mismatching asset |
| Release published but installed version old | Give the fixed-version upgrade command; refreshing alone cannot install it |
| Installed version current but UI unchanged | Check active bundle/service/tab enablement and safe restart/refresh status |

The publisher does not blindly retry uncertain writes. A later run re-reads remote state. GitHub API reconciliation is bounded; immutability must be enabled in repository settings. A failure of the final immutable check is a real failed delivery, not permission to announce success.

## Readiness acceptance criteria

A maintainer can evaluate readiness without a score invented by an agent:

- [ ] A fresh agent can locate architecture, invariants, commands, credentials boundary and release policy from root `AGENTS.md`.
- [ ] Runtime/dependency/build/delivery changes without a version bump fail a testable PR gate; docs-only exceptions are explicit.
- [ ] Required `release-ready` combines every underlying test result and branch protection actually requires it.
- [ ] Main CI success starts publication without a human remembering to push a tag.
- [ ] Same-ref retry, conflicting tags/assets, interrupted drafts and token redirects have offline regression coverage.
- [ ] One real merged important PR reaches an immutable release with downloaded digest and isolated-install evidence.
- [ ] Handoff names separate merge/release/install/activation states and leaves no invisible release work behind.

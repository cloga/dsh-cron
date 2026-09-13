# Changelog

## 0.5.1

- Fix HTTP task/history reads for persisted root Sessions that are not currently loaded (#36). Verify only public persisted identity/lineage metadata, keep results scoped to that owner, and never wake an Agent, read Session events or write task/history data just to display the panel.
- Preserve live-root ownership for every mutating HTTP action, manual execution and all model tools. Reject missing, subagent, malformed, duplicate or ambiguous persisted owners; fork-parent lineage alone does not make a root a subagent.
- Keep cached and overdue cron slot display semantics without mutating scheduler caches during a read. Add synthetic read/write/Agent tripwires and the screenshot's exact cold-owner error regression for the existing loading/error/empty UI.
- This pre-1.0 patch is a backward-compatible read-path fix on 0.5.0's native Sidebar integration, not a task migration, reactivation, scheduling change or broader Core compatibility claim. Release, installed version and live activation remain separate evidence.

## 0.5.0

- Add current-session Cron integration through the official native Sidebar registry and keyed body Slot (#34). The clock selects the same native destination; Cron reuses native close, split, fullscreen and sizing rather than opening a second modal or changing the default Files/Guide entry.
- Preserve the optional Better Sidebar and pinned standalone fallback on older/unavailable native surfaces. Old-session notifications never silently open another owner's tasks in the current session; scheduling, Host APIs, persistence and root ownership are unchanged.
- Show recognizable session context, keep technical IDs in details, distinguish loading/empty/read failure with retry, and guard task actions with pending feedback and an explicit delete confirmation.
- Bind native tab occurrences, visibility and async requests to their owner and lifetime, including hidden/unmounted bodies and multiple panes. No new Core runtime import or Core implementation patch is required.
- Add exact tagged native registry/controller/domain/store/planner execution and real-browser fixture regressions while retaining all five supported Core pins, both platforms and Node 22.19/24. Older tags without native Sidebar explicitly exercise fallback rather than claiming native support.
- This pre-1.0 minor release adds an optional UI capability, not a cross-session task center or a change to task execution. Browser fixture evidence, source contracts, released artifacts and live Profile activation remain distinct.

## 0.4.8

- Add official Core `0.1.5-rc.2` at exact commit `fb2c4b9e698e30edb738bca4cf0618587db7d203` (#32), retaining all four previous exact source pins and legacy peer lines. No broad 0.1.5 prerelease/stable range.
- Preserve the existing dual `SessionHandle.read()` normalization, legacy `inspect()`, owner isolation, retry and cleanup behavior. The rc.2 persistence/JSONL handle source is unchanged from alpha.2; no Host or Client runtime rewrite or dependency upgrade is needed.
- Execute each supported 0.1.5 tag's actual JSONL handle class through Cron cold resume with fake storage/agents, including rc.2; explicitly select exact-version read shapes, verify public Slot kinds/scopes, and expand current/primed, empty/non-empty, event-state, slice and idempotent-close coverage.
- Extend CI/release verification to all five exact source baselines and keep documentation/workflow regression checks aligned. Source-backed fixtures do not establish full Core startup, real JSONL IO/migration, installed Profile, live model or GUI compatibility.
- This pre-1.0 patch adds a bounded compatible Core baseline without changing scheduling or UI behavior. Publication and committed-head release-policy verification remain separate from an uncommitted worktree assessment.

## 0.4.7

- Fix cold root Session resume on Core `0.1.5-alpha.1` and `0.1.5-alpha.2` (#30; alpha.1 tracking #29): unwrap `SessionHandle.read()` results carrying `{ eventState, events }`, while preserving Core 0.1.3 array reads and legacy `inspect()`.
- Reject malformed handle/results and mismatched/non-root handle headers before resume; keep handle closure in `finally`, retain overdue retry and never fall back to another Session. Observe event values without mutating or transferring ownership.
- Add exact peer entries for the two 0.1.5 alphas, exact-SHA declaration checks and source-backed JSONL handle-to-Cron regression tests with fake storage/agents; include all four source baselines in CI/release verification. Read-only `DSH_CORE_REF` mode certifies immutable blobs without modifying an existing Core checkout.
- This backward-compatible patch does not claim full Core/JSONL migration, installed Profile, or live Host/UI compatibility from source checks or fixtures. No client behavior change.

## 0.4.6

- Use the same fixed-size clock header entry in every state, including other Sidebar tabs, collapsed/absent Sidebar, and standalone fallback; stop switching between icon and text.
- Preserve the accessible name and real expanded state; expose enabled/unread counts in a localized tooltip and accessible description, with an absolute unread badge capped visually at 99+.
- Cover persistent entry identity, disabled/no-owner behavior, unread acknowledgement, English/Chinese labels and constant browser dimensions across transitions.

## 0.4.5

- Remove the repeated title and always-visible Session ID from embedded Cron panels; use the host tab title and one compact Tasks/History/settings toolbar.
- Keep the header entry mounted but show a named clock icon while its own Sidebar panel is visible; restore the text/count entry when hidden or unavailable.
- Move embedded owner details and notification preferences into an accessible settings disclosure; retain the standalone modal title, close control and always-visible owner context.
- Cover settings dismissal/focus, hidden pane/service transitions, narrow menus and unchanged per-Session operations; refresh documentation screenshots for the compact layout.

## 0.4.4

- Add a project-level agent guide, architecture/test map, PR checklist, and evidence-based release completion contract.
- Require new versions for important PR changes and publish directly after all main-branch CI gates succeed; retry identical drafts safely without moving tags or replacing immutable assets.
- First published version containing the previously merged Sidebar integration (#18); these changes were not included in the immutable v0.4.3 tag. This pre-1.0 patch delivers backward-compatible optional UI integration without changing Host/API contracts.
- Register a session-scoped Cron tab through the optional Better Sidebar 0.18 public client contract, without importing or changing Better Sidebar.
- Reveal the owning right/bottom panel (or narrow drawer) on header/notification entry; reuse detached windows without opening unrelated panels.
- Retain a native modal-dialog fallback for absent, unsupported, disabled or removed sidebar integration, avoiding cross-plugin stacking conflicts.
- Isolate tab selection and badges by Session, re-prime notification watchers on owner changes, ignore stale panel responses, and stop hidden panel polling.
- Group notification preferences in the panel header and add deterministic real-React/portal tests for fallback, session ownership, notifications and optional-service lifecycle.

## 0.4.3

- Restore Better Sidebar's native collapse control when dsh-tauri's global left-sidebar hide rule matches its accessible label; scope the compatibility override to the Better Sidebar toggle cluster and keep cleanup lifecycle-owned.
- Add browser cascade/interaction regression coverage for stylesheet order, narrow/desktop layouts, labels, and cleanup.

## 0.4.2

- Add bounded compatibility with DSH Core `0.1.3-alpha.1` while retaining the `0.1.1-rc.2` and `0.1.2` compatibility lines.
- Migrate cold Session reads to snapshot headers and lifecycle-owned read handles (`open(id, 'read')`, `read()`, `close()`), with an API-shape-only legacy `inspect()` fallback; read or close failures abort that resume attempt.
- Cover `snapshot.header`, handle cleanup on success/failure, and the legacy persistence seam in focused tests.

## 0.4.1

- Republish the rc.1 compatibility build after enabling repository-level immutable GitHub Releases.
- Preserve the reviewed 0.4.0 runtime behavior; only release provenance metadata changes.

## 0.4.0

- Add bounded compatibility with official DSH `0.1.2-rc.1` while retaining the controlled `0.1.1-rc.2` baseline.
- Bind every model-tool operation to `ToolRunContext.exec.agent`, require a live root Session, and deny cross-Session task or history access.
- Require the same Session owner on every HTTP task/history operation.
- Reject static config tasks without an explicit `sessionId` owner.
- Reconcile `delivered` and `running` history records as `interrupted` after Host restart.
- Build both one-shot and watch artifacts directly in the DSH ModuleLoader format.
- Add exact rc.1 source compatibility, artifact freshness, package smoke, and Windows/Linux Node 22.19/24 CI coverage.

## 0.3.3

- Restore light/dark theme contrast and retain Session-bound cold wake behavior.

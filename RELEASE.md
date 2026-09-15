# Release runbook

Read `AGENTS.md` first. Important PRs must produce a new verified version after merge without another user reminder. Source of truth: exact commit → annotated tag → immutable Release assets, not the current default-branch README.

## 1. Prepare the PR

- Decide release impact with `.github/pull_request_template.md`. Runtime/UI/API/ownership/security/compatibility/dependency/build/delivery changes require a new version in the same PR; docs/tests-only exceptions need a reason.
- Fetch current base/tags, include important merged-but-unreleased changes, and select a strictly newer stable semantic version. Serialize important merges; if another PR changes the base version, reconcile and rerun checks.
- Update `package.json`, a matching `## <version>` section in `CHANGELOG.md`, README Git-tag and tarball install examples, and affected built `lib/client.js`. Do not put post-tag work into old release notes.
- Use pinned pnpm 11.7.0 and Node 22.19/24. Run `pnpm install --frozen-lockfile`, `pnpm verify`, `pnpm test:sidebar`, independent review and `pnpm release:check --base <actual-base-sha>` on the committed candidate.
- Exact Core checks cover `a66e4702047846cdaa10c66c9d3df3951f5ea70d` (0.1.2-rc.1), `d347e703908d0406b7a7ef80e3a0e594d86b2215` (0.1.3-alpha.1), `5dda764ed3aa172535a7967b06ff95d9cbfe536a` (0.1.5-alpha.1), `b2e3b2a0125854567a4a5fcba75782e42fe84901` (0.1.5-alpha.2), `fb2c4b9e698e30edb738bca4cf0618587db7d203` (0.1.5-rc.2), and `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d` (0.1.6-alpha.1). CI runs all six on Windows/Linux and Node 22.19/24; the browser job runs separately on Ubuntu/Node 24 against the newest exact baseline. Use `DSH_CORE_PATH` for a clean checkout, or additionally set `DSH_CORE_REF` to read that immutable commit from an existing Git repository without altering its checkout. A ref must resolve to an allowlisted exact SHA; checkout mode still rejects tracked modifications.
- Report evidence precisely: package peer policy is not source verification; exact declarations and source-backed modern JSONL handle-to-Cron tests use fake storage/agents, not full Core startup, JSONL migration/IO, a real model, or live GUI. The 0.1.6 check also certifies awaited serialized `agent/created`, async resume, deprecated Session-reader declarations, `session.seq`, and no Cron production call to `snapshotEvents()`. Explicitly report source-check skips. This is not a general 0.1.5 or 0.1.6 compatibility promise. An uncommitted candidate can receive only a worktree assessment; the important-release gate reads committed HEAD and must be rerun after the complete candidate is committed.
- Inspect the versioned tarball: Host entry, one directly wrapped Client entry, bundle patch, README, changelog, license and package metadata. No source/build scripts or install-time build hooks.
- Require `release-ready` through `main` branch protection with strict/up-to-date checks and PR review flow; never bypass it. Immutability **must already be enabled** in repository Release settings. The publisher checks the published flag and refuses to report success if disabled; this postcheck cannot undo a mutable publication.

## 2. Merge and follow the automatic publication

1. Merge the reviewed, verified PR head (squash preferred). Save its merge SHA.
2. Wait for `CI` on that exact `main` push. Its `release-ready` job explicitly requires every verification group to succeed, including policy and browsers.
3. CI calls reusable `.github/workflows/release.yml` directly. No standalone Release dispatch/tag trigger exists, so recovery cannot bypass the all-platform matrix. A `GITHUB_TOKEN`-created tag would not trigger another push workflow anyway.
4. The plan compares the committed version with fetched annotated tags. Docs-only changes at an already released version skip; important changes without a new version fail. Same-commit retries resume.
5. The release job re-verifies all six exact Core source contracts (including source-backed modern handle regressions), browser regression and committed bundle, packs the artifact and generates/validates `SHA256SUMS`.
6. `scripts/publish-release.mjs <version>` checks local commit/version/digest, creates an annotated tag at the exact SHA, uploads into a draft, verifies both asset digests, then publishes the immutable Release. It never moves a tag or deletes/replaces an asset.

Record the successful **CI run's `publish / release` job** URL. The reusable workflow runs inside CI, so a separate run named Release is not expected.

## 3. Verify official artifacts before declaring delivery

- Read the published Release: correct version; `draft=false`, `prerelease=false`, `immutable=true`.
- Resolve the annotated tag to the exact verified merge commit, not simply whatever is now on `main`.
- Download the official `dsh-cron-<version>.tgz` and `SHA256SUMS`. Compare the downloaded SHA-256 to both the manifest and the independently reported GitHub asset digest.
- Install the official tarball into a fresh isolated `DSH_HOME` Web Profile with the explicit real CLI if a Desktop shim overrides home/PATH. Never use the user's real task/history/credential files. `--ignore-scripts` is appropriate: Cron has no install scripts. Confirm the installed version and required entrypoints.
- Run ownership/HTTP/restart tests against the installed package. Tests using mock contexts establish packaged implementation behavior, **not** an actual Host restart. If real Host/UI validation is needed, use a disposable host with controlled credentials and no real scheduled work, and report the exact level tested.
- Give the fixed-version install/upgrade command, activation requirements and actual installed/active status. Installation/restart and managed-worktree checkout require their own user authorization; publication does not imply them.

## 4. Failure/retry rules

- Keep the delivering task/goal open after a failed or missing release. Diagnose the first failed gate; never pretend merge equals delivery.
- For transient CI/publishing failure, rerun the **original exact-SHA main CI run**, preferably all jobs. This retains the full matrix gate and lets the publisher reconcile matching drafts/assets. Rerunning a later docs-only commit is not recovery for an earlier failed release.
- API calls have a 60-second timeout. Writes are not blindly retried; an uncertain result is reconciled by reads on a later run. The single ref-conflict reconciliation never force-updates a tag.
- Tag mismatch/lightweight tag, duplicated/mismatching assets, checksum failure, or disabled immutability: stop and investigate. Do not overwrite immutable assets, move tags, or upload a hand-built replacement. A real code fix requires a reviewed PR and a new version.
- If branch protection or Release immutability is disabled by an administrator, report the weakened guarantee and restore the approved policy rather than claiming YAML alone enforces it.

## Delivery receipt

Add to the Issue/PR and final handoff:

```text
PR / merge SHA:
Version / annotated tag SHA:
All-CI + publish job URL:
Immutable Release URL:
Tarball / SHA256SUMS / independently verified digest:
Isolated installation result + test level/skips:
Current user's installed / active version (or not inspected):
Exact upgrade command and any pending authorized activation:
```

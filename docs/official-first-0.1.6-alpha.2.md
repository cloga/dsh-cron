# Official-first review: DSH 0.1.6-alpha.2

Target: official `dsh-v0.1.6-alpha.2`, commit `ddefc45fbc7f8e46dd73185e68295696d1297887`.
Candidate: dsh-cron 0.7.3 (patch-level compatibility/ownership correction; no storage migration).

## Decision matrix

| Customization/purpose | Exact official evidence | Parity | Decision, gap and retirement condition |
| --- | --- | --- | --- |
| Session-bound once/interval reminders | [Schedule](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/schedule/schedule/README.md), `src/tools.ts`, `src/domain.ts` | Partial | Prefer official Schedule for new simple live-session reminders; retain Cron for existing tasks. Official supports after/at and creation-anchor fixed-rate every >=300s, not calendar recurrence. Retire duplicate paths only after an explicit task migration that preserves recurrence semantics. |
| Calendar/IANA daily and five-field cron | Same exact Schedule domain and documented fixed-interval-only boundary | Absent | Retain calendar parser/time-zone behavior. Retire when official recurrence covers required DST/IANA/calendar cases with acceptance tests. Official at already supports an explicit zone; do not claim official has no time-zone support. |
| Cold root Session resume + retry | [Schedule runtime](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/schedule/schedule/src/runtime.ts), Schedule's live-owner-only boundary | Partial | Official overdue reminders await a live owner; Cron intentionally resumes its saved root with bounded retry. Retain until official supports this requirement with matching root identity, preset, cancellation and recovery semantics. |
| Edit/pause/run-now/history/owner transfer and notifications | Schedule tools expose create/list/delete; official UI is active-state catalog without history/mutation/receipt | Partial | Retain management/history and explicitly authorized transfer. Retire only after equivalent controls, notification policy and data migration exist. Official delivery does not claim model completion. |
| Native Sidebar and Session ownership | [Session props/retention](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-session/src/client/index.ts), [navigation](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-workspace/src/client/navigation.ts) | Complete for UI identity/navigation primitives | Reuse official standard `sessionId` and public `retainedBy.mainView`; remove header inject that assumed scope target was a string. Use header occurrence leases, not last-mounted-wins ownership. No new Core service or private state. |
| Durability | [Official persistence barrier](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/schedule/schedule/src/persistence.ts), Cron `fire`, `persistTasks`, `save` | Partial/different | Official uses Session flush barriers; Cron uses separate task/history files and stamps after followup. Do not equate them or claim exactly-once. Retain files until a verified migration reconciles rules, consumed slots and history. |

## Semantics that prevent blanket replacement

Cron `every` uses previous **accepted followup delivery time** plus interval (first
run uses Host startup time), not a creation-anchor-aligned fixed rate and not model
completion time. Delayed delivery shifts the next due time; no backlog replay is
promised. Minimum is 10s, scheduler tick defaults to 15s. Official Schedule every
is creation-anchor-aligned, minimum five minutes, latest-only catch-up. Translating
Cron every to official every without consent changes behavior.

Cron followup enqueue occurs before task stamp persistence. Normal successful
saved stamps suppress consumed slots after restart, but process crash or task-save
failure between those steps can duplicate delivery. There is no exactly-once or
transaction shared with Session followup. Make external effects idempotent. This
adaptation corrects claims, not the storage format or scheduler delivery algorithm.

## Migration, rollback and acceptance

No automatic conversion, deletion or rewrite of stored tasks, history, credentials,
presets or Session selection. Users who only need supported official reminders may
choose official Schedule for new tasks; disable the corresponding old Cron task
explicitly to avoid two schedulers issuing the same work. Do not run multiple Hosts
against one Cron store. Restore the prior verified Cron artifact to roll back code;
0.7.3 has no new persisted schema. Installation/restart requires separate approval.

Tests read immutable official Git blobs via `DSH_CORE_PATH`/`DSH_CORE_REF`; the
working Core tree is never modified. Exact contracts cover SessionReference standard
identity, retention-based main selection, widened `SessionTarget` (still accepts
SessionId), sidebar placement and native controller/store, and source-backed
cold-resume handle behavior. React fixtures cover simultaneous main/embedded/duplicate
headers, explicit clicked-owner management, stale cleanup and existing native pane
polling. Source/fixture evidence is not installed Desktop or live task execution.

## 中文摘要

官方 Schedule 已覆盖一次性/固定频率提醒和持久化，不应再说它没有定时能力。
但官方明确不提供日历 cron、冷会话主动恢复、完整编辑/启停/历史/通知等语义，
因此只做部分替代评估，不整体删掉 Cron。新简单提醒优先官方；已有任务不自动迁移。
本次复用官方多实例 Session 标准身份和 mainView retention，修复嵌入会话抢占主会话
轮询的问题。Cron 间隔以上次接受投递的时间为锚，非官方固定频率；持久化不能保证
崩溃/写入失败时绝不重复。外部副作用需幂等，升级不改任务格式、不重启实际 Host。

window.__ModuleLoader__.load({ id: "dsh-cron", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
let react = require("react");
let react_dom = require("react-dom");
let react_jsx_runtime = require("react/jsx-runtime");

//#region src/client/locale.ts
const zh = {
	"trigger.aria": "定时任务",
	"trigger.summary": "已启用 {count} 个任务 · {unread} 条未读动态",
	"drawer.close": "关闭",
	"drawer.test": "测试通知",
	"drawer.testShort": "测试",
	"prefs.title": "通知设置",
	"panel.owner": "会话 ID：{id}",
	"panel.currentOwner": "当前会话 · {title}",
	"panel.pinnedOwner": "所属会话 · {title}",
	"panel.untitled": "新会话",
	"panel.titleUnavailable": "标题暂不可用",
	"panel.loading": "正在加载定时任务…",
	"panel.error": "无法更新任务面板：{message}",
	"panel.timeout": "请求超时，请重试。面板也会自动重新读取；任务操作不会自动重试。",
	"hub.title": "定时会话",
	"hub.description": "所有当前拥有定时任务的会话。选择一项即可返回对应对话。",
	"hub.list": "拥有定时任务的会话",
	"hub.loading": "正在加载定时会话…",
	"hub.empty": "当前没有会话拥有定时任务。",
	"hub.error": "无法更新定时会话，请重试。",
	"hub.timeout": "请求超时，请重试。",
	"hub.blankSession": "新会话",
	"hub.blank": "空白",
	"hub.running": "运行中",
	"hub.preset": "Agent 预设：{preset}",
	"hub.counts": "{tasks} 个任务 · {enabled} 个已启用",
	"hub.next": "最早下次运行：{time}",
	"hub.waiting": "等待首次调度",
	"hub.noEnabled": "没有已启用的任务",
	"hub.unavailable": "会话列表尚未提供此会话，请稍后重试。",
	"hub.unavailableShort": "暂不可用",
	"action.retry": "重试",
	"action.pending": "处理中…",
	"action.confirmRemove": "确认删除",
	"task.confirmRemove": "删除这个定时任务？已保存的执行记录会保留。",
	"panel.settings": "面板设置",
	"panel.views": "面板视图",
	"prefs.system": "系统通知（页面在后台也能收到）",
	"prefs.systemShort": "系统通知",
	"prefs.sound": "提示音（点击切换静音）",
	"prefs.soundShort": "提示音",
	"toast.testBody": "这是一条测试通知：任务完成后会像这样提醒你。",
	"toast.completed": "任务 {id} 已完成",
	"toast.failed": "任务 {id} 执行失败",
	"tab.tasks": "任务",
	"tab.history": "执行记录",
	"tasks.empty": "还没有定时任务。在对话中直接说，比如「每周一早上9点提醒我交周报」，Agent 会自动创建。",
	"history.empty": "还没有执行记录。",
	"origin.config": "配置",
	"origin.dynamic": "动态",
	"schedule.at": "一次性 · {time}",
	"schedule.every.seconds": "每 {count} 秒",
	"schedule.every.minutes": "每 {count} 分钟",
	"schedule.every.hours": "每 {count} 小时",
	"schedule.daily": "每天 {time} · {zone}",
	"schedule.cron": "cron: {expr} · {zone}",
	"task.next": "下次: {time}",
	"task.bound": "绑定会话",
	"task.boundTo": "触发时在创建它的会话中执行（会话 {id}）",
	"action.run": "立即执行",
	"action.pause": "暂停",
	"action.resume": "恢复",
	"action.remove": "删除",
	"action.edit": "编辑",
	"action.save": "保存",
	"action.cancel": "取消",
	"form.prompt": "任务内容：到点后 Agent 要做什么",
	"form.schedule": "调度规则",
	"form.rule.daily": "每天",
	"form.rule.every": "每隔",
	"form.rule.cron": "cron 表达式",
	"form.rule.at": "一次性",
	"form.value.daily": "HH:MM（如 09:00）",
	"form.value.every": "秒数（如 1800）",
	"form.value.cron": "分 时 日 月 周（如 0 9 * * 1）",
	"form.value.at": "ISO 时间（如 2026-08-24T09:00:00+08:00）",
	"history.status.delivered": "已投递",
	"history.status.running": "执行中",
	"history.status.completed": "已完成",
	"history.status.failed": "失败",
	"history.status.interrupted": "因主机重启而中断",
	"history.scheduled": "计划: {time}",
	"duration.seconds": "{count}s",
	"duration.minutes": "{count}m{seconds}s"
};
const en = {
	"trigger.aria": "Scheduled tasks",
	"trigger.summary": "{count} enabled tasks · {unread} unread updates",
	"drawer.close": "Close",
	"drawer.test": "Test notification",
	"drawer.testShort": "Test",
	"prefs.title": "Notifications",
	"panel.owner": "Session ID: {id}",
	"panel.currentOwner": "This session · {title}",
	"panel.pinnedOwner": "Owning session · {title}",
	"panel.untitled": "New session",
	"panel.titleUnavailable": "Title unavailable",
	"panel.loading": "Loading scheduled tasks…",
	"panel.error": "Could not refresh the task panel: {message}",
	"panel.timeout": "Request timed out. Retry, or wait for the next automatic refresh. Task actions are not retried automatically.",
	"hub.title": "Scheduled sessions",
	"hub.description": "Every current session that owns scheduled tasks. Choose one to return to its conversation.",
	"hub.list": "Sessions with scheduled tasks",
	"hub.loading": "Loading scheduled sessions…",
	"hub.empty": "No sessions currently own scheduled tasks.",
	"hub.error": "Could not refresh scheduled sessions. Retry.",
	"hub.timeout": "Request timed out. Retry.",
	"hub.blankSession": "New session",
	"hub.blank": "Blank",
	"hub.running": "Running",
	"hub.preset": "Agent preset: {preset}",
	"hub.counts": "{tasks} tasks · {enabled} enabled",
	"hub.next": "Earliest next run: {time}",
	"hub.waiting": "Waiting for the first scheduled run",
	"hub.noEnabled": "No enabled tasks",
	"hub.unavailable": "This session is not available in the session list yet. Retry shortly.",
	"hub.unavailableShort": "Unavailable",
	"action.retry": "Retry",
	"action.pending": "Working…",
	"action.confirmRemove": "Confirm delete",
	"task.confirmRemove": "Delete this scheduled task? Saved run history will remain.",
	"panel.settings": "Panel settings",
	"panel.views": "Panel views",
	"prefs.system": "System notifications (work in background)",
	"prefs.systemShort": "System",
	"prefs.sound": "Sound (click to mute)",
	"prefs.soundShort": "Sound",
	"toast.testBody": "This is a test notification: finished tasks will notify you like this.",
	"toast.completed": "Task {id} completed",
	"toast.failed": "Task {id} failed",
	"tab.tasks": "Tasks",
	"tab.history": "History",
	"tasks.empty": "No scheduled tasks yet. Just say it in chat, e.g. \"remind me every Monday at 9am to submit the weekly report\".",
	"history.empty": "No runs yet.",
	"origin.config": "config",
	"origin.dynamic": "dynamic",
	"schedule.at": "once · {time}",
	"schedule.every.seconds": "every {count}s",
	"schedule.every.minutes": "every {count}m",
	"schedule.every.hours": "every {count}h",
	"schedule.daily": "daily {time} · {zone}",
	"schedule.cron": "cron: {expr} · {zone}",
	"task.next": "next: {time}",
	"task.bound": "bound session",
	"task.boundTo": "Runs in the session it was created in (session {id})",
	"action.run": "Run now",
	"action.pause": "Pause",
	"action.resume": "Resume",
	"action.remove": "Delete",
	"action.edit": "Edit",
	"action.save": "Save",
	"action.cancel": "Cancel",
	"form.prompt": "What should the agent do when it fires?",
	"form.schedule": "Schedule rule",
	"form.rule.daily": "Daily",
	"form.rule.every": "Every",
	"form.rule.cron": "cron expression",
	"form.rule.at": "Once",
	"form.value.daily": "HH:MM (e.g. 09:00)",
	"form.value.every": "seconds (e.g. 1800)",
	"form.value.cron": "min hour dom mon dow (e.g. 0 9 * * 1)",
	"form.value.at": "ISO time (e.g. 2026-08-24T09:00:00+08:00)",
	"history.status.delivered": "delivered",
	"history.status.running": "running",
	"history.status.completed": "completed",
	"history.status.failed": "failed",
	"history.status.interrupted": "interrupted by host restart",
	"history.scheduled": "scheduled: {time}",
	"duration.seconds": "{count}s",
	"duration.minutes": "{count}m{seconds}s"
};

//#endregion
//#region src/client/styles.ts
const styles = {
	trigger: "dsh-cron-trigger",
	triggerCompact: "dsh-cron-triggerCompact",
	triggerActive: "dsh-cron-trigger dsh-cron-triggerActive",
	sidebarPanel: "dsh-cron-sidebarPanel",
	settings: "dsh-cron-settings",
	settingsBody: "dsh-cron-settingsBody",
	settingsTitle: "dsh-cron-settingsTitle",
	settingsControls: "dsh-cron-settingsControls",
	toolbar: "dsh-cron-toolbar",
	owner: "dsh-cron-owner",
	drawer: "dsh-cron-drawer",
	drawerHead: "dsh-cron-drawerHead",
	drawerTitle: "dsh-cron-drawerTitle",
	drawerClose: "dsh-cron-drawerClose",
	headSpacer: "dsh-cron-headSpacer",
	headText: "dsh-cron-headText",
	headTextOn: "dsh-cron-headText dsh-cron-headTextOn",
	tabs: "dsh-cron-tabs",
	tab: "dsh-cron-tab",
	tabActive: "dsh-cron-tab dsh-cron-tabActive",
	body: "dsh-cron-body",
	list: "dsh-cron-list",
	empty: "dsh-cron-empty",
	row: "dsh-cron-row",
	rowDisabled: "dsh-cron-row dsh-cron-rowDisabled",
	rowHead: "dsh-cron-rowHead",
	taskId: "dsh-cron-taskId",
	badge: "dsh-cron-badge",
	time: "dsh-cron-time",
	prompt: "dsh-cron-prompt",
	meta: "dsh-cron-meta",
	actions: "dsh-cron-actions",
	action: "dsh-cron-action",
	actionDanger: "dsh-cron-action dsh-cron-actionDanger",
	addButton: "dsh-cron-addButton",
	form: "dsh-cron-form",
	formRow: "dsh-cron-formRow",
	input: "dsh-cron-input",
	textarea: "dsh-cron-textarea",
	select: "dsh-cron-select",
	primaryButton: "dsh-cron-primaryButton",
	ghostButton: "dsh-cron-ghostButton",
	error: "dsh-cron-error",
	confirm: "dsh-cron-confirm",
	dotOn: "dsh-cron-dot dsh-cron-dotOn",
	dotOff: "dsh-cron-dot dsh-cron-dotOff",
	dot_delivered: "dsh-cron-dot dsh-cron-dotDelivered",
	dot_running: "dsh-cron-dot dsh-cron-dotRunning",
	dot_completed: "dsh-cron-dot dsh-cron-dotCompleted",
	dot_failed: "dsh-cron-dot dsh-cron-dotFailed",
	dot_interrupted: "dsh-cron-dot dsh-cron-dotInterrupted",
	unreadBadge: "dsh-cron-unreadBadge",
	toastStack: "dsh-cron-toastStack",
	toast: "dsh-cron-toast",
	toastFailed: "dsh-cron-toast dsh-cron-toastFailed",
	toastTitle: "dsh-cron-toastTitle",
	toastBody: "dsh-cron-toastBody"
};
const css = `
/* Better Sidebar 0.18 / dsh-tauri 0.6.7 compatibility (#16).
   Desktop hides its duplicate LEFT collapse control by a global aria-label
   selector with !important, accidentally hiding the RIGHT control too.
   Restore only the matching native Better Sidebar button. The extra ancestry
   beats that rule in either load order; no generated classes or state hooks.
   With either plugin absent this is harmless; Cron's style effect owns cleanup.
   Remove once Desktop scopes its rule to the left navigation. */
[data-dsh-panel-host] [data-dsh-toggle-cluster] button[aria-label="Collapse sidebar"],
[data-dsh-panel-host] [data-dsh-toggle-cluster] button[aria-label="收起侧边栏"] {
  display: flex !important;
}

/* Local semantic tokens: current public DSH theme variables first, then
   color-scheme-aware system colors when a host omits one. All plugin roots are
   included because the trigger, sidebar panel, dialog and toasts have separate roots. */
:where(.dsh-cron-trigger, .dsh-cron-drawer, .dsh-cron-sidebarPanel, .dsh-cron-toastStack, .dsh-cron-hub) {
  --dsh-cron-bg-surface: var(--dsw-alias-bg-layer-1, Canvas);
  --dsh-cron-bg-control: var(--dsw-alias-bg-layer-2, color-mix(in srgb, CanvasText 8%, Canvas));
  --dsh-cron-bg-overlay: var(--dsw-alias-bg-overlay, color-mix(in srgb, CanvasText 14%, Canvas));
  --dsh-cron-bg-interactive: color-mix(in srgb, var(--dsh-cron-bg-overlay) 38%, var(--dsh-cron-bg-surface));
  --dsh-cron-label-primary: var(--dsw-alias-label-primary, CanvasText);
  --dsh-cron-label-secondary: var(--dsw-alias-label-secondary, color-mix(in srgb, CanvasText 78%, transparent));
  --dsh-cron-label-tertiary: var(--dsh-cron-label-secondary);
  --dsh-cron-label-caption: color-mix(in srgb, var(--dsh-cron-label-secondary) 62%, transparent);
  --dsh-cron-border: var(--dsw-alias-border-l2, color-mix(in srgb, CanvasText 18%, transparent));
}

/* header trigger */
.dsh-cron-trigger {
  min-height: 28px; color: var(--dsh-cron-label-tertiary); cursor: pointer;
  background: 0; border: 0; border-radius: 6px; align-items: center; gap: 3px;
  padding: 3px 6px; font-size: 12px; line-height: 18px; display: inline-flex;
}
.dsh-cron-trigger:hover, .dsh-cron-trigger:focus-visible { color: var(--dsh-cron-label-secondary); }
.dsh-cron-triggerActive { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); }
/* Stable hit target in every view; the unread badge is absolutely positioned. */
.dsh-cron-triggerCompact { box-sizing: border-box; width: 28px; min-width: 28px; height: 28px; padding: 6px; justify-content: center; }
.dsh-cron-triggerCompact svg { flex: none; }

/* Sidebar mode occupies its host pane, without a mask or viewport positioning. */
.dsh-cron-sidebarPanel {
  display: flex; flex-direction: column; width: 100%; height: 100%;
  min-width: 0; min-height: 0; overflow: hidden;
  background: var(--dsh-cron-bg-surface); color: var(--dsh-cron-label-primary);
}
/* Native content belongs to the base column; native chrome owns all sizing. */
.dsh-cron-sidebarPanel[data-cron-native] { --dsh-cron-bg-surface: var(--dsw-alias-bg-base, Canvas); }
/* Standalone fallback uses the browser top layer, not a z-index arms race. */
.dsh-cron-drawer {
  position: fixed; inset: 0 0 0 auto; margin: 0; padding: 0;
  width: 560px; max-width: 94vw; height: 100dvh; max-height: 100dvh;
  box-sizing: border-box; overflow: hidden;
  background: var(--dsh-cron-bg-surface); color: var(--dsh-cron-label-primary);
  border: 0; border-left: 1px solid var(--dsh-cron-border);
  box-shadow: -8px 0 24px rgb(0 0 0 / 28%);
}
.dsh-cron-drawer[open] { display: flex; flex-direction: column; }
.dsh-cron-drawer::backdrop { background: rgb(0 0 0 / 42%); }
/* The toolbar is the dropdown's local anchor, so narrow panes bound both edges. */
.dsh-cron-toolbar {
  position: relative; z-index: 1; flex: none; display: flex; align-items: center; gap: 6px;
  min-width: 0; padding: 6px 8px; border-bottom: 1px solid var(--dsh-cron-border);
}
.dsh-cron-settings { position: static; margin-left: auto; flex: none; }
.dsh-cron-settings > summary {
  list-style: none; display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px; cursor: pointer;
  color: var(--dsh-cron-label-tertiary);
}
.dsh-cron-settings > summary::-webkit-details-marker { display: none; }
.dsh-cron-settings > summary:hover, .dsh-cron-settings[open] > summary {
  color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive);
}
.dsh-cron-settings > summary:focus-visible, .dsh-cron-tab:focus-visible {
  outline: 2px solid var(--dsh-cron-label-secondary); outline-offset: 1px;
}
.dsh-cron-settingsBody {
  position: absolute; top: calc(100% - 2px); right: 8px; box-sizing: border-box;
  width: 320px; max-width: calc(100% - 16px);
  max-height: min(320px, 60dvh, var(--dsh-cron-settings-height, 60dvh)); overflow: auto;
  display: flex; flex-direction: column; gap: 8px; padding: 12px;
  background: var(--dsh-cron-bg-surface); border: 1px solid var(--dsh-cron-border);
  border-radius: 8px; box-shadow: 0 6px 18px rgb(0 0 0 / 18%);
}
.dsh-cron-settingsTitle { flex: none; margin: 0; font-size: 12px; font-weight: 600; }
.dsh-cron-settingsControls { flex: none; display: flex; flex-wrap: wrap; gap: 4px; }
.dsh-cron-settingsBody [aria-pressed="true"] { background: var(--dsh-cron-bg-interactive); font-weight: 600; }
.dsh-cron-owner { flex: none; padding: 8px 12px 4px; font-size: 12px; line-height: 1.5; color: var(--dsh-cron-label-secondary); overflow-wrap: anywhere; }
.dsh-cron-settingsBody .dsh-cron-owner { padding: 0; }
.dsh-cron-drawerHead {
  flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 10px 12px; border-bottom: 1px solid var(--dsh-cron-border);
}
.dsh-cron-drawerTitle { font-size: 13px; font-weight: 600; color: var(--dsh-cron-label-primary); }
.dsh-cron-drawerClose {
  border: 0; background: 0; cursor: pointer; font-size: 18px; line-height: 1;
  color: var(--dsh-cron-label-tertiary); padding: 2px 6px; border-radius: 6px;
}
.dsh-cron-drawerClose:hover { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); }
.dsh-cron-headSpacer { flex: 1; }
.dsh-cron-headText {
  border: 0; background: 0; cursor: pointer; font-size: 11px; line-height: 1;
  color: var(--dsh-cron-label-tertiary); padding: 5px 6px; border-radius: 6px;
  white-space: nowrap;
}
.dsh-cron-headText:hover { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); }
.dsh-cron-headTextOn {
  color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive);
  font-weight: 600;
}

/* panel body */
.dsh-cron-tabs { min-width: 0; display: flex; flex-wrap: wrap; gap: 2px; }
.dsh-cron-tab {
  flex: none; border: 0; background: 0; cursor: pointer; padding: 6px 10px; font-size: 12px;
  color: var(--dsh-cron-label-tertiary); border-radius: 6px;
}
.dsh-cron-tab:hover { color: var(--dsh-cron-label-secondary); }
.dsh-cron-tabActive { color: var(--dsh-cron-label-primary); background: var(--dsh-cron-bg-interactive); font-weight: 600; }
.dsh-cron-body { flex: 1; min-height: 0; min-width: 0; overflow: auto; padding: 6px; }
.dsh-cron-list { display: flex; flex-direction: column; gap: 4px; }
.dsh-cron-empty { padding: 18px 10px; max-width: 65ch; font-size: 13px; line-height: 1.6; color: var(--dsh-cron-label-secondary); }
.dsh-cron-row {
  box-sizing: border-box; border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  background: transparent;
}
.dsh-cron-row:hover { background: var(--dsh-cron-bg-interactive); }
.dsh-cron-rowDisabled .dsh-cron-taskId { color: var(--dsh-cron-label-secondary); }
.dsh-cron-rowHead { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dsh-cron-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; }
.dsh-cron-dotOn { background: var(--dsw-alias-state-success-primary, #22c55e); }
.dsh-cron-dotOff { background: var(--dsh-cron-label-caption); }
.dsh-cron-dotDelivered { background: var(--dsh-cron-label-caption); }
.dsh-cron-dotRunning { background: var(--dsw-alias-brand-primary, #3b82f6); }
.dsh-cron-dotCompleted { background: var(--dsw-alias-state-success-primary, #22c55e); }
.dsh-cron-dotFailed { background: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-cron-dotInterrupted { background: var(--dsw-alias-state-warning-primary, #f59e0b); }
.dsh-cron-taskId { font-family: var(--dsw-font-mono, monospace); font-size: 12px; color: var(--dsh-cron-label-primary); flex: 1; min-width: 0; word-break: break-all; }
.dsh-cron-badge {
  flex: none; font-size: 10px; line-height: 16px; padding: 0 6px; border-radius: 5px;
  background: var(--dsh-cron-bg-interactive); color: var(--dsh-cron-label-secondary);
}
.dsh-cron-time { flex: none; font-size: 11px; color: var(--dsh-cron-label-tertiary); }
.dsh-cron-prompt {
  font-size: 12px; color: var(--dsh-cron-label-secondary);
  white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;
}
.dsh-cron-meta { display: flex; justify-content: space-between; gap: 4px 12px; flex-wrap: wrap; font-size: 11px; color: var(--dsh-cron-label-tertiary); }
.dsh-cron-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
.dsh-cron-confirm { padding: 8px 0 4px; font-size: 12px; line-height: 1.5; color: var(--dsh-cron-label-secondary); }
.dsh-cron-confirm .dsh-cron-actions { margin-top: 4px; }
.dsh-cron-action {
  border: 0; background: 0; cursor: pointer; padding: 4px 0; min-height: 28px; font-size: 12px;
  color: var(--dsh-cron-label-tertiary);
}
.dsh-cron-action:hover { color: var(--dsh-cron-label-primary); text-decoration: underline; }
.dsh-cron-actionDanger:hover { color: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-cron-addButton {
  margin: 4px; padding: 7px 0; border: 1px dashed var(--dsh-cron-border); border-radius: 8px;
  background: 0; cursor: pointer; font-size: 12px; color: var(--dsh-cron-label-tertiary);
}
.dsh-cron-addButton:hover { color: var(--dsh-cron-label-primary); border-color: var(--dsh-cron-label-tertiary); }
.dsh-cron-form { display: flex; flex-direction: column; gap: 6px; padding: 8px 4px; }
.dsh-cron-formRow { display: flex; flex-wrap: wrap; gap: 6px; }
.dsh-cron-formRow .dsh-cron-input { flex: 1; min-width: 100px; }
.dsh-cron-input::placeholder, .dsh-cron-textarea::placeholder { color: var(--dsh-cron-label-secondary); opacity: 1; }
.dsh-cron-input, .dsh-cron-textarea, .dsh-cron-select {
  box-sizing: border-box; width: 100%; border: 1px solid var(--dsh-cron-border); border-radius: 6px;
  background: var(--dsh-cron-bg-control); color: var(--dsh-cron-label-primary);
  font-size: 12px; padding: 6px 8px; font-family: inherit;
}
.dsh-cron-textarea { resize: vertical; }
.dsh-cron-select { width: auto; flex: none; }
.dsh-cron-input:focus, .dsh-cron-textarea:focus, .dsh-cron-select:focus { outline: 1px solid var(--dsh-cron-label-tertiary); }
.dsh-cron-primaryButton {
  border: 0; border-radius: 6px; padding: 7px 0; cursor: pointer; font-size: 12px;
  background: var(--dsh-cron-bg-overlay); color: var(--dsh-cron-label-primary);
}
.dsh-cron-primaryButton:disabled { opacity: .5; cursor: default; }
.dsh-cron-ghostButton {
  border: 1px solid var(--dsh-cron-border); border-radius: 6px; padding: 6px 0; cursor: pointer;
  font-size: 12px; background: 0; color: var(--dsh-cron-label-secondary); width: 100%;
}
.dsh-cron-ghostButton:hover { color: var(--dsh-cron-label-primary); }
.dsh-cron-form .dsh-cron-primaryButton { flex: 1; }
.dsh-cron-form .dsh-cron-ghostButton { flex: 1; width: auto; }
.dsh-cron-unreadBadge {
  position: absolute; top: -4px; right: -6px; min-width: 14px; height: 14px; padding: 0 3px;
  border-radius: 7px; background: var(--dsw-alias-state-error-primary, #ef4444); color: var(--dsh-cron-bg-surface); font-size: 9px; line-height: 14px;
  text-align: center; font-variant-numeric: tabular-nums; box-sizing: border-box;
}
.dsh-cron-trigger { position: relative; }
.dsh-cron-toastStack {
  position: fixed; top: 56px; right: 16px; z-index: 90; /* above workbench (25), below app menus (100+); modal toasts live inside the dialog */
  display: flex; flex-direction: column; gap: 8px; pointer-events: none;
}
.dsh-cron-toast {
  pointer-events: auto; width: 300px; max-width: 80vw; text-align: left; cursor: pointer;
  border: 1px solid var(--dsh-cron-border); border-left: 1px solid var(--dsw-alias-state-success-primary, #22c55e);
  background: var(--dsh-cron-bg-overlay); color: var(--dsh-cron-label-primary); border-radius: 10px; padding: 10px 12px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 24%);
  display: flex; flex-direction: column; gap: 3px;
  animation: dsh-cron-toast-in .18s ease;
}
.dsh-cron-toastFailed { border-left-color: var(--dsw-alias-state-error-primary, #ef4444); }
.dsh-cron-toastTitle { font-size: 12px; font-weight: 600; color: var(--dsh-cron-label-primary); }
.dsh-cron-toastBody {
  font-size: 11px; color: var(--dsh-cron-label-secondary);
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
}
@keyframes dsh-cron-toast-in {
  from { opacity: 0; transform: translateX(16px); }
  to { opacity: 1; transform: translateX(0); }
}
.dsh-cron-error {
  flex: none; margin: 4px; padding: 8px; border-radius: 6px; font-size: 12px; line-height: 1.5;
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; overflow-wrap: anywhere;
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 10%, transparent); color: var(--dsh-cron-label-primary);
}
:where(.dsh-cron-sidebarPanel, .dsh-cron-drawer, .dsh-cron-toastStack) button:focus-visible,
.dsh-cron-trigger:focus-visible { outline: 2px solid var(--dsh-cron-label-secondary); outline-offset: 2px; }
:where(.dsh-cron-sidebarPanel, .dsh-cron-drawer) button:disabled { opacity: .5; cursor: default; text-decoration: none; }
:where(.dsh-cron-sidebarPanel, .dsh-cron-drawer) { caret-color: var(--dsh-cron-label-primary); }
:where(.dsh-cron-sidebarPanel, .dsh-cron-drawer) ::selection { background: var(--dsh-cron-bg-overlay); color: var(--dsh-cron-label-primary); }
.dsh-cron-body, .dsh-cron-settingsBody { scrollbar-width: thin; scrollbar-color: var(--dsh-cron-border) transparent; }
.dsh-cron-time, .dsh-cron-meta { font-variant-numeric: tabular-nums; }
.dsh-cron-action { text-underline-offset: 3px; }
/* Global owner index: a navigation list, not a second task-management surface. */
.dsh-cron-hub {
  box-sizing: border-box; width: 100%; height: 100%; min-width: 0; overflow: auto;
  padding: clamp(16px, 3vw, 32px); background: var(--dsh-cron-bg-surface); color: var(--dsh-cron-label-primary);
  scrollbar-width: thin; scrollbar-color: var(--dsh-cron-border) transparent;
}
.dsh-cron-hubHead { max-width: 68ch; margin: 0 0 20px; }
.dsh-cron-hubHead h1 { margin: 0 0 6px; font-size: clamp(18px, 2vw, 24px); line-height: 1.25; font-weight: 650; }
.dsh-cron-hubHead p { margin: 0; color: var(--dsh-cron-label-secondary); font-size: 13px; line-height: 1.6; }
.dsh-cron-hubList { max-width: 760px; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; }
.dsh-cron-hubRow {
  box-sizing: border-box; width: 100%; min-height: 58px; display: grid;
  grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; align-items: center;
  border: 0; border-bottom: 1px solid var(--dsh-cron-border); border-radius: 7px;
  padding: 10px 12px; text-align: left; cursor: pointer; background: transparent; color: var(--dsh-cron-label-primary);
}
.dsh-cron-hubRow:not(:disabled):hover { background: var(--dsh-cron-bg-interactive); }
.dsh-cron-hubRow:disabled { cursor: not-allowed; opacity: .64; }
.dsh-cron-hubRow:focus-visible { outline: 2px solid var(--dsh-cron-label-secondary); outline-offset: 2px; }
.dsh-cron-hubTitle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
.dsh-cron-hubCounts, .dsh-cron-hubNext { color: var(--dsh-cron-label-secondary); font-size: 11px; line-height: 1.45; font-variant-numeric: tabular-nums; }
.dsh-cron-hubNext { text-align: right; }
.dsh-cron-hubBadges { justify-self: end; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; }
@media (max-width: 560px) {
  .dsh-cron-hub { padding: 14px 10px; }
  .dsh-cron-hubRow { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .dsh-cron-hubBadges { justify-self: start; justify-content: flex-start; }
  .dsh-cron-hubNext { text-align: left; }
}
@media (prefers-reduced-motion: reduce) { .dsh-cron-toast { animation: none; } }
`;

//#endregion
//#region src/client/sidebar.ts
const CRON_TAB_ID = "dsh-cron:tasks";
function supportsSidebar(value) {
	const service = value;
	if (!service || typeof service.version !== "string") return false;
	const [major, minor] = service.version.split(".").map(Number);
	if (major !== 0 || minor < 18 || !Number.isFinite(minor)) return false;
	return [
		"registerTab",
		"openTab",
		"isTabEnabled",
		"getSnapshot"
	].every((key) => typeof service[key] === "function") && Array.isArray(service.features) && ["targetedOpen", "floatWindows"].every((feature) => service.features.includes(feature));
}
function hasTab(node, id) {
	return node.kind === "leaf" ? node.tabs.some((tab) => tab.id === id) : node.children.some((child) => hasTab(child, id));
}
function hasPane(node, id) {
	return node.kind === "leaf" ? node.id === id : node.children.some((child) => hasPane(child, id));
}
/** The public createTab patch reveals the hosting panel even on a dedupe open.
* Avoid fake file/URL seeds, private DOM buttons, or mutation of sidebar state.
* A detached Cron window is already visible and must not expand another panel.
*/
function createSidebarTab(state, title, viewportWidth) {
	const tab = {
		id: CRON_TAB_ID,
		type: CRON_TAB_ID,
		title
	};
	if (state.floats.some((window) => window.tab.id === "dsh-cron:tasks")) return { tab };
	const inBottom = hasTab(state.bottomSplits, "dsh-cron:tasks") || !hasTab(state.splits, "dsh-cron:tasks") && hasPane(state.bottomSplits, state.activePane);
	return {
		tab,
		patch: viewportWidth < 768 || !inBottom ? { panelOpen: true } : { bottomOpen: true }
	};
}

//#endregion
//#region src/client/native-sidebar.ts
const NATIVE_CRON_ID = "dsh-cron:native-tasks";
const NATIVE_CRON_KIND = "dsh-cron:scheduled-tasks";
function supportsNativeSidebar(registry, controller) {
	return typeof registry?.register === "function" && typeof controller?.openTab === "function";
}
function nativeDefinition(title) {
	return {
		id: NATIVE_CRON_ID,
		kind: NATIVE_CRON_KIND,
		title,
		priority: "extension"
	};
}
function ownerTitle(sessions, sessionId, unavailable, blankTitle = unavailable) {
	const owner = sessions.byId[sessionId];
	const title = owner?.displayTitle?.trim();
	if (owner?.blank) return blankTitle;
	return !title || title === sessionId ? unavailable : title;
}
/** Consumers, not tab kinds, own visibility. A floating duplicate can outlive a docked body. */
function createPanelConsumers() {
	const consumers = /* @__PURE__ */ new Set();
	const occurrences = /* @__PURE__ */ new Map();
	const clearNative = () => {
		for (const occurrence of [...occurrences.values()]) occurrence.dispose();
		for (const entry of consumers) if (entry.signal) consumers.delete(entry);
	};
	return {
		add(consumer) {
			const entry = { ...consumer };
			consumers.add(entry);
			const { sessionId, tabId, paneId, signal } = entry;
			if (tabId && paneId && signal && !signal.aborted) {
				const key = `${sessionId}\0${tabId}`;
				const previous = occurrences.get(key);
				const revision = previous?.entry.signal === signal ? previous.revision : void 0;
				previous?.dispose();
				const dispose = () => {
					signal.removeEventListener("abort", dispose);
					occurrences.delete(key);
				};
				occurrences.set(key, {
					entry,
					dispose,
					revision
				});
				signal.addEventListener("abort", dispose, { once: true });
			}
			return () => {
				consumers.delete(entry);
			};
		},
		visible(sessionId) {
			return [...consumers].some((entry) => entry.sessionId === sessionId && entry.visible && !entry.signal?.aborted);
		},
		pane(sessionId) {
			const entries = [...consumers].filter((entry) => entry.sessionId === sessionId && entry.paneId && !entry.signal?.aborted);
			return (entries.find((entry) => entry.visible) ?? [...occurrences.values()].reverse().find(({ entry }) => entry.sessionId === sessionId && !entry.signal?.aborted)?.entry ?? entries[0])?.paneId;
		},
		consumeNavigation(sessionId, tabId, revision) {
			const occurrence = occurrences.get(`${sessionId}\0${tabId}`);
			if (!occurrence || occurrence.revision === revision) return false;
			occurrence.revision = revision;
			return true;
		},
		clearNative,
		clear() {
			clearNative();
			consumers.clear();
		}
	};
}
/** Public openTab operates only on the mounted session; never invent a sessionId option. */
function openNative(controller, owner, current, view, paneId) {
	if (!controller || owner !== current) return false;
	controller.openTab(NATIVE_CRON_KIND, {
		params: { view },
		revealIfOpened: true,
		...paneId ? { paneId } : {}
	});
	return true;
}
/** A visible owner's request lifetime; stopping also cancels in-flight fetches. */
function createRequestLease(owner, currentOwner, signal) {
	let generation = 0;
	const controller = new AbortController();
	const stop = () => {
		generation++;
		controller.abort();
		signal?.removeEventListener("abort", stop);
	};
	if (signal?.aborted) stop();
	else signal?.addEventListener("abort", stop, { once: true });
	const alive = () => !controller.signal.aborted && owner === currentOwner();
	return {
		signal: controller.signal,
		begin: () => ++generation,
		alive,
		accepts: (request) => alive() && request === generation,
		stop
	};
}
function registerNativeSidebar(ctx, body, title, ready) {
	ctx.inject(["sidebarRightTabs", "sidebarRight"], (inner) => {
		const registry = inner.get("sidebarRightTabs");
		const controller = inner.get("sidebarRight");
		if (!supportsNativeSidebar(registry, controller)) return;
		inner.effect(() => inner.slots.inject("sidebar.right.pane.tab", () => {
			let releaseType;
			let releaseBody;
			try {
				releaseType = registry.register(nativeDefinition(title));
				releaseBody = inner.slots.register({
					name: "sidebar.right.pane.tab",
					key: NATIVE_CRON_ID,
					locale: "cron"
				}, body);
				ready(controller);
			} catch (error) {
				releaseBody?.();
				releaseType?.();
				console.warn("[dsh-cron] native registration failed; fallback remains available", error);
				return;
			}
			let disposed = false;
			return () => {
				if (disposed) return;
				disposed = true;
				ready(null);
				releaseBody?.();
				releaseType?.();
			};
		}), "dsh-cron: optional native sidebar tab");
	});
}

//#endregion
//#region src/client/read-poll.ts
const READ_DEADLINE_MS = 3e4;
var ReadTimeoutError = class extends Error {
	constructor() {
		super("Request timed out");
		this.name = "ReadTimeoutError";
	}
};
/** One cancellable batch per lifetime. Race the whole read (including JSON/body
* parsing) against abort, even if a transport ignores its signal. */
function createReadPoll(options) {
	let stopped = false;
	let flight;
	const alive = () => !stopped && !options.signal?.aborted && options.alive();
	const cancel = () => flight?.controller.abort();
	const stop = () => {
		stopped = true;
		cancel();
		options.signal?.removeEventListener("abort", stop);
	};
	if (options.signal?.aborted) stop();
	else options.signal?.addEventListener("abort", stop, { once: true });
	const run = () => {
		if (!alive()) return Promise.resolve();
		if (flight && !flight.controller.signal.aborted) return flight.completion;
		const controller = new AbortController();
		let timedOut = false;
		let onAbort;
		const cancelled = new Promise((_, reject) => {
			onAbort = () => reject(/* @__PURE__ */ new Error("Read cancelled"));
			controller.signal.addEventListener("abort", onAbort, { once: true });
		});
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, READ_DEADLINE_MS);
		const current = {
			controller,
			completion: Promise.resolve()
		};
		flight = current;
		options.started?.();
		current.completion = Promise.race([Promise.resolve().then(() => {
			if (controller.signal.aborted) throw new Error("Read cancelled");
			return options.read(controller.signal);
		}), cancelled]).then((value) => {
			if (flight === current && alive() && !controller.signal.aborted) options.publish(value);
		}).catch((error) => {
			if (flight === current && alive() && (timedOut || !controller.signal.aborted)) options.fail(timedOut ? new ReadTimeoutError() : error);
		}).finally(() => {
			clearTimeout(timer);
			controller.signal.removeEventListener("abort", onAbort);
			controller.abort();
			if (flight === current) {
				flight = void 0;
				if (alive()) options.settled?.();
			}
		});
		return current.completion;
	};
	return {
		run,
		cancel,
		stop
	};
}

//#endregion
//#region src/client/global-hub.tsx
const SCHEDULED_SESSIONS_ID = "dsh-cron:scheduled-sessions";
const HUB_POLL_MS = 2e4;
async function readOwners(signal) {
	const response = await fetch("/cron/api/owners", {
		method: "POST",
		signal,
		headers: { "content-type": "application/json" },
		body: "{}"
	});
	const payload = await response.json().catch(() => null);
	if (!payload?.ok || !Array.isArray(payload.result)) throw new Error(payload?.error?.message ?? `request failed (${response.status})`);
	return payload.result;
}
function ownerLabel(sessionId, session, blank) {
	const title = session?.displayTitle?.trim();
	if (title && title !== sessionId) return title;
	return session?.blank ? blank : sessionId;
}
function formatNext(value) {
	if (!value) return "";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}
function ScheduledSessionsIcon({ size, active }) {
	const edge = Number.isFinite(size) && size > 0 ? size : 18;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
		width: edge,
		height: edge,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: active ? 2 : 1.7,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		focusable: "false",
		"data-cron-hub-active": active ? "" : void 0,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
			cx: "12",
			cy: "12",
			r: "9"
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 7v5l3 2" })]
	});
}
function ScheduledSessionsPanel({ open = true, t, useSessions, uiWorkspace }) {
	const visible = open === true || open === "dsh-cron:scheduled-sessions";
	const sessions = useSessions((snapshot) => snapshot.byId);
	const [owners, setOwners] = (0, react.useState)([]);
	const [loaded, setLoaded] = (0, react.useState)(false);
	const [loading, setLoading] = (0, react.useState)(false);
	const [error, setError] = (0, react.useState)("");
	const pollRef = (0, react.useRef)(null);
	const refresh = (0, react.useCallback)(() => pollRef.current?.run(), []);
	(0, react.useEffect)(() => {
		if (!visible) return;
		const reader = createReadPoll({
			alive: () => visible && document.visibilityState !== "hidden",
			read: readOwners,
			publish: (value) => {
				setOwners(value);
				setLoaded(true);
				setError("");
			},
			fail: (cause) => setError(cause instanceof ReadTimeoutError ? t("hub.timeout") : t("hub.error")),
			started: () => setLoading(true),
			settled: () => setLoading(false)
		});
		pollRef.current = reader;
		reader.run();
		const timer = setInterval(() => {
			if (document.visibilityState !== "hidden") reader.run();
		}, HUB_POLL_MS);
		const visibility = () => {
			if (document.visibilityState === "hidden") reader.cancel();
			else reader.run();
		};
		document.addEventListener("visibilitychange", visibility);
		return () => {
			reader.stop();
			clearInterval(timer);
			document.removeEventListener("visibilitychange", visibility);
			if (pollRef.current === reader) pollRef.current = null;
		};
	}, [visible, t]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
		className: "dsh-cron-hub",
		"aria-label": t("hub.title"),
		"aria-busy": loading,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
				className: "dsh-cron-hubHead",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: t("hub.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("hub.description") })]
			}),
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-cron-error",
				role: "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dsh-cron-action",
					disabled: loading,
					onClick: () => void refresh(),
					children: t("action.retry")
				})]
			}) : null,
			!loaded && loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-cron-empty",
				role: "status",
				children: t("hub.loading")
			}) : null,
			loaded && !error && owners.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-cron-empty",
				role: "status",
				children: t("hub.empty")
			}) : null,
			loaded && owners.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
				className: "dsh-cron-hubList",
				"aria-label": t("hub.list"),
				children: owners.map((owner) => {
					const session = sessions[owner.sessionId];
					const title = ownerLabel(owner.sessionId, session, t("hub.blankSession"));
					const available = session !== void 0;
					const state = !available ? t("hub.unavailableShort") : session.running ? t("hub.running") : session.blank ? t("hub.blank") : "";
					const preset = session?.projectionValues?.agentPreset?.trim() ?? "";
					const next = owner.nextRunAt ? t("hub.next", { time: formatNext(owner.nextRunAt) }) : owner.enabledCount > 0 ? t("hub.waiting") : t("hub.noEnabled");
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "dsh-cron-hubRow",
						disabled: !available,
						title: available ? void 0 : t("hub.unavailable"),
						onClick: () => {
							if (available) uiWorkspace.openSession(owner.sessionId);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-cron-hubTitle",
								children: title
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "dsh-cron-hubBadges",
								children: [state ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-cron-badge",
									children: state
								}) : null, preset ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dsh-cron-badge",
									title: t("hub.preset", { preset }),
									children: preset
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-cron-hubCounts",
								children: t("hub.counts", {
									tasks: owner.taskCount,
									enabled: owner.enabledCount
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-cron-hubNext",
								children: next
							})
						]
					}) }, owner.sessionId);
				})
			}) : null
		]
	});
}
function supportsHub(uiWorkspace, sessions) {
	return sessions != null && typeof uiWorkspace?.openSession === "function";
}
/** Optional global root contribution. Both seats and both services must exist;
* otherwise current-session Cron surfaces continue unchanged. */
function registerScheduledSessionsHub(ctx, t) {
	ctx.inject(["uiWorkspace", "sessions"], (inner) => {
		const uiWorkspace = inner.get("uiWorkspace");
		if (!supportsHub(uiWorkspace, inner.get("sessions"))) return;
		inner.effect(() => inner.slots.inject("sidebar.panellist", () => inner.slots.inject("main", () => {
			let releaseIcon;
			let releasePanel;
			try {
				releaseIcon = inner.slots.register({
					name: "sidebar.panellist",
					id: SCHEDULED_SESSIONS_ID,
					order: 70,
					label: () => t()("hub.title"),
					locale: "cron"
				}, ScheduledSessionsIcon);
				releasePanel = inner.slots.register({
					name: "main",
					key: SCHEDULED_SESSIONS_ID,
					locale: "cron"
				}, (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScheduledSessionsPanel, {
					...props,
					uiWorkspace
				}));
			} catch (error) {
				releasePanel?.();
				releaseIcon?.();
				console.warn("[dsh-cron] scheduled sessions hub unavailable", error);
				return;
			}
			let disposed = false;
			return () => {
				if (disposed) return;
				disposed = true;
				releasePanel?.();
				releaseIcon?.();
			};
		})), "dsh-cron: optional scheduled sessions hub");
	});
}

//#endregion
//#region src/client/index.tsx
/** Services required from the client runtime. */
const inject = ["slots", "locale"];
let drawerOpen = false;
let activeSessionId = null;
let drawerSessionId = null;
let sidebar = null;
let nativeSidebar = null;
const panelConsumers = createPanelConsumers();
const sessionTitles = /* @__PURE__ */ new Map();
const sessionViews = /* @__PURE__ */ new Map();
function sessionView(sessionId) {
	if (!sessionId) return {
		count: 0,
		unread: 0,
		tab: "tasks"
	};
	let view = sessionViews.get(sessionId);
	if (!view) {
		view = {
			count: 0,
			unread: 0,
			tab: "tasks"
		};
		sessionViews.set(sessionId, view);
	}
	return view;
}
let toastSeq = 0;
let toasts = [];
const TOAST_MS = 8e3;
const PREFS_KEY = "dsh-cron:prefs";
function loadPrefs() {
	try {
		const raw = typeof localStorage !== "undefined" ? localStorage.getItem(PREFS_KEY) : null;
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				sound: parsed.sound !== false,
				system: parsed.system === true
			};
		}
	} catch {}
	return {
		sound: true,
		system: false
	};
}
let prefs = loadPrefs();
function setPref(key, value) {
	prefs = {
		...prefs,
		[key]: value
	};
	try {
		if (typeof localStorage !== "undefined") localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {}
	storeNotify();
}
let snapshot = {
	open: drawerOpen,
	sessionId: activeSessionId,
	drawerSessionId,
	toasts,
	prefs
};
const storeListeners = /* @__PURE__ */ new Set();
function storeSubscribe(listener) {
	storeListeners.add(listener);
	return () => {
		storeListeners.delete(listener);
	};
}
function storeNotify() {
	snapshot = {
		open: drawerOpen,
		sessionId: activeSessionId,
		drawerSessionId,
		toasts,
		prefs
	};
	for (const listener of storeListeners) listener();
}
function setActiveSession(sessionId) {
	if (activeSessionId === sessionId) return;
	activeSessionId = sessionId;
	drawerOpen = false;
	storeNotify();
}
function setDrawerOpen(open) {
	if (drawerOpen === open) return;
	drawerOpen = open;
	if (open) sessionView(drawerSessionId).unread = 0;
	storeNotify();
}
/** Prefer a visible sidebar destination; old-session notifications use a pinned
* fallback dialog rather than silently opening a tab in an invisible session. */
function openDrawer(tab, sessionId = activeSessionId) {
	if (!sessionId) return;
	sessionView(sessionId).tab = tab;
	sessionView(sessionId).unread = 0;
	try {
		if (openNative(nativeSidebar, sessionId, activeSessionId, tab, panelConsumers.pane(sessionId))) {
			drawerOpen = false;
			storeNotify();
			return;
		}
	} catch (error) {
		console.warn("[dsh-cron] native open failed; trying compatible fallback", error);
	}
	try {
		if (sessionId === activeSessionId && sidebar?.isTabEnabled("dsh-cron:tasks") && sidebar.getSnapshot().sessionId === sessionId) {
			sidebar.openTab({ type: CRON_TAB_ID }, { sessionId });
			drawerOpen = false;
			storeNotify();
			return;
		}
	} catch (error) {
		console.warn("[dsh-cron] sidebar open failed; using standalone panel", error);
	}
	drawerSessionId = sessionId;
	drawerOpen = true;
	storeNotify();
}
function setEnabledCount(count, sessionId) {
	const view = sessionView(sessionId);
	if (view.count === count) return;
	view.count = count;
	storeNotify();
}
function bumpUnread(sessionId, by) {
	const view = sessionView(sessionId);
	if (drawerOpen && drawerSessionId === sessionId || panelConsumers.visible(sessionId) || by === 0) return;
	view.unread += by;
	storeNotify();
}
function setDrawerTab(tab, sessionId) {
	const view = sessionView(sessionId);
	if (view.tab === tab) return;
	view.tab = tab;
	storeNotify();
}
/** Push one toast onto the stack (shared by the watcher and the test button). */
function pushToast(event) {
	toasts = [...toasts, {
		...event,
		key: toastSeq++
	}].slice(-3);
	storeNotify();
}
function dismissToast(key) {
	toasts = toasts.filter((item) => item.key !== key);
	storeNotify();
}
function useDrawerState() {
	return (0, react.useSyncExternalStore)(storeSubscribe, () => snapshot);
}
async function api(method, payload, signal) {
	const res = await fetch(`/cron/api/${method}`, {
		method: "POST",
		signal,
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload ?? {})
	});
	const data = await res.json().catch(() => null);
	if (!data?.ok) throw new Error(data?.error?.message ?? `request failed (${res.status})`);
	return data.result;
}
/** Fallback translator when a slot supplies no locale seat: zh + {param} interpolation. */
const fallbackT = (key, params) => (zh[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params?.[name] ?? ""));
/**
* Pure status-diff for polling: which records newly reached a terminal state
* (completed / failed) since the previous snapshot. Records absent from the
* previous snapshot count as new (a fast task can fire and finish between two
* polls). Exported for tests.
*/
function diffRecords(prev, records) {
	const events = [];
	for (const record of records) {
		if (record.status !== "completed" && record.status !== "failed") continue;
		if (prev.get(record.id) === record.status) continue;
		events.push({
			record,
			kind: record.status
		});
	}
	return events;
}
const POLL_MS = 2e4;
/**
* Short synthesized chime (no audio asset needed). Completed: rising major
* fifth; failed: falling minor second. Autoplay policies may block the very
* first playback before any user gesture — silently skipped.
*/
function playChime(kind) {
	try {
		const Ctor = window.AudioContext ?? window.webkitAudioContext;
		if (!Ctor) return;
		const audio = new Ctor();
		audio.resume?.();
		(kind === "failed" ? [311.13, 293.66] : [523.25, 783.99]).forEach((freq, index) => {
			const osc = audio.createOscillator();
			const gain = audio.createGain();
			osc.type = "sine";
			osc.frequency.value = freq;
			const t0 = audio.currentTime + index * .12;
			gain.gain.setValueAtTime(0, t0);
			gain.gain.linearRampToValueAtTime(.12, t0 + .02);
			gain.gain.exponentialRampToValueAtTime(.001, t0 + .35);
			osc.connect(gain).connect(audio.destination);
			osc.start(t0);
			osc.stop(t0 + .4);
		});
		setTimeout(() => void audio.close().catch(() => {}), 1200);
	} catch {}
}
/** Browser-level system notification: appears even when this tab is backgrounded. */
function sendBrowserNotification(event) {
	try {
		if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
		const title = fallbackT(`toast.${event.kind}`, { id: event.record.taskId });
		const body = (event.record.excerpt || event.record.prompt || "").slice(0, 200);
		const notification = new Notification(title, {
			body,
			tag: event.record.id
		});
		notification.onclick = () => {
			window.focus();
			openDrawer("history", event.record.sessionId ?? activeSessionId);
		};
	} catch {}
}
/** Central fan-out for newly finished runs: toasts + badge + sound + system. */
function notifyEvents(events) {
	if (events.length === 0) return;
	for (const event of events) {
		const owner = event.record.sessionId ?? activeSessionId;
		if (owner) bumpUnread(owner, 1);
		pushToast(event);
	}
	if (prefs.sound) playChime(events.some((e) => e.kind === "failed") ? "failed" : "completed");
	if (prefs.system) for (const event of events) sendBrowserNotification(event);
}
/** One toast card; auto-dismisses, click opens the drawer on the history tab. */
function ToastCard({ t, item }) {
	const sticky = item.kind === "failed";
	(0, react.useEffect)(() => {
		if (sticky) return;
		const timer = setTimeout(() => dismissToast(item.key), TOAST_MS);
		return () => clearTimeout(timer);
	}, [item.key, sticky]);
	const open = () => {
		dismissToast(item.key);
		openDrawer("history", item.record.sessionId ?? activeSessionId);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		className: item.kind === "failed" ? styles.toastFailed : styles.toast,
		onClick: open,
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: styles.toastTitle,
			children: t(`toast.${item.kind}`, { id: item.record.taskId })
		}), item.record.excerpt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: styles.toastBody,
			children: item.record.excerpt
		}) : null]
	});
}
/**
* Polls run history and surfaces finished runs as toasts + badge counts.
* Lives in the root-scoped overlay component so exactly ONE watcher exists no
* matter how many sessions are open. The first poll only primes the snapshot
* (old records never toast).
*/
function useCronWatcher(sessionId) {
	const snapshotRef = (0, react.useRef)(null);
	const ownerRef = (0, react.useRef)(sessionId);
	ownerRef.current = sessionId;
	(0, react.useEffect)(() => {
		snapshotRef.current = null;
		if (!sessionId) return;
		console.info("[dsh-cron] watcher started (poll every %ds)", POLL_MS / 1e3);
		const reader = createReadPoll({
			alive: () => ownerRef.current === sessionId,
			read: (signal) => api("history", {
				limit: 20,
				sessionId
			}, signal),
			publish: ({ records }) => {
				const prev = snapshotRef.current;
				snapshotRef.current = new Map(records.map((r) => [r.id, r.status]));
				if (prev === null) {
					console.info("[dsh-cron] watcher primed with %d record(s)", records.length);
					return;
				}
				const events = diffRecords(prev, records);
				if (events.length === 0) return;
				console.info("[dsh-cron]", events.length, "task run(s) finished:", events.map((e) => `${e.record.taskId}:${e.kind}`).join(", "));
				notifyEvents(events.map((event) => ({
					...event,
					record: {
						...event.record,
						sessionId
					}
				})));
			},
			fail: (error) => {
				console.warn(error instanceof ReadTimeoutError ? "[dsh-cron] watcher history request timed out; will retry on the next poll." : "[dsh-cron] watcher history request failed; will retry on the next poll.");
			}
		});
		const poll = () => {
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
			return reader.run();
		};
		const visibility = () => {
			if (document.visibilityState === "hidden") reader.cancel();
			else poll();
		};
		document.addEventListener("visibilitychange", visibility);
		poll();
		const timer = setInterval(poll, POLL_MS);
		return () => {
			reader.stop();
			clearInterval(timer);
			document.removeEventListener("visibilitychange", visibility);
		};
	}, [sessionId]);
}
function formatTime(iso) {
	if (!iso) return "—";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleString();
}
function scheduleText(task, t) {
	if (task.schedule.at) return t("schedule.at", { time: formatTime(task.schedule.at) });
	if (task.schedule.everySeconds != null) {
		const seconds = task.schedule.everySeconds;
		if (seconds % 3600 === 0) return t("schedule.every.hours", { count: seconds / 3600 });
		if (seconds % 60 === 0) return t("schedule.every.minutes", { count: seconds / 60 });
		return t("schedule.every.seconds", { count: seconds });
	}
	if (task.schedule.daily) return t("schedule.daily", {
		time: task.schedule.daily,
		zone: task.schedule.timeZone ?? ""
	});
	if (task.schedule.cron) return t("schedule.cron", {
		expr: task.schedule.cron,
		zone: task.schedule.timeZone ?? ""
	});
	return "";
}
function durationText(record, t) {
	if (record.startedAt == null || record.completedAt == null) return "";
	const seconds = Math.max(0, Math.round((record.completedAt - record.startedAt) / 1e3));
	if (seconds < 60) return t("duration.seconds", { count: seconds });
	return t("duration.minutes", {
		count: Math.floor(seconds / 60),
		seconds: seconds % 60
	});
}
function ruleOf(task) {
	if (task.schedule.cron) return "cron";
	if (task.schedule.daily) return "daily";
	if (task.schedule.everySeconds != null) return "every";
	return "at";
}
function ruleValueOf(task) {
	if (task.schedule.cron) return task.schedule.cron;
	if (task.schedule.daily) return task.schedule.daily;
	if (task.schedule.everySeconds != null) return String(task.schedule.everySeconds);
	return task.schedule.at ?? "";
}
/** Inline editor for one dynamic task (prompt + schedule rule). */
function EditTaskForm({ t, task, sessionId, onDone, signal }) {
	const [form, setForm] = (0, react.useState)({
		prompt: task.prompt,
		rule: ruleOf(task),
		value: ruleValueOf(task)
	});
	const [error, setError] = (0, react.useState)("");
	const [busy, setBusy] = (0, react.useState)(false);
	const busyRef = (0, react.useRef)(false);
	const leaseRef = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		const lease = createRequestLease(sessionId, () => sessionId, signal);
		leaseRef.current = lease;
		return () => lease.stop();
	}, [sessionId, signal]);
	const submit = async () => {
		const lease = leaseRef.current;
		if (busyRef.current || !lease?.alive()) return;
		busyRef.current = true;
		setBusy(true);
		setError("");
		try {
			const payload = {
				id: task.id,
				prompt: form.prompt.trim(),
				sessionId
			};
			if (form.rule === "daily") payload.daily = form.value.trim();
			else if (form.rule === "every") payload.every = Number(form.value.trim());
			else if (form.rule === "cron") payload.cron = form.value.trim();
			else payload.at = form.value.trim();
			await api("update", payload, lease.signal);
			if (lease.alive()) onDone();
		} catch (err) {
			if (lease.alive()) setError(err instanceof Error ? err.message : String(err));
		} finally {
			if (lease.alive()) {
				busyRef.current = false;
				setBusy(false);
			}
		}
	};
	const valuePlaceholder = t(`form.value.${form.rule}`);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: styles.form,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
				className: styles.textarea,
				value: form.prompt,
				placeholder: t("form.prompt"),
				"aria-label": t("form.prompt"),
				disabled: busy,
				rows: 2,
				onChange: (e) => setForm({
					...form,
					prompt: e.target.value
				})
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.formRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
					className: styles.select,
					"aria-label": t("form.schedule"),
					disabled: busy,
					value: form.rule,
					onChange: (e) => setForm({
						...form,
						rule: e.target.value,
						value: ""
					}),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "daily",
							children: t("form.rule.daily")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "every",
							children: t("form.rule.every")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "cron",
							children: t("form.rule.cron")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: "at",
							children: t("form.rule.at")
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					className: styles.input,
					value: form.value,
					placeholder: valuePlaceholder,
					"aria-label": valuePlaceholder,
					disabled: busy,
					onChange: (e) => setForm({
						...form,
						value: e.target.value
					})
				})]
			}),
			error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: styles.error,
				role: "alert",
				children: error
			}) : null,
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.formRow,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: styles.primaryButton,
					disabled: busy || form.prompt.trim() === "" || form.value.trim() === "",
					onClick: () => void submit(),
					children: t(busy ? "action.pending" : "action.save")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: styles.ghostButton,
					disabled: busy,
					onClick: onDone,
					children: t("action.cancel")
				})]
			})
		]
	});
}
function CronPanel({ t, tab, sessionId, visible, signal }) {
	const [tasks, setTasks] = (0, react.useState)([]);
	const [records, setRecords] = (0, react.useState)([]);
	const [error, setError] = (0, react.useState)("");
	const [loaded, setLoaded] = (0, react.useState)(false);
	const [loading, setLoading] = (0, react.useState)(true);
	const [editingId, setEditingId] = (0, react.useState)(null);
	const [deletingId, setDeletingId] = (0, react.useState)(null);
	const [pending, setPending] = (0, react.useState)(/* @__PURE__ */ new Set());
	const pendingRef = (0, react.useRef)(/* @__PURE__ */ new Set());
	const leaseRef = (0, react.useRef)(null);
	const pollRef = (0, react.useRef)(null);
	const ownerRef = (0, react.useRef)(sessionId);
	ownerRef.current = sessionId;
	const refresh = (0, react.useCallback)((afterMutation = false) => {
		if (afterMutation) pollRef.current?.cancel();
		if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
		return pollRef.current?.run();
	}, []);
	(0, react.useEffect)(() => {
		setEditingId(null);
		setDeletingId(null);
		pendingRef.current = /* @__PURE__ */ new Set();
		setPending(/* @__PURE__ */ new Set());
		if (!visible || signal?.aborted) return;
		const lease = createRequestLease(sessionId, () => ownerRef.current, signal);
		leaseRef.current = lease;
		const reader = createReadPoll({
			signal: lease.signal,
			alive: lease.alive,
			read: (signal) => Promise.all([api("list", { sessionId }, signal), api("history", {
				limit: 50,
				sessionId
			}, signal)]),
			publish: ([listResult, historyResult]) => {
				setTasks(listResult.tasks);
				setRecords(historyResult.records);
				setEnabledCount(listResult.tasks.filter((task) => task.enabled).length, sessionId);
				setLoaded(true);
				setError("");
			},
			fail: (error) => setError(error instanceof ReadTimeoutError ? t("panel.timeout") : error instanceof Error ? error.message : String(error)),
			started: () => setLoading(true),
			settled: () => setLoading(false)
		});
		pollRef.current = reader;
		refresh();
		const timer = setInterval(() => void refresh(), 1e4);
		const visibility = () => {
			if (document.visibilityState === "hidden") reader.cancel();
			else refresh();
		};
		document.addEventListener("visibilitychange", visibility);
		const stop = () => {
			lease.stop();
			reader.stop();
			clearInterval(timer);
			document.removeEventListener("visibilitychange", visibility);
			if (pollRef.current === reader) pollRef.current = null;
		};
		signal?.addEventListener("abort", stop, { once: true });
		return () => {
			stop();
			signal?.removeEventListener("abort", stop);
		};
	}, [
		refresh,
		sessionId,
		visible,
		signal,
		t
	]);
	const act = async (method, payload) => {
		const lease = leaseRef.current;
		const id = String(payload.id);
		if (!visible || !lease?.alive() || pendingRef.current.has(id)) return;
		pendingRef.current.add(id);
		setPending(new Set(pendingRef.current));
		setError("");
		try {
			await api(method, {
				...payload,
				sessionId
			}, lease.signal);
			if (!lease.alive()) return;
			setDeletingId(null);
			await refresh(true);
		} catch (err) {
			if (lease.alive()) setError(err instanceof Error ? err.message : String(err));
		} finally {
			if (lease.alive()) {
				pendingRef.current.delete(id);
				setPending(new Set(pendingRef.current));
			}
		}
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [error ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: styles.error,
		role: "alert",
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("panel.error", { message: error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
			type: "button",
			className: styles.action,
			disabled: loading,
			onClick: () => void refresh(),
			children: t("action.retry")
		})]
	}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: styles.body,
		"aria-busy": loading,
		children: [!loaded && loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: styles.empty,
			role: "status",
			children: t("panel.loading")
		}) : null, tab === "tasks" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: styles.list,
			children: [loaded && !error && tasks.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: styles.empty,
				children: t("tasks.empty")
			}) : null, tasks.map((task) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: task.enabled ? styles.row : styles.rowDisabled,
				children: editingId === task.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditTaskForm, {
					t,
					task,
					sessionId,
					signal: leaseRef.current?.signal,
					onDone: () => {
						setEditingId(null);
						refresh(true);
					}
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.rowHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: task.enabled ? styles.dotOn : styles.dotOff }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.taskId,
								children: task.id
							}),
							task.sessionId ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.badge,
								title: t("task.boundTo", { id: task.sessionId }),
								children: t("task.bound")
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.badge,
								children: t(`origin.${task.origin}`)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: styles.prompt,
						title: task.prompt,
						children: task.prompt
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.meta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: scheduleText(task, t) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("task.next", { time: formatTime(task.nextRunAt) }) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.actions,
						"aria-busy": pending.has(task.id),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.action,
								disabled: pending.has(task.id),
								onClick: () => void act("run", { id: task.id }),
								children: t("action.run")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.action,
								disabled: pending.has(task.id),
								onClick: () => void act("toggle", {
									id: task.id,
									enabled: !task.enabled
								}),
								children: task.enabled ? t("action.pause") : t("action.resume")
							}),
							task.origin === "dynamic" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.action,
								disabled: pending.has(task.id),
								onClick: () => {
									setDeletingId(null);
									setEditingId(task.id);
								},
								children: t("action.edit")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.actionDanger,
								disabled: pending.has(task.id),
								"aria-expanded": deletingId === task.id,
								onClick: () => setDeletingId(task.id),
								children: t("action.remove")
							})] }) : null,
							pending.has(task.id) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.meta,
								role: "status",
								children: t("action.pending")
							}) : null
						]
					}),
					deletingId === task.id ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.confirm,
						role: "group",
						"aria-label": t("task.confirmRemove"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("task.confirmRemove") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: styles.actions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.actionDanger,
								disabled: pending.has(task.id),
								onClick: () => void act("remove", { id: task.id }),
								children: t("action.confirmRemove")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: styles.action,
								disabled: pending.has(task.id),
								onClick: () => setDeletingId(null),
								children: t("action.cancel")
							})]
						})]
					}) : null
				] })
			}, task.id))]
		}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: styles.list,
			children: [loaded && !error && records.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: styles.empty,
				children: t("history.empty")
			}) : null, records.map((record) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.row,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.rowHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: styles[`dot_${record.status}`] ?? styles.dotOff }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.taskId,
								children: record.taskId
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.badge,
								children: t(`history.status.${record.status}`)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: styles.time,
								children: formatTime(record.firedAt)
							})
						]
					}),
					record.excerpt ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: styles.prompt,
						title: record.excerpt,
						children: record.excerpt
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: styles.meta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("history.scheduled", { time: formatTime(record.scheduledFor) }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: durationText(record, t) })]
					})
				]
			}, record.id))]
		})]
	})] });
}
function PanelHeader({ t, onClose }) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: styles.drawerHead,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: styles.drawerTitle,
				children: t("trigger.aria")
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: styles.headSpacer }),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: styles.drawerClose,
				"aria-label": t("drawer.close"),
				onClick: onClose,
				children: "×"
			})
		]
	});
}
function PanelSettings({ t, sessionId, visible }) {
	const { prefs: currentPrefs } = useDrawerState();
	const ref = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		const details = ref.current;
		details.open = false;
		if (!visible) return;
		const close = () => {
			details.open = false;
		};
		const outsidePointer = (event) => {
			if (details.open && event.target instanceof Node && !details.contains(event.target)) {
				if (details.contains(details.ownerDocument.activeElement)) details.querySelector("summary")?.focus();
				close();
			}
		};
		const escape = (event) => {
			if (event.key !== "Escape" || !details.open || !(event.target instanceof Node) || !details.contains(event.target)) return;
			event.preventDefault();
			event.stopPropagation();
			close();
			details.querySelector("summary")?.focus();
		};
		const doc = details.ownerDocument;
		const toolbar = details.closest(`.${styles.toolbar}`);
		const pane = details.closest(`.${styles.sidebarPanel}, .${styles.drawer}`);
		const measure = () => {
			if (!toolbar || !pane) return;
			const available = Math.max(0, pane.getBoundingClientRect().bottom - toolbar.getBoundingClientRect().bottom - 8);
			details.style.setProperty("--dsh-cron-settings-height", `${available}px`);
		};
		const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
		if (pane) observer?.observe(pane);
		if (toolbar) observer?.observe(toolbar);
		measure();
		details.addEventListener("toggle", measure);
		doc.defaultView?.addEventListener("resize", measure);
		doc.addEventListener("pointerdown", outsidePointer, true);
		doc.addEventListener("keydown", escape, true);
		return () => {
			close();
			observer?.disconnect();
			details.style.removeProperty("--dsh-cron-settings-height");
			details.removeEventListener("toggle", measure);
			doc.defaultView?.removeEventListener("resize", measure);
			doc.removeEventListener("pointerdown", outsidePointer, true);
			doc.removeEventListener("keydown", escape, true);
		};
	}, [sessionId, visible]);
	const testToast = () => notifyEvents([{
		kind: "completed",
		record: {
			id: "toast-test",
			taskId: "toast-test",
			sessionId,
			prompt: "",
			scheduledFor: "",
			firedAt: "",
			status: "completed",
			excerpt: t("toast.testBody")
		}
	}]);
	const toggleSystem = async () => {
		if (currentPrefs.system) {
			setPref("system", false);
			return;
		}
		if (typeof Notification === "undefined") return;
		if (Notification.permission === "default") try {
			await Notification.requestPermission();
		} catch {}
		if (Notification.permission === "granted") setPref("system", true);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
		ref,
		className: styles.settings,
		onBlur: (event) => {
			if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
			"aria-label": t("panel.settings"),
			title: t("panel.settings"),
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: "16",
				height: "16",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.7",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				focusable: "false",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m10 3-.5 2.5-2 1.2L5 6l-2 3.5L5 11v2l-2 1.5L5 18l2.5-.7 2 1.2L10 21h4l.5-2.5 2-1.2 2.5.7 2-3.5-2-1.5v-2l2-1.5L19 6l-2.5.7-2-1.2L14 3Z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "12",
					r: "3"
				})]
			})
		}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: styles.settingsBody,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: styles.owner,
					children: t("panel.owner", { id: sessionId })
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: styles.settingsTitle,
					children: t("prefs.title")
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: styles.settingsControls,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles.headText,
							title: t("prefs.system"),
							"aria-pressed": currentPrefs.system,
							onClick: () => void toggleSystem(),
							children: t("prefs.systemShort")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles.headText,
							title: t("prefs.sound"),
							"aria-pressed": currentPrefs.sound,
							onClick: () => setPref("sound", !currentPrefs.sound),
							children: t("prefs.soundShort")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: styles.headText,
							onClick: testToast,
							children: t("drawer.test")
						})
					]
				})
			]
		})]
	});
}
function PanelContent({ t, sessionId, visible, onClose, title, signal }) {
	useDrawerState();
	const view = sessionView(sessionId);
	const owner = title || sessionTitles.get(sessionId);
	const ownerLine = t(sessionId === activeSessionId ? "panel.currentOwner" : "panel.pinnedOwner", { title: owner || t("panel.titleUnavailable") });
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
		onClose ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelHeader, {
			t,
			onClose
		}) : null,
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: styles.owner,
			children: owner ? ownerLine : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				open: true,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", { children: ownerLine }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("panel.owner", { id: sessionId }) })]
			})
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: styles.toolbar,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: styles.tabs,
				role: "group",
				"aria-label": t("panel.views"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: view.tab === "tasks" ? styles.tabActive : styles.tab,
					"aria-pressed": view.tab === "tasks",
					onClick: () => setDrawerTab("tasks", sessionId),
					children: t("tab.tasks")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: view.tab === "history" ? styles.tabActive : styles.tab,
					"aria-pressed": view.tab === "history",
					onClick: () => setDrawerTab("history", sessionId),
					children: t("tab.history")
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelSettings, {
				t,
				sessionId,
				visible
			}, sessionId)]
		}),
		/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CronPanel, {
			t,
			tab: view.tab,
			sessionId,
			visible,
			signal
		}, sessionId)
	] });
}
function StandalonePanel({ t, sessionId, children, title }) {
	const ref = (0, react.useRef)(null);
	(0, react.useEffect)(() => {
		const dialog = ref.current;
		const previous = document.activeElement;
		dialog.showModal();
		return () => {
			dialog.close();
			if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
		};
	}, []);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
		ref,
		className: styles.drawer,
		"aria-label": t("trigger.aria"),
		onCancel: (event) => {
			event.preventDefault();
			setDrawerOpen(false);
		},
		onClick: (event) => {
			if (event.target !== event.currentTarget) return;
			const box = event.currentTarget.getBoundingClientRect();
			if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setDrawerOpen(false);
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelContent, {
			t,
			sessionId,
			title,
			visible: true,
			onClose: () => setDrawerOpen(false)
		}), children]
	});
}
function usePanelConsumer(sessionId, visible, paneId, tabId, signal) {
	(0, react.useEffect)(() => {
		const release = panelConsumers.add({
			sessionId,
			visible,
			paneId,
			tabId,
			signal
		});
		if (visible && !signal?.aborted) sessionView(sessionId).unread = 0;
		storeNotify();
		const abort = () => {
			release();
			storeNotify();
		};
		signal?.addEventListener("abort", abort, { once: true });
		return () => {
			signal?.removeEventListener("abort", abort);
			release();
			storeNotify();
		};
	}, [
		sessionId,
		visible,
		paneId,
		tabId,
		signal
	]);
}
function CronSidebarPanel({ scope, visible, t }) {
	const sessionId = scope.sessionId;
	usePanelConsumer(sessionId, visible);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
		className: styles.sidebarPanel,
		"aria-label": t("trigger.aria"),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelContent, {
			t,
			sessionId,
			visible
		})
	});
}
function CronNativePanel({ sessionId, useTabInfo, useSessions, t = fallbackT }) {
	const { panel, tab } = useTabInfo();
	const current = useSessions((sessions) => sessions.current);
	const title = useSessions((sessions) => ownerTitle(sessions, sessionId, "", t("panel.untitled")));
	const aborted = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => {
		tab.signal.addEventListener("abort", listener);
		return () => tab.signal.removeEventListener("abort", listener);
	}, [tab.signal]), () => tab.signal.aborted);
	const visible = tab.visible && sessionId === current && !aborted;
	usePanelConsumer(sessionId, visible, panel.id, tab.id, tab.signal);
	(0, react.useEffect)(() => {
		sessionTitles.set(sessionId, title);
		storeNotify();
	}, [sessionId, title]);
	(0, react.useEffect)(() => {
		const params = tab.navigation.params;
		if (tab.signal.aborted || sessionId !== current) return;
		if (panelConsumers.consumeNavigation(sessionId, tab.id, tab.navigation.revision) && (params?.view === "tasks" || params?.view === "history")) setDrawerTab(params.view, sessionId);
	}, [
		sessionId,
		current,
		tab.id,
		tab.navigation.revision,
		tab.signal
	]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
		className: styles.sidebarPanel,
		"data-cron-native": "",
		"aria-label": t("trigger.aria"),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelContent, {
			t,
			sessionId,
			title,
			visible,
			signal: tab.signal
		})
	});
}
function ResolvedStandalonePanel({ useSessions, ...props }) {
	const title = useSessions((sessions) => ownerTitle(sessions, props.sessionId, "", props.t("panel.untitled")));
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandalonePanel, {
		...props,
		title
	});
}
function CronDrawer({ t, useSessions }) {
	const tr = t ?? fallbackT;
	const { open, sessionId, drawerSessionId: owner, toasts } = useDrawerState();
	useCronWatcher(sessionId);
	const notifications = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
		className: styles.toastStack,
		"aria-live": "polite",
		children: toasts.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToastCard, {
			t: tr,
			item
		}, item.key))
	});
	return (0, react_dom.createPortal)(open && owner ? useSessions ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResolvedStandalonePanel, {
		useSessions,
		t: tr,
		sessionId: owner,
		children: notifications
	}, owner) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StandalonePanel, {
		t: tr,
		sessionId: owner,
		children: notifications
	}, owner) : notifications, document.body);
}
function CronAction({ t, sessionId }) {
	const tr = t ?? fallbackT;
	const state = useDrawerState();
	const { count, unread } = sessionView(sessionId ?? null);
	const open = (sessionId ? panelConsumers.visible(sessionId) : false) || state.open && state.drawerSessionId === sessionId;
	const description = tr("trigger.summary", {
		count,
		unread
	});
	(0, react.useEffect)(() => {
		setActiveSession(sessionId ?? null);
		return () => {
			if (activeSessionId === sessionId) setActiveSession(null);
		};
	}, [sessionId]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		className: `${open ? styles.triggerActive : styles.trigger} ${styles.triggerCompact}`,
		"aria-expanded": open,
		"aria-label": tr("trigger.aria"),
		"aria-description": description,
		title: `${tr("trigger.aria")} — ${description}`,
		disabled: !sessionId,
		onClick: () => {
			if (!sessionId) return;
			if (state.open && state.drawerSessionId === sessionId) setDrawerOpen(false);
			else openDrawer(sessionView(sessionId).tab, sessionId);
		},
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "16",
			height: "16",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "1.7",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			focusable: "false",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "12",
				r: "9"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 7v5l3 2" })]
		}), unread > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: styles.unreadBadge,
			"aria-hidden": "true",
			children: unread > 99 ? "99+" : unread
		}) : null]
	});
}
function SessionCronAction({ useSessions, ...props }) {
	const title = useSessions((sessions) => ownerTitle(sessions, props.sessionId ?? "", "", (props.t ?? fallbackT)("panel.untitled")));
	(0, react.useEffect)(() => {
		if (props.sessionId) {
			sessionTitles.set(props.sessionId, title);
			storeNotify();
		}
	}, [props.sessionId, title]);
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CronAction, { ...props });
}
function CronHeaderAction(props) {
	return props.useSessions ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionCronAction, {
		...props,
		useSessions: props.useSessions
	}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CronAction, { ...props });
}
/** Client plugin body: dictionaries, styles, header trigger, and the drawer. */
function apply(ctx) {
	ctx.effect(() => ctx.locale.register("cron", {
		zh,
		en
	}), "dsh-cron: dictionaries");
	ctx.effect(() => {
		const tag = document.createElement("style");
		tag.dataset.plugin = "dsh-cron";
		tag.textContent = css;
		document.head.append(tag);
		return () => tag.remove();
	}, "dsh-cron: styles");
	registerScheduledSessionsHub(ctx, () => ctx.locale.bind("cron"));
	registerNativeSidebar(ctx, CronNativePanel, () => ctx.locale.bind("cron")("trigger.aria"), (service) => {
		nativeSidebar = service;
		if (!service) panelConsumers.clearNative();
		storeNotify();
	});
	ctx.inject(["betterSidebar"], (inner) => {
		const service = inner.get("betterSidebar");
		if (!supportsSidebar(service)) return;
		inner.effect(() => {
			const tr = ctx.locale.bind("cron");
			let dispose;
			try {
				dispose = service.registerTab({
					id: CRON_TAB_ID,
					title: () => tr("trigger.aria"),
					single: true,
					order: 80,
					createTab: (state) => createSidebarTab(state, tr("trigger.aria"), window.innerWidth),
					component: (props) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CronSidebarPanel, {
						...props,
						t: tr
					})
				});
			} catch (error) {
				console.warn("[dsh-cron] sidebar registration failed; standalone panel remains available", error);
				return;
			}
			sidebar = service;
			storeNotify();
			return () => {
				if (sidebar === service) {
					sidebar = null;
					storeNotify();
				}
				dispose();
			};
		}, "dsh-cron: optional sidebar tab");
	});
	ctx.effect(() => () => {
		sidebar = null;
		nativeSidebar = null;
		panelConsumers.clear();
		sessionTitles.clear();
		drawerOpen = false;
		activeSessionId = drawerSessionId = null;
		sessionViews.clear();
		toasts = [];
		storeNotify();
	}, "dsh-cron: reset client state");
	ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
		name: "conversation.session.header.utilities",
		id: "cron-trigger",
		order: -50,
		locale: "cron",
		inject: (sessionId) => ({ sessionId })
	}, CronHeaderAction));
	ctx.slots.inject("shell.overlay", () => ctx.slots.register({
		name: "shell.overlay",
		id: "cron-drawer",
		order: 100,
		locale: "cron"
	}, CronDrawer));
}

//#endregion
exports.SCHEDULED_SESSIONS_ID = SCHEDULED_SESSIONS_ID;
exports.apply = apply;
exports.diffRecords = diffRecords;
exports.inject = inject;
exports.ownerLabel = ownerLabel;
return module.exports; } });
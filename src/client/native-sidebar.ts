// Optional native Sidebar adapter, inspected at Core 0.1.5-rc.2 (fb2c4b9).
// Owned structural subsets of the public contracts: no new-Core runtime imports.
export const NATIVE_CRON_ID = 'dsh-cron:native-tasks'
export const NATIVE_CRON_KIND = 'dsh-cron:scheduled-tasks'
export type CronView = 'tasks' | 'history'
export interface NativeController {
  openTab(kind: string, options?: { params?: { view: CronView }; revealIfOpened?: boolean; paneId?: string }): void
}
interface NativeRegistry { register(definition: ReturnType<typeof nativeDefinition>): () => void }
export interface SessionList {
  current?: string
  byId: Record<string, { displayTitle?: string; blank?: boolean } | undefined>
}
export type UseSessions = <T>(selector: (sessions: SessionList) => T) => T
export interface NativeBodyProps {
  sessionId: string
  useSessions: UseSessions
  useTabInfo: () => {
    panel: { id: string }
    tab: { id: string; visible: boolean; signal: AbortSignal; navigation: { params?: unknown; revision: number } }
  }
}
export function supportsNativeSidebar(registry: unknown, controller: unknown): boolean {
  return typeof (registry as Partial<NativeRegistry> | undefined)?.register === 'function'
    && typeof (controller as Partial<NativeController> | undefined)?.openTab === 'function'
}
export function nativeDefinition(title: () => string) {
  // No guide capsule: adding one would change native Files first-open into a chooser.
  return { id: NATIVE_CRON_ID, kind: NATIVE_CRON_KIND, title, priority: 'extension' as const }
}
export function ownerTitle(sessions: SessionList, sessionId: string, unavailable: string, blankTitle = unavailable): string {
  const owner = sessions.byId[sessionId]
  const title = owner?.displayTitle?.trim()
  if (owner?.blank) return blankTitle
  return !title || title === sessionId ? unavailable : title
}

interface Consumer { sessionId: string; visible: boolean; paneId?: string; tabId?: string; signal?: AbortSignal }
/** Consumers, not tab kinds, own visibility. A floating duplicate can outlive a docked body. */
export function createPanelConsumers() {
  const consumers = new Set<Consumer>()
  const occurrences = new Map<string, { entry: Consumer; dispose: () => void; revision?: number }>()
  const clearNative = () => {
    for (const occurrence of [...occurrences.values()]) occurrence.dispose()
    for (const entry of consumers) if (entry.signal) consumers.delete(entry)
  }
  return {
    add(consumer: Consumer) {
      const entry = { ...consumer }
      consumers.add(entry)
      const { sessionId, tabId, paneId, signal } = entry
      if (tabId && paneId && signal && !signal.aborted) {
        // DockSurface unmounts inactive bodies. Keep only their owned identity
        // leaves, not visibility, until the real record's lifetime ends.
        const key = `${sessionId}\0${tabId}`
        const previous = occurrences.get(key)
        const revision = previous?.entry.signal === signal ? previous.revision : undefined
        previous?.dispose()
        const dispose = () => { signal.removeEventListener('abort', dispose); occurrences.delete(key) }
        occurrences.set(key, { entry, dispose, revision })
        signal.addEventListener('abort', dispose, { once: true })
      }
      return () => { consumers.delete(entry) }
    },
    visible(sessionId: string) {
      return [...consumers].some(entry => entry.sessionId === sessionId && entry.visible && !entry.signal?.aborted)
    },
    pane(sessionId: string) {
      const entries = [...consumers].filter(entry => entry.sessionId === sessionId && entry.paneId && !entry.signal?.aborted)
      return (entries.find(entry => entry.visible)
        ?? [...occurrences.values()].reverse().find(({ entry }) => entry.sessionId === sessionId && !entry.signal?.aborted)?.entry
        ?? entries[0])?.paneId
    },
    consumeNavigation(sessionId: string, tabId: string, revision: number) {
      const occurrence = occurrences.get(`${sessionId}\0${tabId}`)
      if (!occurrence || occurrence.revision === revision) return false
      occurrence.revision = revision
      return true
    },
    clearNative,
    clear() { clearNative(); consumers.clear() },
  }
}
/** Public openTab operates only on the mounted session; never invent a sessionId option. */
export function openNative(controller: NativeController | null, owner: string, current: string | null, view: CronView, paneId?: string): boolean {
  if (!controller || owner !== current) return false
  controller.openTab(NATIVE_CRON_KIND, { params: { view }, revealIfOpened: true, ...(paneId ? { paneId } : {}) })
  return true
}

/** A visible owner's request lifetime; stopping also cancels in-flight fetches. */
export function createRequestLease(owner: string, currentOwner: () => string | null, signal?: AbortSignal) {
  let generation = 0
  const controller = new AbortController()
  const stop = () => { generation++; controller.abort(); signal?.removeEventListener('abort', stop) }
  if (signal?.aborted) stop()
  else signal?.addEventListener('abort', stop, { once: true })
  const alive = () => !controller.signal.aborted && owner === currentOwner()
  return {
    signal: controller.signal,
    begin: () => ++generation,
    alive,
    accepts: (request: number) => alive() && request === generation,
    stop,
  }
}

// `any` is restricted to the Cordis/Slot wiring boundary: older accepted dev SDKs
// do not declare these optional service and seat names. The runtime face above
// remains structural and uses only inspected public methods.
export function registerNativeSidebar(ctx: any, body: any, title: () => string, ready: (service: NativeController | null) => void) {
  ctx.inject(['sidebarRightTabs', 'sidebarRight'], (inner: any) => {
    const registry = inner.get('sidebarRightTabs') as NativeRegistry
    const controller = inner.get('sidebarRight') as NativeController
    if (!supportsNativeSidebar(registry, controller)) return
    inner.effect(() => inner.slots.inject('sidebar.right.pane.tab', () => {
      let releaseType: (() => void) | undefined
      let releaseBody: (() => void) | undefined
      try {
        releaseType = registry.register(nativeDefinition(title))
        releaseBody = inner.slots.register({ name: 'sidebar.right.pane.tab', key: NATIVE_CRON_ID, locale: 'cron' }, body)
        ready(controller)
      } catch (error) {
        releaseBody?.()
        releaseType?.()
        console.warn('[dsh-cron] native registration failed; fallback remains available', error)
        return
      }
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        ready(null)
        releaseBody?.()
        releaseType?.()
      }
    }), 'dsh-cron: optional native sidebar tab')
  })
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { createReadPoll, ReadTimeoutError } from './read-poll.js'

export const SCHEDULED_SESSIONS_ID = 'dsh-cron:scheduled-sessions'
const HUB_POLL_MS = 20_000

export interface OwnerSummary {
  sessionId: string
  taskCount: number
  enabledCount: number
  nextRunAt: string | null
}

interface SessionProjection {
  displayTitle?: string
  blank?: boolean
  running?: boolean
  projectionValues?: { agentPreset?: string }
}

interface SessionSnapshot {
  byId: Record<string, SessionProjection | undefined>
}

type UseSessions = <T>(selector: (sessions: SessionSnapshot) => T) => T
type T = (key: string, params?: Record<string, unknown>) => string

interface HubProps {
  open?: boolean | string
  t: T
  useSessions: UseSessions
}

interface HubIconProps { size: number; active: boolean }
interface UiWorkspace { openSession: (sessionId: string) => void }

async function readOwners(signal: AbortSignal): Promise<OwnerSummary[]> {
  const response = await fetch('/cron/api/owners', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
  const payload = await response.json().catch(() => null)
  if (!payload?.ok || !Array.isArray(payload.result)) {
    throw new Error(payload?.error?.message ?? `request failed (${response.status})`)
  }
  return payload.result
}

export function ownerLabel(sessionId: string, session: SessionProjection | undefined, blank: string): string {
  const title = session?.displayTitle?.trim()
  if (title && title !== sessionId) return title
  return session?.blank ? blank : sessionId
}

function formatNext(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function ScheduledSessionsIcon({ size, active }: HubIconProps) {
  const edge = Number.isFinite(size) && size > 0 ? size : 18
  return <svg width={edge} height={edge} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" data-cron-hub-active={active ? '' : undefined}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
}

export function ScheduledSessionsPanel({ open = true, t, useSessions, uiWorkspace }: HubProps & { uiWorkspace: UiWorkspace }) {
  const visible = open === true || open === SCHEDULED_SESSIONS_ID
  const sessions = useSessions(snapshot => snapshot.byId)
  const [owners, setOwners] = useState<OwnerSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef<ReturnType<typeof createReadPoll> | null>(null)

  const refresh = useCallback(() => pollRef.current?.run(), [])
  useEffect(() => {
    if (!visible) return
    const reader = createReadPoll({
      alive: () => visible && document.visibilityState !== 'hidden',
      read: readOwners,
      publish: value => { setOwners(value); setLoaded(true); setError('') },
      fail: cause => setError(cause instanceof ReadTimeoutError ? t('hub.timeout') : t('hub.error')),
      started: () => setLoading(true),
      settled: () => setLoading(false),
    })
    pollRef.current = reader
    void reader.run()
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') void reader.run()
    }, HUB_POLL_MS)
    const visibility = () => {
      if (document.visibilityState === 'hidden') reader.cancel()
      else void reader.run()
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      reader.stop()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      if (pollRef.current === reader) pollRef.current = null
    }
  }, [visible, t])

  return <section className="dsh-cron-hub" aria-label={t('hub.title')} aria-busy={loading}>
    <header className="dsh-cron-hubHead">
      <h1>{t('hub.title')}</h1>
      <p>{t('hub.description')}</p>
    </header>
    {error ? <div className="dsh-cron-error" role="alert">
      <span>{error}</span>
      <button type="button" className="dsh-cron-action" disabled={loading} onClick={() => void refresh()}>{t('action.retry')}</button>
    </div> : null}
    {!loaded && loading ? <p className="dsh-cron-empty" role="status">{t('hub.loading')}</p> : null}
    {loaded && !error && owners.length === 0 ? <p className="dsh-cron-empty" role="status">{t('hub.empty')}</p> : null}
    {loaded && owners.length > 0 ? <ul className="dsh-cron-hubList" aria-label={t('hub.list')}>
      {owners.map(owner => {
        const session = sessions[owner.sessionId]
        const title = ownerLabel(owner.sessionId, session, t('hub.blankSession'))
        const available = session !== undefined
        const state = !available ? t('hub.unavailableShort')
          : session.running ? t('hub.running') : session.blank ? t('hub.blank') : ''
        const preset = session?.projectionValues?.agentPreset?.trim() ?? ''
        const next = owner.nextRunAt ? t('hub.next', { time: formatNext(owner.nextRunAt) })
          : owner.enabledCount > 0 ? t('hub.waiting') : t('hub.noEnabled')
        return <li key={owner.sessionId}>
          <button
            type="button"
            className="dsh-cron-hubRow"
            disabled={!available}
            title={available ? undefined : t('hub.unavailable')}
            onClick={() => { if (available) uiWorkspace.openSession(owner.sessionId) }}
          >
            <span className="dsh-cron-hubTitle">{title}</span>
            <span className="dsh-cron-hubBadges">
              {state ? <span className="dsh-cron-badge">{state}</span> : null}
              {preset ? <span className="dsh-cron-badge" title={t('hub.preset', { preset })}>{preset}</span> : null}
            </span>
            <span className="dsh-cron-hubCounts">{t('hub.counts', { tasks: owner.taskCount, enabled: owner.enabledCount })}</span>
            <span className="dsh-cron-hubNext">{next}</span>
          </button>
        </li>
      })}
    </ul> : null}
  </section>
}

function supportsHub(uiWorkspace: unknown, sessions: unknown): uiWorkspace is UiWorkspace {
  return sessions != null && typeof (uiWorkspace as Partial<UiWorkspace> | undefined)?.openSession === 'function'
}

/** Optional global root contribution. Both seats and both services must exist;
 * otherwise current-session Cron surfaces continue unchanged. */
export function registerScheduledSessionsHub(ctx: any, t: () => T) {
  ctx.inject(['uiWorkspace', 'sessions'], (inner: any) => {
    const uiWorkspace = inner.get('uiWorkspace')
    const sessions = inner.get('sessions')
    if (!supportsHub(uiWorkspace, sessions)) return
    inner.effect(() => inner.slots.inject('sidebar.panellist', () => inner.slots.inject('main', () => {
      let releaseIcon: (() => void) | undefined
      let releasePanel: (() => void) | undefined
      try {
        releaseIcon = inner.slots.register({
          name: 'sidebar.panellist', id: SCHEDULED_SESSIONS_ID, order: 70,
          label: () => t()('hub.title'), locale: 'cron',
        }, ScheduledSessionsIcon)
        releasePanel = inner.slots.register({ name: 'main', key: SCHEDULED_SESSIONS_ID, locale: 'cron' },
          (props: HubProps) => <ScheduledSessionsPanel {...props} uiWorkspace={uiWorkspace} />)
      } catch (error) {
        releasePanel?.(); releaseIcon?.()
        console.warn('[dsh-cron] scheduled sessions hub unavailable', error)
        return
      }
      let disposed = false
      return () => {
        if (disposed) return
        disposed = true
        releasePanel?.(); releaseIcon?.()
      }
    })), 'dsh-cron: optional scheduled sessions hub')
  })
}

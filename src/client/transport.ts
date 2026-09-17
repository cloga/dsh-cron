/** Safe preflight selection: only a read-only GET can choose the legacy carrier.
 * Never retry a business POST, even if its response is lost or looks like 404.
 * Only pending discovery is shared; no settled capability/authority is cached,
 * so a Host replacement is rediscovered on the next operation.
 */
export function createCronTransport(fetcher: typeof fetch = (...args) => fetch(...args)) {
  type Probe = { controller: AbortController; promise: Promise<string>; users: number; settled: boolean }
  let pending: Probe | undefined
  let revision = 0

  function reset() {
    revision++
    // Keep a cancelled but non-settling fetch in its slot: no unbounded retries
    // against a backend that ignores cancellation.
    pending?.controller.abort()
  }

  async function select(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted()
    if (!pending) {
      const controller = new AbortController()
      const entry: Probe = { controller, users: 0, settled: false, promise: undefined! }
      pending = entry
      const deadline = setTimeout(() => controller.abort(new Error('transport discovery timed out')), 30_000)
      const clearDeadline = () => clearTimeout(deadline)
      controller.signal.addEventListener('abort', clearDeadline, { once: true })
      entry.promise = (async () => {
        const response = await fetcher('/api/cron/capabilities', {
          method: 'GET', signal: controller.signal, cache: 'no-store', redirect: 'error',
        })
        controller.signal.throwIfAborted()
        if (response.status === 404 || response.status === 405) return '/cron/api'
        if (!response.ok) throw new Error(`transport discovery failed (${response.status})`)
        const data = await response.json()
        controller.signal.throwIfAborted()
        if (data?.ok !== true || data.result?.transport !== 'connection-fetch' || data.result?.version !== 1) {
          throw new Error('invalid cron transport capability')
        }
        return '/api/cron'
      })().finally(() => {
        clearDeadline()
        controller.signal.removeEventListener('abort', clearDeadline)
        entry.settled = true
        if (pending === entry) pending = undefined
      })
    }
    const entry = pending
    if (entry.controller.signal.aborted) throw new Error('transport cancellation pending; retry later')
    entry.users++
    let detach = () => {}
    try {
      return await new Promise<string>((resolve, reject) => {
        const cancel = () => reject(signal?.reason ?? new Error('request cancelled'))
        const resetAbort = () => reject(entry.controller.signal.reason)
        signal?.addEventListener('abort', cancel, { once: true })
        entry.controller.signal.addEventListener('abort', resetAbort, { once: true })
        detach = () => {
          signal?.removeEventListener('abort', cancel)
          entry.controller.signal.removeEventListener('abort', resetAbort)
        }
        entry.promise.then(resolve, reject)
      })
    } finally {
      detach()
      entry.users--
      if (!entry.users && !entry.settled) entry.controller.abort()
    }
  }

  async function request<T>(method: string, payload?: unknown, signal?: AbortSignal): Promise<T> {
    if (!/^[a-z]+$/.test(method)) throw new Error('invalid cron API method')
    const current = revision
    const base = await select(signal)
    signal?.throwIfAborted()
    if (current !== revision) throw new Error('cron transport changed')
    const response = await fetcher(`${base}/${method}`, {
      method: 'POST', signal, redirect: 'error', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload ?? {}),
    })
    const data = await response.json().catch(() => null)
    signal?.throwIfAborted()
    if (!response.ok || data?.ok !== true) throw new Error(data?.error?.message ?? `request failed (${response.status})`)
    return data.result as T
  }
  return { request, reset }
}

export const cronTransport = createCronTransport()

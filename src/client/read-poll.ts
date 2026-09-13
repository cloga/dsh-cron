// Reads only: mutations must never be replayed by a polling/retry lifecycle.
export const READ_DEADLINE_MS = 30_000

export class ReadTimeoutError extends Error {
  constructor() {
    super('Request timed out')
    this.name = 'ReadTimeoutError'
  }
}

interface ReadPollOptions<T> {
  signal?: AbortSignal
  alive: () => boolean
  read: (signal: AbortSignal) => Promise<T>
  publish: (value: T) => void
  fail: (error: unknown) => void
  started?: () => void
  settled?: () => void
}

/** One cancellable batch per lifetime. Race the whole read (including JSON/body
 * parsing) against abort, even if a transport ignores its signal. */
export function createReadPoll<T>(options: ReadPollOptions<T>) {
  let stopped = false
  let flight: { controller: AbortController; completion: Promise<void> } | undefined
  const alive = () => !stopped && !options.signal?.aborted && options.alive()
  const cancel = () => flight?.controller.abort()
  const stop = () => {
    stopped = true
    cancel()
    options.signal?.removeEventListener('abort', stop)
  }
  if (options.signal?.aborted) stop()
  else options.signal?.addEventListener('abort', stop, { once: true })

  const run = (): Promise<void> => {
    if (!alive()) return Promise.resolve()
    if (flight && !flight.controller.signal.aborted) return flight.completion
    const controller = new AbortController()
    let timedOut = false
    let onAbort: () => void
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(new Error('Read cancelled'))
      controller.signal.addEventListener('abort', onAbort, { once: true })
    })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, READ_DEADLINE_MS)
    const current = { controller, completion: Promise.resolve() }
    flight = current
    options.started?.()
    current.completion = Promise.race([
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error('Read cancelled')
        return options.read(controller.signal)
      }),
      cancelled,
    ]).then(value => {
      if (flight === current && alive() && !controller.signal.aborted) options.publish(value)
    }).catch(error => {
      if (flight === current && alive() && (timedOut || !controller.signal.aborted)) {
        options.fail(timedOut ? new ReadTimeoutError() : error)
      }
    }).finally(() => {
      clearTimeout(timer)
      controller.signal.removeEventListener('abort', onAbort)
      // A rejected half of Promise.all must cancel its still-pending sibling.
      controller.abort()
      if (flight === current) {
        flight = undefined
        if (alive()) options.settled?.()
      }
    })
    return current.completion
  }
  return { run, cancel, stop }
}

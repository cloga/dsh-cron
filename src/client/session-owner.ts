// Public Session list projection: alpha.2 replaces global `current` with retain counts.
export interface OwnerList {
  current?: string
  byId: Record<string, { retainedBy?: { mainView?: number } } | undefined>
}
export function mainSessionOwner(list: OwnerList): string | null {
  const rows = Object.entries(list.byId)
  if (rows.some(([, row]) => row?.retainedBy !== undefined)) {
    const owners = rows.filter(([, row]) => (row?.retainedBy?.mainView ?? 0) > 0).map(([id]) => id)
    return owners.length === 1 ? owners[0]! : null
  }
  return typeof list.current === 'string' && list.current.length > 0 ? list.current : null
}

/** Header occurrences are leases, not a last-mounted global current Session. */
export function createHeaderOwners(changed: (owner: string | null) => void) {
  const entries = new Map<symbol, { owner: string; main: string | null | undefined }>()
  const publish = () => {
    const values = [...entries.values()]
    const explicit = values.filter(value => value.main !== undefined)
    // A null authoritative projection is meaningful (no main or ambiguous main).
    const candidates = explicit.length ? explicit.map(value => value.main) : values.map(value => value.owner)
    const unique = new Set(candidates)
    changed(unique.size === 1 ? [...unique][0] ?? null : null)
  }
  return {
    mount(owner: string, main?: string | null) {
      const key = Symbol('cron-header')
      entries.set(key, { owner, main })
      publish()
      return () => { if (entries.delete(key)) publish() }
    },
    clear() { entries.clear(); publish() },
  }
}

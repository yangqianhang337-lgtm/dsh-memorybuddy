/**
 * One-mount-per-Host guard, shared across the web plugin family.
 *
 * The Loader can mount the same package more than once (a reload, a second
 * profile layer, a bundle listed twice). The Host's service registry tolerates
 * that; a `webServer` route table does not — the second registration throws
 * `duplicate route` and the plugin disappears until a Host restart. The symbol
 * is the cross-repository contract: every plugin in this family agrees on the
 * same `globalThis` key, so two plugins cannot both claim a mount.
 *
 * A refused mount is QUEUED rather than dropped: when the holder disposes, the
 * waiter runs. Dropping it was the original bug — the plugin stayed gone for
 * the rest of the Host's life, and only a restart brought it back.
 */

/** The `globalThis` key holding the set of mounted package names. */
const MOUNTED = Symbol.for('dsh-web.mounted-plugins')
/** The `globalThis` key holding the queue of refused mounts. */
const WAITERS = Symbol.for('dsh-web.mounted-plugins.waiters')

/** One queued mount. */
interface Waiter {
  run: () => void
}

/** Read the shared mount set, replacing a foreign value with a fresh one. */
function mountedSet(): Set<string> {
  const scope = globalThis as Record<symbol, unknown>
  const existing = scope[MOUNTED]
  if (existing instanceof Set) return existing as Set<string>
  const created = new Set<string>()
  scope[MOUNTED] = created
  return created
}

/** Read the shared waiter queue. */
function waiterQueue(): Waiter[] {
  const scope = globalThis as Record<symbol, unknown>
  const existing = scope[WAITERS]
  if (Array.isArray(existing)) return existing as Waiter[]
  const created: Waiter[] = []
  scope[WAITERS] = created
  return created
}

/**
 * Wrap `fn` so only the first mount of `packageName` runs it.
 *
 * The returned function keeps the wrapped signature, so it can be exported
 * directly as a Cordis `apply`.
 */
export function mountOnce<T extends (...args: never[]) => unknown>(packageName: string, fn: T): T {
  const mounted = mountedSet()
  const queue = waiterQueue()
  return function guarded(this: unknown, ...args: never[]): unknown {
    const ctx = args[0] as { effect?: (callback: () => unknown, label?: string) => unknown } | undefined
    const mount = (): unknown => {
      mounted.add(packageName)
      let dispose: unknown
      try {
        dispose = fn.apply(this, args)
      } catch (error) {
        mounted.delete(packageName)
        throw error
      }
      if (typeof dispose !== 'function') return dispose
      return () => {
        try {
          ;(dispose as () => void)()
        } finally {
          mounted.delete(packageName)
          // Hand the seat to whoever was refused while this mount held it.
          for (const waiter of queue.splice(0)) {
            queueMicrotask(() => {
              waiter.run()
            })
          }
        }
      }
    }
    if (!mounted.has(packageName)) return mount()

    // Refused: stay parked until the holder disposes. A fiber that dies while
    // parked must not leave a zombie behind.
    let alive = true
    const pending: Waiter = {
      run: () => {
        if (alive) mount()
      },
    }
    queue.push(pending)
    try {
      ctx?.effect?.(() => () => {
        alive = false
        const index = queue.indexOf(pending)
        if (index >= 0) queue.splice(index, 1)
      }, `${packageName}: mount waiter`)
    } catch {
      // No effect registry (a bare context in a test): the waiter simply stays.
    }
    return undefined
  } as unknown as T
}

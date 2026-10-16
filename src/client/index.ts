/**
 * Browser-half entry: mount the first-level panel and the two settings pages.
 *
 * Failure policy (memory-plan §8.2): DOM and slot problems are logged, never
 * thrown. The web shell fails the whole boot when a plugin's `apply` throws, and
 * an external plugin must not take the GUI down — so the body is wrapped in one
 * try/catch and the only visible symptom of a half-broken mount is a missing
 * sidebar entry.
 *
 * `inject` lists only the two services whose absence would make this half
 * meaningless: `slots` (there is nothing to draw into without it) and `locale`
 * (the translator). Both are declared by `@deepseek-ai/dsh-web-app`, which is
 * part of the base profile, so the wait resolves on every supported host. The
 * memory data itself comes from the plugin's own HTTP route, not from a service,
 * which keeps the browser half free of host coupling.
 *
 * Slot registrations go through `ctx.slots.inject` rather than a bare
 * `register`, because a registration depends on the seat already being declared:
 * `inject` waits for the declaration and re-registers when it moves, so the
 * panel appears no matter whether this plugin activates before or after
 * ui-layout, and a host that never declares the seats leaves the entry absent
 * instead of failing boot.
 */

import { DICTIONARIES, NS } from './locales.ts'
import { MemoryController, useMemoryView, type MemoryFace } from './service.ts'
import { registerMemoryBuddyPanel } from './panel.tsx'
import { registerSettingsSections } from './sections.tsx'
import { installPanelStyles } from './styles.ts'
import { setActiveLocale, setRuntimeTranslate } from './t.ts'
import type { JournalView } from '../protocol.ts'

/** Required services: slot registration plus the translator. */
export const inject = ['slots', 'locale']

/** The client context surface this half touches; everything else is optional. */
interface ClientLike {
  effect?: (callback: () => void | (() => void), label?: string) => unknown
  on?: (event: string, listener: (...args: never[]) => void) => unknown
  get?: (name: string) => unknown
  slots: unknown
  locale?: {
    register(namespace: string, dictionaries: Record<string, unknown>): void
    bind(namespace: string): (key: string, params?: Record<string, string>) => string
    getSnapshot?: () => { active?: unknown }
  }
}

/** First application wins: a second factory run in one page must not double-mount. */
const PAGE_FLAG = '__dshMemoryBuddyMounted'

/**
 * Mount the browser half.
 * @param ctx - the client root context (services: slots, locale).
 */
export function apply(ctx: ClientLike): void {
  try {
    applyInner(ctx)
  } catch (error) {
    // Never rethrow: the shell treats a throwing plugin apply as a boot failure.
    console.error('memorybuddy: 面板挂载失败，插件已跳过：', error)
  }
}

/** The real body, split out so the guard above stays a single statement. */
function applyInner(ctx: ClientLike): void {
  const page = globalThis as unknown as Record<string, unknown>
  if (page[PAGE_FLAG] === true) return
  page[PAGE_FLAG] = true

  const effect = (callback: () => void | (() => void), label: string): void => {
    try {
      ctx.effect?.(callback, label)
    } catch (error) {
      console.error(`memorybuddy: ctx.effect(${label}) 失败：`, error)
    }
  }

  // The page-lifetime claim has to be released when this fiber unloads, or a
  // rebuilt bundle would be dropped for the rest of the page's life.
  effect(() => () => {
    page[PAGE_FLAG] = false
  }, 'memorybuddy: mount claim')

  // One stylesheet per module, injected once per page (see styles.ts).
  installPanelStyles()

  // Dictionaries first, then the translator: the shell's own `t` is bound to the
  // namespace, so a missing key falls through to the package dictionary rather
  // than showing the raw key. Wrapped in its own effect because `locale.register`
  // throws when the namespace is registered twice (a hot reload, or a host that
  // already loaded an older copy of this bundle).
  effect(() => {
    const locale = ctx.locale
    if (locale === undefined) return () => {}
    let dispose: (() => void) | undefined
    try {
      const handle = locale.register(NS, DICTIONARIES)
      if (typeof handle === 'function') dispose = handle as () => void
    } catch {
      // Already registered by a previous mount: the existing table stays, which
      // is exactly what a hot reload wants.
    }
    try {
      setRuntimeTranslate(locale.bind(NS))
    } catch {
      // No bind face: the module-level dictionary is the fallback.
    }
    const sync = (): void => {
      try {
        const active = locale.getSnapshot?.().active
        if (typeof active === 'string') setActiveLocale(active)
      } catch {
        // A locale snapshot that cannot be read leaves the last language in place.
      }
    }
    sync()
    const off = ctx.on?.('locale/change', sync as (...args: never[]) => void)
    return () => {
      dispose?.()
      setRuntimeTranslate(undefined)
      if (typeof off === 'function') (off as () => void)()
    }
  }, 'memorybuddy: dictionaries')

  // The shared controller: the panel and both settings pages render this one
  // value, so a save made in either drop is already visible in the other.
  const controller = new MemoryController()
  effect(() => {
    void controller.load()
    return () => controller.dispose()
  }, 'memorybuddy: controller')

  const face: MemoryFace = {
    useView: () => useMemoryView(controller),
    onPatch: (patch: Record<string, unknown>): void => {
      void controller.patch(patch)
    },
    onSaveDocument: (path: string, text: string, revision: string): Promise<boolean> =>
      controller.save(path, text, revision).then(outcome => outcome === 'saved'),
    onAction: (action: Record<string, unknown>): Promise<boolean> => controller.act(action),
    onConsolidate: () => controller.consolidate(),
    onJournal: (date: string) => controller.journal(date),
    onCatalog: () => controller.catalog(),
  }

  registerMemoryBuddyPanel(ctx as unknown as { slots: unknown }, face)
  registerSettingsSections(ctx as unknown as { slots: unknown }, face)
}

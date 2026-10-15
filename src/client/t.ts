/**
 * The module-level translator every client component shares.
 *
 * The slots kit only hands a `t` prop to a registration that declares a
 * `locale` namespace, and declaring one makes the kit throw
 * `SlotAssemblyError` when the locale face is absent from the composition. The
 * first-level panel cannot afford that coupling, so it follows the task board's
 * proven shape instead: the module keeps one translator, the entry point
 * retargets it whenever the active language changes, and every card reads
 * through the stable `t` export.
 *
 * Resolution order at call time: a runtime translator pushed by the shell
 * locale service, else this package's own dictionary for the active language,
 * else `zh`, else the key itself.
 */

import { DICTIONARIES, translate } from './locales.ts'

/** Runtime translator supplied by the shell's locale service, when present. */
let runtime: ((key: string, params?: Record<string, string>) => string) | undefined

/** Active language tag resolved at the last locale change. */
let active = 'zh'

/** Retarget the fallback language (called from the locale subscription). */
export function setActiveLocale(locale: string): void {
  active = typeof locale === 'string' && locale !== '' ? locale : 'zh'
}

/** Install a shell-provided translator; `undefined` restores the local table. */
export function setRuntimeTranslate(
  next: ((key: string, params?: Record<string, string>) => string) | undefined,
): void {
  runtime = next
}

/**
 * Translate a message key.
 * @param key - dictionary key.
 * @param params - optional `{name}` template values.
 * @returns the localized string, never empty.
 */
export function t(key: string, params?: Record<string, string>): string {
  if (runtime !== undefined) {
    try {
      return runtime(key, params)
    } catch {
      // A misbehaving shell translator must not blank out the panel.
    }
  }
  return translate(DICTIONARIES, active, key, params)
}

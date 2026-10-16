/**
 * The two native settings pages (memory-plan §2.1 landing B).
 *
 * The Settings dialog declares `settings.section` as a plain list seat, so a
 * page registered here gets the shell's own nav row, its scrolling options
 * column and its `close` owner prop — which is why these pages render cards
 * only, with no nav column, no search box and no scroller of their own. They
 * reuse the exact components the first-level panel uses, so a change to a card
 * lands in both drops at once.
 *
 * The nav glyph is the shell's, not ours: a `settings.section` registration
 * cannot pass an icon, and the shell's `navIcon(id)` maps only its own built-in
 * ids, falling back to the settings gear for anything else. That is the ~60%
 * fidelity the plan accepted for this landing.
 */

import * as React from 'react'
import { MemoryPage } from './memory.tsx'
import { PersonalizePage } from './personalize.tsx'
import { t } from './t.ts'
import type { MemoryFace } from './service.ts'
import { panelCss as css } from './styles.ts'

/**
 * Props every settings page receives: our injected face plus whatever the shell
 * merges in on top (it always supplies `close` as an owner prop).
 */
export interface SettingsSectionProps {
  face: MemoryFace
  /** Supplied by the shell as an owner prop; unused here but part of the seat. */
  close?: () => void
}

/** `setting.section` id for 个性化; must stay stable across releases. */
export const PERSONALIZE_SECTION_ID = 'memorybuddy-personalize'
/** `setting.section` id for 记忆与进化. */
export const MEMORY_SECTION_ID = 'memorybuddy-memory'

/**
 * 个性化 as a native settings page.
 *
 * The page reuses `PersonalizePage` verbatim — one component, two drops — but
 * renders NO heading: the reference screenshot draws the first card directly at
 * the top of the options column, and the Settings nav row above already names
 * the page. The search box has no seat here either, so the query stays empty.
 */
export function PersonalizeSettingsSection(props: SettingsSectionProps): React.ReactElement {
  const { face } = props
  const view = face.useView()
  return (
    <div className={css.section}>
      <PersonalizePage
        t={t}
        snapshot={view.snapshot}
        loading={view.loading}
        busy={view.busy}
        query=""
        onPatch={face.onPatch}
        onSaveDocument={face.onSaveDocument}
      />
    </div>
  )
}

/**
 * 记忆与进化 as a native settings page.
 *
 * Same component as the panel drop, with `bare` set: the shell supplies the
 * options column's padding and scrolling, and the page omits its own heading
 * and its 复制路径 button so the page ends exactly as the reference does — on the
 * single centred privacy line. The panel keeps that button because that drop is
 * ours to shape (memory-plan §2.4).
 */
export function MemorySettingsSection(props: SettingsSectionProps): React.ReactElement {
  const { face } = props
  const view = face.useView()
  return (
    <MemoryPage
      t={t}
      snapshot={view.snapshot}
      loading={view.loading}
      busy={view.busy}
      query=""
      onPatch={face.onPatch}
      onSaveDocument={face.onSaveDocument}
      onAction={face.onAction}
      onConsolidate={face.onConsolidate}
      onJournal={face.onJournal}
      onDraft={face.onDraft}
      onCatalog={face.onCatalog}
      heading={false}
      bare
    />
  )
}

/**
 * Register both native settings pages.
 *
 * `settings.section` is a plain list seat declared by the Settings dialog, so a
 * registration here only supplies the nav row metadata and the component; the
 * shell owns the icon, the highlight and the scrolling. `order` ascending puts
 * 个性化 before 记忆与进化 (the shell's own General section is 0, Plugins 15).
 *
 * No `locale` namespace is declared: doing so would make the slots kit throw
 * `SlotAssemblyError` when no locale face is installed for this entry, and the
 * module-level translator already follows the active language.
 */
export function registerSettingsSections(
  ctx: { slots: unknown },
  face: MemoryFace,
): () => void {
  const slots = ctx.slots as {
    inject(key: string, callback: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  const disposers: Array<() => void> = []

  const register = (id: string, order: number, label: string, component: unknown): void => {
    disposers.push(
      slots.inject('settings.section', () => {
        const off = slots.register(
          { name: 'settings.section', id, order, label: () => t(label), inject: () => ({ face }) },
          component,
        )
        // `register` may hand back no disposer on a host that models the seat
        // differently; the inject callback still has to return one.
        return typeof off === 'function' ? (off as () => void) : () => {}
      }),
    )
  }

  register(PERSONALIZE_SECTION_ID, 30, 'nav.personalize', PersonalizeSettingsSection)
  register(MEMORY_SECTION_ID, 31, 'nav.memory', MemorySettingsSection)

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}

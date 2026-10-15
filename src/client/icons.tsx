/**
 * Glyphs owned by this plugin.
 *
 * The sidebar row is drawn by the shell, which owns the button, the label, the
 * tooltip and the rail geometry — a panel contributes only the glyph. The L2
 * skin contract finds which row belongs to which plugin through
 * `data-dsh-panel-entry`, because the shell stamps no per-entry hook of its own;
 * that attribute is therefore load-bearing, not decoration.
 *
 * The two navigation glyphs are the official primitives (memory-plan §2.2 fixes
 * them): `IconPersonalizationOutlineMedium` for 个性化 and
 * `IconLightOutlineMedium` for 记忆与进化.
 */

import * as React from 'react'

/** Panel id; also the key the layout's `main` slot is registered under. */
export const PANEL_ID = 'memorybuddy'

/**
 * The sidebar row glyph: a memory card with a sparkle, drawn on the same 16px
 * artboard and 1.3px stroke as the shell's own icons so the rail stays even.
 */
export function MemoryBuddyPanelIcon({ size }: { size: number; active: boolean }): React.ReactElement {
  return (
    <svg
      data-dsh-panel-entry={PANEL_ID}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.2" y="2.2" width="11.6" height="11.6" rx="3.2" />
      <path d="M8 5.1l.95 1.95L10.9 8l-1.95.95L8 10.9l-.95-1.95L5.1 8l1.95-.95z" />
    </svg>
  )
}

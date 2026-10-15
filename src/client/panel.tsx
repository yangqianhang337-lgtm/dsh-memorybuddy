/**
 * The first-level sidebar panel (memory-plan §2.1 landing A).
 *
 * The shell owns the sidebar row, its label, its tooltip, the active highlight
 * and the collapsed rail; this module owns everything to the right of the rail:
 * the 188px nav column with the search box and the two rows, and the scrolling
 * card column. Both registrations go through `ctx.slots.inject`, which fires
 * only once the owning shell entry has declared the seat, so load order between
 * this plugin and ui-layout / ui-sidebar does not matter and a shell that cannot
 * serve the seats leaves the panel absent instead of failing boot.
 *
 * The two nav rows are the plan's deliberate reduction: the screenshots show
 * twelve items in three groups, and only 个性化 and 记忆与进化 are built.
 */

import * as React from 'react'
import type { ReactNode } from 'react'
import {
  IconLightOutlineMedium,
  IconPersonalizationOutlineMedium,
  IconSearchOutlineMedium,
  Input,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { MemoryPage } from './memory.tsx'
import { PersonalizePage } from './personalize.tsx'
import { PANEL_ID, WorkBuddyPanelIcon } from './icons.tsx'
import { t } from './t.ts'
import { cx, panelCss as css } from './styles.ts'
import type { MemoryFace } from './service.ts'

/** The two pages the panel serves. */
type View = 'personalize' | 'memory'


/** Row order among the shell's global panel rows (Plugins 0, Schedule 10, board 20). */
const PANEL_ORDER = 30

/**
 * The main-slot page.
 *
 * The wrapper carries the pinned semantic anchors (`data-dsh-plugin="workbuddy"`
 * and `data-dsh-workbuddy-view`) that skins and automation resolve the panel
 * through, the same practice the task board follows.
 */
export function WorkBuddyPanel({ face }: { face: MemoryFace }): ReactNode {
  const view = face.useView()
  const snapshot = view.snapshot
  const [page, setPage] = React.useState<View>('personalize')
  const [query, setQuery] = React.useState('')
  const hasDrafts = (snapshot?.drafts.length ?? 0) > 0

  const rows: Array<{ id: View; label: string; icon: ReactNode }> = [
    {
      id: 'personalize',
      label: t('nav.personalize'),
      icon: <IconPersonalizationOutlineMedium size={16} className={css.navIcon} />,
    },
    {
      id: 'memory',
      label: t('nav.memory'),
      icon: <IconLightOutlineMedium size={16} className={css.navIcon} />,
    },
  ]

  return (
    <div className={css.root} data-dsh-plugin="workbuddy" data-dsh-workbuddy-view={page}>
      <nav className={css.nav}>
        <Input
          className={css.search}
          icon={<IconSearchOutlineMedium size={14} />}
          value={query}
          placeholder={t('nav.search')}
          aria-label={t('nav.search')}
          onChange={event => setQuery(event.currentTarget.value)}
        />
        <div className={css.navList}>
          {rows.map(row => (
            <button
              key={row.id}
              type="button"
              className={cx(css.navCell, page === row.id && css.navCellActive)}
              aria-current={page === row.id ? 'page' : undefined}
              onClick={() => setPage(row.id)}
            >
              {row.icon}
              <span className={css.navLabel}>{row.label}</span>
              {row.id === 'memory' && hasDrafts && <span className={css.dot} aria-hidden="true" />}
            </button>
          ))}
        </div>
      </nav>

      {page === 'personalize' ? (
        /* The memory page carries its own scrolling column; the personalize
           page is a bare card list, so the panel supplies the column here. */
        <div className={css.content}>
          <PersonalizePage
            t={t}
            snapshot={snapshot}
            loading={view.loading}
            busy={view.busy}
            query={query}
            onPatch={face.onPatch}
            onSaveDocument={face.onSaveDocument}
          />
        </div>
      ) : (
        <MemoryPage
          t={t}
          snapshot={snapshot}
          loading={view.loading}
          busy={view.busy}
          query={query}
          onPatch={face.onPatch}
          onSaveDocument={face.onSaveDocument}
          onAction={face.onAction}
        />
      )}
    </div>
  )
}

/** The sidebar row glyph the shell asks for at its own size and active state. */
export { WorkBuddyPanelIcon }

/** Register the panel's sidebar row and center-column page. */
export function registerWorkBuddyPanel(
  ctx: { slots: unknown },
  face: MemoryFace,
): () => void {
  const slots = ctx.slots as {
    inject(key: string, callback: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  const disposers: Array<() => void> = []

  disposers.push(
    slots.inject('sidebar.panellist', () =>
      slots.register(
        {
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: PANEL_ORDER,
          // The shell resolves this through resolveSlotLabel on every locale
          // change, so the module-level translate reads the active language at
          // call time.
          label: () => t('entry.label'),
        },
        WorkBuddyPanelIcon,
      ),
    ),
  )

  disposers.push(
    slots.inject('main', () =>
      slots.register(
        {
          name: 'main',
          key: PANEL_ID,
          inject: (): { face: MemoryFace } => ({ face }),
        },
        WorkBuddyPanel as never,
      ),
    ),
  )

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}

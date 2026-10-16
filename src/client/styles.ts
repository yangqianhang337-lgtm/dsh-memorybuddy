/**
 * Styles for the panel and its cards.
 *
 * Shipped the way the shell ships its own CSS modules (DSH-UI-REFERENCE §4.4):
 * one minified `<style>` tag per module, guarded by a `data-plugin-css` query so
 * a hot rebuild or a remount cannot append a second copy, with class names
 * emitted as a plain object map. A real `.module.css` file would need a bundler
 * plugin to reach this shape; writing the map directly keeps the build one step
 * and keeps the styles inspectable in the shipped file.
 *
 * Geometry is copied from the official `SettingsRoot.module.css` where the plan
 * requires a 1:1 left column (nav 188px / cell 40px / radius-md / the two nav
 * tokens). Everything generic uses `--dsw-alias-*`; `--dsw-static-*` is never
 * touched, so both themes work without a second stylesheet.
 */

const PACKAGE_NAME = 'dsh-memorybuddy'

/**
 * Inject one stylesheet once per document.
 *
 * The guard is on the exact `data-plugin-css` value rather than on the plugin
 * name, because one plugin legitimately ships several modules and each needs its
 * own tag: reusing a tag would drop whichever module got injected second.
 */
export function injectStyle(tagId: string, css: string): void {
  if (typeof document === 'undefined') return
  const selector = `style[data-plugin-css=${JSON.stringify(tagId)}]`
  if (document.querySelector(selector) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = PACKAGE_NAME
  tag.dataset.pluginCss = tagId
  tag.textContent = css
  document.head.appendChild(tag)
}

const PANEL_CSS = [
  /* Root: the panel owns the full center column; the shell already scrolled. */
  '.mbRoot{box-sizing:border-box;display:flex;flex:1;min-height:0;min-width:0;flex-direction:row;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px;line-height:22px}',
  /* Left nav: identical geometry to the Settings dialog's own nav column. */
  '.mbNav{box-sizing:border-box;flex:none;display:flex;flex-direction:column;gap:18px;width:188px;padding:22px 12px 0}',
  '.mbSearch{box-sizing:border-box;width:100%}',
  '.mbSearch input{width:100%}',
  '.mbNavList{display:flex;flex-direction:column;gap:4px;overflow-y:auto}',
  '.mbNavCell{box-sizing:border-box;display:flex;align-items:center;gap:8px;height:40px;padding:9px 16px 9px 12px;border:none;border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;font-weight:400;line-height:22px;text-align:left;cursor:pointer}',
  '.mbNavCell:hover{background:var(--dsw-specific-sidebar-nav-item-hover)}',
  '.mbNavCell:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary);outline-offset:-1px}',
  '.mbNavCellActive{background:var(--dsw-specific-sidebar-nav-item-active)}',
  '.mbNavIcon{flex:none}',
  '.mbNavLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  /* Red dot for pending skill drafts (memory-plan §6.2). */
  '.mbDot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}',
  /* Right content column: 24px side padding, no inner scroller of its own. */
  '.mbContent{box-sizing:border-box;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;padding:22px 24px 24px;overflow-y:auto}',
  '.mbTitle{font-size:16px;font-weight:500;line-height:24px}',
  '.mbSubtitle{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:4px}',
  /* A settings.section page: the shell already supplies the 24px options
     padding and the scrolling, so this is only the card stack. */
  '.mbSection{display:flex;flex-direction:column;gap:12px;min-width:0}',

  /* One card per setting group. */
  '.mbCard{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l2));border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}',
  '.mbCardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
  '.mbCardText{min-width:0;flex:1}',
  '.mbCardTitle{font-size:14px;line-height:20px}',
  '.mbCardDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px}',
  '.mbCardActions{display:flex;flex:none;align-items:center;gap:4px}',
  '.mbRow{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0}',
  '.mbRow + .mbRow{padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}',

  /* The markdown body view: the shell scrolls the page, so this is only a cap. */
  '.mbProse{box-sizing:border-box;max-height:420px;overflow-y:auto;padding:2px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}',
  '.mbProseEmpty{color:var(--dsw-alias-label-tertiary);font-size:13px}',
  /* No Textarea primitive exists, so the editor is a styled <textarea>. */
  '.mbEditor{box-sizing:border-box;width:100%;min-height:96px;max-height:420px;resize:vertical;padding:8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:13px;line-height:20px;outline:none}',
  '.mbEditor:focus{border-color:var(--dsw-alias-state-business-primary)}',
  '.mbEditorTall{min-height:180px}',
  '.mbEditor::placeholder{color:var(--dsw-alias-label-dimmed)}',

  /* Entry list on the memory page (search results highlight the match). */
  '.mbEntries{display:flex;flex-direction:column;gap:8px}',
  '.mbEntry{display:flex;align-items:flex-start;gap:8px;padding:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}',
  '.mbEntryBody{flex:1;min-width:0}',
  '.mbEntryText{font-size:13px;line-height:20px;word-break:break-word}',
  '.mbEntryMeta{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.mbEntryActions{display:flex;flex:none;gap:2px}',
  '.mbMark{background:var(--dsw-alias-state-warn-label,var(--dsw-alias-interactive-bg-active));border-radius:2px}',
  '.mbConflict{color:var(--dsw-alias-state-warn-primary)}',

  /* Pending-approval banner and cards. */
  '.mbBanner{box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:10px 12px;border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-size:13px;line-height:20px}',
  '.mbDraft{display:flex;flex-direction:column;gap:6px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}',
  '.mbDraftBody{max-height:180px;overflow-y:auto;font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}',
  /* A journal day's log: same monospace body, taller, since a busy day is long. */
  '.mbJournalBody{max-height:280px;overflow-y:auto;padding:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}',

  '.mbFooter{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',

  /* The model picker card (§4.4): a select-shaped menu plus its live verdict. */
  '.mbPick{display:flex;flex-direction:column;gap:8px}',
  '.mbPickRow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.mbPickValue{color:var(--dsw-alias-label-secondary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;word-break:break-all}',
  '.mbPickOk{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}',
  '.mbPickBad{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}',
  '.mbPickWarn{color:var(--dsw-alias-state-warn-primary);font-size:12px;line-height:18px}',
  /* `off` greys the whole card: the switch above it is the thing to change. */
  '.mbPickOff{opacity:.55;pointer-events:none}',
  '.mbFooterCenter{display:block;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.mbFooterLink{padding:0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}',
  '.mbFooterLink:hover{color:var(--dsw-alias-label-secondary)}',
  '.mbFooterLinks{display:flex;align-items:center;gap:8px}',
  /*
    The reference draws 重置 as an outlined button whose LABEL is red. There is
    no danger Button variant in the primitives, so the tint is a wrapper class
    that recolours the label through currentColor.
  */
  '.mbDanger{color:var(--dsw-alias-state-error-primary)}',
  '.mbNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.mbError{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}',
  '.mbLoading{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}',
  '.mbHidden{display:none}',
].join('\n')

const PANEL_TAG = `${PACKAGE_NAME}/panel.module.css`

export const panelCss = {
  root: 'mbRoot',
  nav: 'mbNav',
  search: 'mbSearch',
  navList: 'mbNavList',
  navCell: 'mbNavCell',
  navCellActive: 'mbNavCellActive',
  navIcon: 'mbNavIcon',
  navLabel: 'mbNavLabel',
  dot: 'mbDot',
  content: 'mbContent',
  section: 'mbSection',
  title: 'mbTitle',
  subtitle: 'mbSubtitle',
  card: 'mbCard',
  cardHead: 'mbCardHead',
  cardText: 'mbCardText',
  cardTitle: 'mbCardTitle',
  cardDesc: 'mbCardDesc',
  cardActions: 'mbCardActions',
  row: 'mbRow',
  prose: 'mbProse',
  proseEmpty: 'mbProseEmpty',
  editor: 'mbEditor',
  editorTall: 'mbEditorTall',
  entries: 'mbEntries',
  entry: 'mbEntry',
  entryBody: 'mbEntryBody',
  entryText: 'mbEntryText',
  entryMeta: 'mbEntryMeta',
  entryActions: 'mbEntryActions',
  mark: 'mbMark',
  conflict: 'mbConflict',
  banner: 'mbBanner',
  draft: 'mbDraft',
  draftBody: 'mbDraftBody',
  journalBody: 'mbJournalBody',
  pick: 'mbPick',
  pickRow: 'mbPickRow',
  pickValue: 'mbPickValue',
  pickOk: 'mbPickOk',
  pickBad: 'mbPickBad',
  pickWarn: 'mbPickWarn',
  pickOff: 'mbPickOff',
  footer: 'mbFooter',
  footerCenter: 'mbFooterCenter',
  footerLink: 'mbFooterLink',
  footerLinks: 'mbFooterLinks',
  danger: 'mbDanger',
  note: 'mbNote',
  error: 'mbError',
  loading: 'mbLoading',
  hidden: 'mbHidden',
} as const

/** Install the panel stylesheet. Safe to call on every apply. */
export function installPanelStyles(): void {
  injectStyle(PANEL_TAG, PANEL_CSS)
}

/** Join class names, dropping falsy entries (no clsx dependency needed). */
export function cx(...values: Array<string | false | null | undefined>): string {
  let out = ''
  for (const value of values) {
    if (value === undefined || value === null || value === false || value === '') continue
    out = out === '' ? value : `${out} ${value}`
  }
  return out
}

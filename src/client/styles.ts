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

const PACKAGE_NAME = 'dsh-workbuddy-memory'

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
  '.wbRoot{box-sizing:border-box;display:flex;flex:1;min-height:0;min-width:0;flex-direction:row;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);font-size:14px;line-height:22px}',
  /* Left nav: identical geometry to the Settings dialog's own nav column. */
  '.wbNav{box-sizing:border-box;flex:none;display:flex;flex-direction:column;gap:18px;width:188px;padding:22px 12px 0}',
  '.wbSearch{box-sizing:border-box;width:100%}',
  '.wbSearch input{width:100%}',
  '.wbNavList{display:flex;flex-direction:column;gap:4px;overflow-y:auto}',
  '.wbNavCell{box-sizing:border-box;display:flex;align-items:center;gap:8px;height:40px;padding:9px 16px 9px 12px;border:none;border-radius:var(--dsw-radius-md);background:0 0;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;font-weight:400;line-height:22px;text-align:left;cursor:pointer}',
  '.wbNavCell:hover{background:var(--dsw-specific-sidebar-nav-item-hover)}',
  '.wbNavCell:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-alias-state-business-primary);outline-offset:-1px}',
  '.wbNavCellActive{background:var(--dsw-specific-sidebar-nav-item-active)}',
  '.wbNavIcon{flex:none}',
  '.wbNavLabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  /* Red dot for pending skill drafts (memory-plan §6.2). */
  '.wbDot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-error-primary)}',
  /* Right content column: 24px side padding, no inner scroller of its own. */
  '.wbContent{box-sizing:border-box;flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;padding:22px 24px 24px;overflow-y:auto}',
  '.wbTitle{font-size:16px;font-weight:500;line-height:24px}',
  '.wbSubtitle{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:4px}',
  /* A settings.section page: the shell already supplies the 24px options
     padding and the scrolling, so this is only the card stack. */
  '.wbSection{display:flex;flex-direction:column;gap:12px;min-width:0}',

  /* One card per setting group. */
  '.wbCard{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px;border:.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l2));border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}',
  '.wbCardHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
  '.wbCardText{min-width:0;flex:1}',
  '.wbCardTitle{font-size:14px;line-height:20px}',
  '.wbCardDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;margin-top:2px}',
  '.wbCardActions{display:flex;flex:none;align-items:center;gap:4px}',
  '.wbRow{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0}',
  '.wbRow + .wbRow{padding-top:12px;border-top:.5px solid var(--dsw-alias-border-l2)}',

  /* The markdown body view: the shell scrolls the page, so this is only a cap. */
  '.wbProse{box-sizing:border-box;max-height:420px;overflow-y:auto;padding:2px;font-size:14px;line-height:22px;color:var(--dsw-alias-label-primary)}',
  '.wbProseEmpty{color:var(--dsw-alias-label-tertiary);font-size:13px}',
  /* No Textarea primitive exists, so the editor is a styled <textarea>. */
  '.wbEditor{box-sizing:border-box;width:100%;min-height:96px;max-height:420px;resize:vertical;padding:8px;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:13px;line-height:20px;outline:none}',
  '.wbEditor:focus{border-color:var(--dsw-alias-state-business-primary)}',
  '.wbEditorTall{min-height:180px}',
  '.wbEditor::placeholder{color:var(--dsw-alias-label-dimmed)}',

  /* Entry list on the memory page (search results highlight the match). */
  '.wbEntries{display:flex;flex-direction:column;gap:8px}',
  '.wbEntry{display:flex;align-items:flex-start;gap:8px;padding:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md)}',
  '.wbEntryBody{flex:1;min-width:0}',
  '.wbEntryText{font-size:13px;line-height:20px;word-break:break-word}',
  '.wbEntryMeta{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.wbEntryActions{display:flex;flex:none;gap:2px}',
  '.wbMark{background:var(--dsw-alias-state-warn-label,var(--dsw-alias-interactive-bg-active));border-radius:2px}',
  '.wbConflict{color:var(--dsw-alias-state-warn-primary)}',

  /* Pending-approval banner and cards. */
  '.wbBanner{box-sizing:border-box;display:flex;align-items:center;gap:8px;padding:10px 12px;border:.5px solid var(--dsw-alias-state-warn-primary);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);font-size:13px;line-height:20px}',
  '.wbDraft{display:flex;flex-direction:column;gap:6px;padding:12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2)}',
  '.wbDraftBody{max-height:180px;overflow-y:auto;font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary)}',

  '.wbFooter{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  /* Reference footer: one centred muted line with 隐私政策 as an inline link. */
  '.wbFooterCenter{display:block;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.wbFooterLink{padding:0;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer}',
  '.wbFooterLink:hover{color:var(--dsw-alias-label-secondary)}',
  '.wbFooterLinks{display:flex;align-items:center;gap:8px}',
  /*
    The reference draws 重置 as an outlined button whose LABEL is red. There is
    no danger Button variant in the primitives, so the tint is a wrapper class
    that recolours the label through currentColor.
  */
  '.wbDanger{color:var(--dsw-alias-state-error-primary)}',
  '.wbNote{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
  '.wbError{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-state-error-primary);font-size:13px;line-height:20px}',
  '.wbLoading{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}',
  '.wbHidden{display:none}',
].join('\n')

const PANEL_TAG = `${PACKAGE_NAME}/panel.module.css`

export const panelCss = {
  root: 'wbRoot',
  nav: 'wbNav',
  search: 'wbSearch',
  navList: 'wbNavList',
  navCell: 'wbNavCell',
  navCellActive: 'wbNavCellActive',
  navIcon: 'wbNavIcon',
  navLabel: 'wbNavLabel',
  dot: 'wbDot',
  content: 'wbContent',
  section: 'wbSection',
  title: 'wbTitle',
  subtitle: 'wbSubtitle',
  card: 'wbCard',
  cardHead: 'wbCardHead',
  cardText: 'wbCardText',
  cardTitle: 'wbCardTitle',
  cardDesc: 'wbCardDesc',
  cardActions: 'wbCardActions',
  row: 'wbRow',
  prose: 'wbProse',
  proseEmpty: 'wbProseEmpty',
  editor: 'wbEditor',
  editorTall: 'wbEditorTall',
  entries: 'wbEntries',
  entry: 'wbEntry',
  entryBody: 'wbEntryBody',
  entryText: 'wbEntryText',
  entryMeta: 'wbEntryMeta',
  entryActions: 'wbEntryActions',
  mark: 'wbMark',
  conflict: 'wbConflict',
  banner: 'wbBanner',
  draft: 'wbDraft',
  draftBody: 'wbDraftBody',
  footer: 'wbFooter',
  footerCenter: 'wbFooterCenter',
  footerLink: 'wbFooterLink',
  footerLinks: 'wbFooterLinks',
  danger: 'wbDanger',
  note: 'wbNote',
  error: 'wbError',
  loading: 'wbLoading',
  hidden: 'wbHidden',
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

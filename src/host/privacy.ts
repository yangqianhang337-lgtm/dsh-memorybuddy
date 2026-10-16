/**
 * Privacy rules (P8, memorybuddy-plan §7).
 *
 * Three of memory-plan §5.2's blacklist rows land here. They are separate from
 * `store.redact` (which strips secrets from text on its way into memory) because
 * they are three different KINDS of decision, and collapsing them would make one
 * of them wrong:
 *
 * 1. **`.no-memory` 标记** — 「整会话不采集」. A per-text filter cannot implement
 *    it: the requirement is that a session in a marked directory leaves NOTHING
 *    behind, so the decision must be made before the collector keeps an event,
 *    not on the way to disk. The mark is a FILE in the working directory
 *    (拍板 m04340), so it travels with the repository and is visible in a
 *    `ls` — a setting in this plugin's own preferences could not be "the
 *    project's decision" and would be invisible to anyone else using the repo.
 * 2. **PII** — a per-text pattern, so it belongs beside the secret patterns it
 *    extends. It is applied at `store.writeSessionNote`, the single choke point
 *    every session note passes through, because a note is the plugin's PRIMARY
 *    data path: the next pass lifts its `(候选 · …)` lines into a topic file that
 *    is injected into every future conversation. Filtering only the
 *    `memorybuddy_remember` tool and the panel editor left that route open.
 * 3. **防投毒** — content from outside the conversation is untrusted and never
 *    enters long-term memory. This is a property of an EVENT'S ORIGIN, so it is
 *    decided where the origin is known (the collector), not on the text.
 *
 * Nothing here calls a model and nothing here reads the memory root: these are
 * pure predicates over a path or an event, so they can be unit-tested without a
 * store.
 */

import { statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The file that marks a working directory as "do not remember anything here".
 *
 * A dotfile because it is a statement about the directory rather than a file the
 * project ships as content, and because `git status` keeps showing it, which is
 * the point: the exclusion should be visible to whoever works in the repo next.
 */
export const NO_MEMORY_MARKER = '.no-memory'

/**
 * How long a POSITIVE marker answer (「this directory is opted out」) is trusted
 * before it is re-checked.
 *
 * Only the affirmative is cached, and that asymmetry is the whole design. A
 * cached "marked" verdict can only ever cost a session that was ALREADY opted
 * out; a cached "not marked" verdict would cost one the user just opted out of,
 * and that is the direction the failure must not run. So:
 *
 * - not marked → re-`stat` on every call (one syscall per session, not per event,
 *   because the collector checks at creation and at each event boundary);
 * - marked → trusted for a second, which is enough for the twenty sessions of a
 *   busy project without paying twenty stats, and short enough that removing the
 *   marker takes effect promptly.
 *
 * A one-second cache that cached BOTH answers would leave a window in which a
 * marker dropped into a live project was ignored — and that window is exactly the
 * case the feature exists for.
 */
const MARKER_TTL_MS = 1_000

/** One working directory's cached marker verdict, if it was affirmative. */
interface MarkerVerdict {
  at: number
}

/**
 * Cache of directories KNOWN to carry the marker.
 *
 * Only affirmative answers are stored — see `MARKER_TTL_MS` for why that
 * asymmetry matters. Bounded because a Host that sees many workspaces must not
 * accumulate entries forever; eviction is the oldest-inserted, which is not an
 * LRU but is enough for entries that expire in a second anyway.
 */
const markerCache = new Map<string, MarkerVerdict>()
const MARKER_CACHE_LIMIT = 256

/** Forget every cached marker verdict (tests, and 重置 of the plugin's state). */
export function clearMarkerCache(): void {
  markerCache.clear()
}

/**
 * Whether `workspace` carries the `.no-memory` marker.
 *
 * SYNCHRONOUS on purpose, and this is the load-bearing design choice of the whole
 * rule: the collector must be able to refuse a session at the instant it sees it,
 * from inside a synchronous event dispatch. An `await` here would force the
 * decision to be deferred, and a deferred decision means events get buffered for
 * a session that was promised never to be recorded.
 *
 * Affordable anyway, because the collector calls this at most a few times per
 * session (state creation plus each event boundary) and only the AFFIRMATIVE
 * answer is cached — see `MARKER_TTL_MS`. The negative answer is always a live
 * `stat`, which is what makes 「把文件丢进去就立刻生效」 true rather than eventually
 * true.
 *
 * A missing, unreadable, or non-directory path is NOT marked: the marker is an
 * explicit opt-out, and treating 「查不到」 as 「不记」 would silently stop memory
 * for every session whose cwd the Host cannot stat — the worst possible default
 * for a rule whose failure mode is invisible.
 */
export function isNoMemoryWorkspace(workspace: string): boolean {
  const path = workspace.trim()
  if (path === '') return false
  const cached = markerCache.get(path)
  if (cached !== undefined && Date.now() - cached.at < MARKER_TTL_MS) return true
  let marked = false
  try {
    // A DIRECTORY named `.no-memory` is not the marker: only a plain file opts
    // out, so a stray folder cannot silently disable memory for a project.
    marked = statSync(join(path, NO_MEMORY_MARKER)).isFile()
  } catch {
    marked = false
  }
  if (marked) {
    if (markerCache.size >= MARKER_CACHE_LIMIT) {
      const oldest = markerCache.keys().next()
      if (oldest.done !== true) markerCache.delete(oldest.value)
    }
    markerCache.set(path, { at: Date.now() })
  } else {
    markerCache.delete(path)
  }
  return marked
}

/**
 * Whether one recorded event may become long-term memory.
 *
 * memory-plan §5.2 row 4: only the user's own words and verified local facts are
 * trustworthy; anything the assistant fetched, searched or read from the outside
 * is someone else's text and must not be remembered as if the user had said it.
 *
 * The collector already reduces a `tool/result` to "tool name + success/failure"
 * and never keeps its body, so the tool classes are covered by construction. What
 * remains — and what this predicate catches — is the assistant's own REPLY, which
 * routinely quotes what `web_fetch` just returned. That reply is indistinguishable
 * from the assistant reasoning in the note, so the rule applied is the one that
 * survives that: an assistant message is not a memory candidate source, period.
 * User messages remain the only source, which is also the only one that can carry
 * a preference.
 */
export function isUntrustedEvent(kind: string): boolean {
  return kind !== 'user'
}

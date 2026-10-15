/**
 * Memory entries: the unit that is deduped, corroborated, decayed and injected.
 *
 * An entry is one markdown list item in a topic file. Everything the machine
 * needs travels in a trailing HTML comment, so the file stays readable (and
 * editable) as ordinary markdown — the comment is invisible in every markdown
 * renderer, and a human who deletes it still keeps a working entry that simply
 * loses its corroboration history.
 *
 *   - [M-1a2b3c4d] 用户希望回复先给结论。 <!-- conf:中 days:3 first:2026-01-02 last:2026-01-05 src:s1,s2 -->
 *
 * Flags are appended to the same comment: `pin:1` (human-edited, never touched
 * by automatic consolidation) and `conflict:1` (a contradicting entry exists;
 * both are kept until the user answers).
 */

import { createHash } from 'node:crypto'
import type { Confidence, EntryView } from '../protocol.ts'
import { CONFIDENCES } from '../protocol.ts'

/** One parsed entry, with the line it came from. */
export interface Entry extends EntryView {
  /** Index of the list item within the topic body (0-based). */
  line: number
}

/** A stable id for text that has never been registered. */
export function entryId(text: string): string {
  return `M-${createHash('sha1').update(text.trim(), 'utf8').digest('hex').slice(0, 8)}`
}

/** `YYYY-MM-DD` in local time. */
export function dayKey(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A confidence one rung above `current`, capped at 高. */
export function raiseConfidence(current: Confidence): Confidence {
  const index = CONFIDENCES.indexOf(current)
  return CONFIDENCES[Math.min(index + 1, CONFIDENCES.length - 1)]
}

/** The confidence implied by a corroboration-day count. */
export function confidenceForDays(days: number): Confidence {
  if (days >= 4) return '高'
  if (days >= 2) return '中'
  return '低'
}

const ENTRY_PATTERN = /^\s*[-*]\s+(?:\[([A-Za-z0-9-]+)\]\s*)?(.+?)\s*$/

/** Split the machine comment off an entry line. */
function splitComment(raw: string): { text: string; meta: string | undefined } {
  const match = /<!--([\s\S]*?)-->\s*$/.exec(raw)
  if (match === null) return { text: raw.trim(), meta: undefined }
  return { text: raw.slice(0, match.index).trim(), meta: match[1].trim() }
}

/** Read `key:value` pairs out of a machine comment. */
function readMeta(meta: string | undefined): Record<string, string> {
  const record: Record<string, string> = {}
  if (meta === undefined) return record
  for (const part of meta.split(/\s+/)) {
    const separator = part.indexOf(':')
    if (separator <= 0) continue
    record[part.slice(0, separator)] = part.slice(separator + 1)
  }
  return record
}

/**
 * Parse every entry out of a topic body.
 *
 * A list item with no machine comment is still an entry: it is what a human
 * typed by hand, and refusing to read it would make the panel silently drop
 * the user's own writing. It gets a content-derived id, 低 confidence, and
 * today as its only corroboration date.
 */
export function parseEntries(body: string): Entry[] {
  const entries: Entry[] = []
  const lines = body.split('\n')
  for (let line = 0; line < lines.length; line += 1) {
    const match = ENTRY_PATTERN.exec(lines[line])
    if (match === null) continue
    const { text, meta } = splitComment(match[2])
    if (text === '') continue
    const fields = readMeta(meta)
    const days = Number.parseInt(fields.days ?? '1', 10)
    const confidence = (CONFIDENCES as readonly string[]).includes(fields.conf ?? '')
      ? (fields.conf as Confidence)
      : confidenceForDays(Number.isFinite(days) ? days : 1)
    const first = fields.first ?? dayKey()
    const last = fields.last ?? first
    entries.push({
      id: match[1] ?? entryId(text),
      text,
      confidence,
      days: Number.isFinite(days) && days > 0 ? days : 1,
      first,
      last,
      sources: (fields.src ?? '').split(',').map(item => item.trim()).filter(item => item !== ''),
      pinned: fields.pin === '1',
      conflict: fields.conflict === '1',
      line,
    })
  }
  return entries
}

/** Render one entry as a list item line. */
export function renderEntry(entry: EntryView): string {
  const fields = [
    `conf:${entry.confidence}`,
    `days:${entry.days}`,
    `first:${entry.first}`,
    `last:${entry.last}`,
  ]
  if (entry.sources.length > 0) fields.push(`src:${entry.sources.join(',')}`)
  if (entry.pinned) fields.push('pin:1')
  if (entry.conflict) fields.push('conflict:1')
  return `- [${entry.id}] ${entry.text} <!-- ${fields.join(' ')} -->`
}

/** Rewrite a topic body from `entries`, preserving the heading and prose. */
export function renderTopicBody(body: string, entries: EntryView[]): string {
  const lines = body.split('\n')
  const listLines = new Set<number>()
  for (let line = 0; line < lines.length; line += 1) {
    if (ENTRY_PATTERN.test(lines[line])) listLines.add(line)
  }
  const kept: string[] = []
  let inserted = false
  for (let line = 0; line < lines.length; line += 1) {
    if (listLines.has(line)) {
      if (!inserted) {
        kept.push(...entries.map(renderEntry))
        inserted = true
      }
      continue
    }
    kept.push(lines[line])
  }
  if (!inserted) {
    if (entries.length > 0) kept.push('', ...entries.map(renderEntry))
  }
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** Normalize entry text for comparison: case, width, punctuation, spacing. */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\s]+/g, '')
    .replace(/[，。、；：！？,.;:!?"'`（）()【】\[\]{}<>《》]/g, '')
}

/** Character bigrams of a normalized string. */
function bigrams(text: string): Set<string> {
  const grams = new Set<string>()
  for (let index = 0; index + 1 < text.length; index += 1) grams.add(text.slice(index, index + 2))
  if (text.length === 1) grams.add(text)
  return grams
}

/**
 * Similarity of two entries in [0, 1] — the Jaccard index of their character
 * bigrams. The plan's dedupe threshold (0.75) applies to this number.
 *
 * Bigrams rather than tokens because the entries are Chinese prose: a word
 * tokenizer would be a dependency, and whitespace tokenizing would score every
 * Chinese sentence pair as 0.
 */
export function similarity(left: string, right: string): number {
  const a = bigrams(normalizeForCompare(left))
  const b = bigrams(normalizeForCompare(right))
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared += 1
  return shared / (a.size + b.size - shared)
}

/** The plan's merge threshold for two entries that say the same thing. */
export const MERGE_THRESHOLD = 0.75

/**
 * Whether `candidate` contradicts `existing`.
 *
 * Only a negation flip on otherwise-similar text counts. The check is
 * deliberately conservative: a false conflict asks the user a pointless
 * question, while a missed one keeps a stale fact — and the stale fact is
 * already guarded by decay.
 */
export function contradicts(existing: string, candidate: string): boolean {
  if (similarity(existing, candidate) < 0.5) return false
  const negations = ['不', '别', '无需', '禁止', 'no longer', 'not ', "don't", 'never']
  const has = (text: string): boolean => negations.some(token => text.includes(token))
  return has(existing) !== has(candidate)
}

/**
 * Project memory extraction (P6, memorybuddy-plan §5).
 *
 * A session note's `## 项目相关` section is the seam: the collector already
 * writes one line there per session, and P6's job is to turn those lines into
 * durable facts under `memory/projects/<slug>.md` — the same entry format as a
 * topic file, so the merge/conflict machinery in `consolidate.ts` works on
 * them unchanged.
 *
 * The v1 section only ever carries the self-line `<workspace>：本会话的工作目录`
 * (`collector.ts` renderBody), which is provenance, not a fact — it is skipped
 * here. Real project facts arrive once the collector learns to record build
 * commands and conventions; the extractor is written for the general line
 * shape from day one so that upgrade needs no change here.
 */

import { slugify } from './prompt.ts'

/** One project fact lifted out of one session note. */
export interface ProjectCandidate {
  /** The project file this belongs to, e.g. `dsh-memorybuddy`. */
  slug: string
  /** The workspace the note recorded, for provenance debugging. */
  workspace: string
  /** The fact text, verbatim from the note. */
  text: string
  /** The note it came from, for `src:` provenance. */
  source: string
  /** `YYYY-MM-DD` the note belongs to — the unit of corroboration. */
  date: string
}

/**
 * Lift project facts out of one session note body.
 *
 * Returns an empty list when the note has no workspace (a fact without a
 * project cannot be filed), when the slug comes out empty, or when the section
 * carries nothing but the self-line and placeholders.
 */
export function extractProjectFacts(
  noteBody: string,
  workspace: string,
  source: string,
  date: string,
): ProjectCandidate[] {
  const slug = slugify(workspace)
  if (slug === '') return []
  const section = projectSection(noteBody)
  if (section === undefined) return []
  const candidates: ProjectCandidate[] = []
  for (const raw of section) {
    const match = /^\s*[-*]\s+(.+?)\s*$/.exec(raw)
    if (match === null) continue
    const text = match[1].trim()
    if (text === '' || text.startsWith('（无）')) continue
    // The self-line the collector writes for provenance is not a fact.
    if (/：本会话的工作目录\s*$/.test(text)) continue
    candidates.push({ slug, workspace, text, source, date })
  }
  return candidates
}

/** The `## 项目相关` section's list lines, or `undefined` when absent. */
function projectSection(noteBody: string): string[] | undefined {
  const lines = noteBody.split('\n')
  const start = lines.findIndex(line => line.trim() === '## 项目相关')
  if (start < 0) return undefined
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line.trim()))
  return lines.slice(start + 1, end < 0 ? lines.length : end)
}

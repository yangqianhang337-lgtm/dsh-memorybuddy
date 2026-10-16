/**
 * Atomic file primitives.
 *
 * Every write lands as a temp sibling followed by a rename, so a reader never
 * observes a half-written markdown file and two concurrent writers cannot
 * interleave inside one file: the last rename wins whole. The lock exists for
 * the read-modify-write sequences (a preference patch, a consolidation pass),
 * where losing the other writer's field would be data loss rather than a
 * last-writer-wins overwrite.
 *
 * The implementation mirrors the DSH runtime's own `@deepseek-ai/dsh-atomic-write`
 * (temp file with a random suffix created `wx`, then a rename retried through
 * transient Windows `EACCES`/`EBUSY`/`EPERM`), kept local because that package
 * is not resolvable from a profile's `node_modules`.
 */

import { randomBytes } from 'node:crypto'
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Transient rename failures on Windows (an indexer or AV holding the target). */
const TRANSIENT = new Set(['EACCES', 'EBUSY', 'EPERM'])
const RENAME_ATTEMPTS = 8
const DEFAULT_LOCK_WAIT_MS = 2000
const LOCK_BACKOFF_MS = 20
const LOCK_BACKOFF_MAX_MS = 200

/** Sleep for `ms`. */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** True when `error` carries one of `codes`. */
function hasCode(error: unknown, codes: Set<string>): boolean {
  return typeof error === 'object' && error !== null && codes.has(String((error as { code?: unknown }).code))
}

/** `mkdir -p` for a file's directory. */
export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

/** Ensure the parent directory of `path` exists. */
export async function ensureParent(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
}

/** Read a file as UTF-8, or `undefined` when it does not exist. */
export async function readTextOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (hasCode(error, new Set(['ENOENT', 'EISDIR', 'ENOTDIR']))) return undefined
    throw error
  }
}

/** Read a file as UTF-8, or `''` when it does not exist. */
export async function readText(path: string): Promise<string> {
  return (await readTextOrUndefined(path)) ?? ''
}

/** True when the path exists. */
export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** Write `content` to `path` atomically (temp sibling + rename). */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  await ensureParent(path)
  const temp = `${path}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temp, content, { encoding: 'utf8', flag: 'wx' })
  let lastError: unknown
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
    try {
      await rename(temp, path)
      return
    } catch (error) {
      lastError = error
      if (!hasCode(error, TRANSIENT)) break
      await sleep(Math.min(LOCK_BACKOFF_MS * 2 ** attempt, LOCK_BACKOFF_MAX_MS))
    }
  }
  await rm(temp, { force: true }).catch(() => undefined)
  throw lastError
}

/** Delete a file, ignoring a missing one. */
export async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true })
}

/**
 * Move a file or directory, retried through the same transient Windows errors
 * as `writeFileAtomic`.
 *
 * A directory move is how 重置 archives the whole memory; on Windows an indexer
 * or an open handle makes that rename fail for a few milliseconds, and the plan
 * promises a reset is reversible rather than a partial move.
 */
export async function movePath(from: string, to: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < RENAME_ATTEMPTS; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      lastError = error
      if (!hasCode(error, TRANSIENT)) throw error
      await sleep(Math.min(LOCK_BACKOFF_MS * 2 ** attempt, LOCK_BACKOFF_MAX_MS))
    }
  }
  throw lastError
}

/** True while the process that recorded `pid` is still alive. */
function processAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !hasCode(error, new Set(['ESRCH']))
  }
}

/**
 * Run `operation` while holding an exclusive lock on `path`.
 *
 * The lock is a `wx`-created sibling recording the owner's pid, so a lock left
 * behind by a crashed Host is taken over instead of deadlocking the plugin.
 * A lock that is genuinely held makes this wait up to `waitMs` and then throw —
 * the caller reports a busy store rather than writing over another process.
 */
export async function withFileLock<T>(
  path: string,
  operation: () => Promise<T>,
  waitMs = DEFAULT_LOCK_WAIT_MS,
): Promise<T> {
  const lockPath = `${path}.lock`
  await ensureParent(lockPath)
  const deadline = Date.now() + waitMs
  let backoff = LOCK_BACKOFF_MS
  for (;;) {
    try {
      const handle = await open(lockPath, 'wx')
      await handle.writeFile(`${process.pid}\n`, 'utf8')
      await handle.close()
      break
    } catch (error) {
      if (!hasCode(error, new Set(['EEXIST']))) throw error
      const recorded = Number.parseInt((await readTextOrUndefined(lockPath))?.trim() ?? '', 10)
      if (Number.isSafeInteger(recorded) && !processAlive(recorded)) {
        await rm(lockPath, { force: true }).catch(() => undefined)
        continue
      }
      if (Date.now() >= deadline) throw new Error(`atomic-write: timed out waiting for the writer lock at ${lockPath}`)
      await sleep(backoff)
      backoff = Math.min(backoff * 2, LOCK_BACKOFF_MAX_MS)
    }
  }
  try {
    return await operation()
  } finally {
    await rm(lockPath, { force: true }).catch(() => undefined)
  }
}

/** List the entries of a directory, or `[]` when it does not exist. */
export async function listDir(path: string): Promise<string[]> {
  try {
    const { readdir } = await import('node:fs/promises')
    return await readdir(path)
  } catch (error) {
    if (hasCode(error, new Set(['ENOENT', 'ENOTDIR']))) return []
    throw error
  }
}

/** Last modification time in ISO form, or `null`. */
export async function mtimeIso(path: string): Promise<string | null> {
  try {
    return (await stat(path)).mtime.toISOString()
  } catch {
    return null
  }
}

/** Join helper re-exported so callers do not each import `node:path`. */
export { join }

/**
 * The HTTP surface: one prefix, five routes, and the same auth fence the
 * task-board plugin uses.
 *
 * The prefix is root-absolute (`/api/workbuddy-memory`) because the route table
 * matches on the request URL; the browser half builds its URLs from
 * `API_PREFIX.slice(1)` against the document base, because the GUI page is
 * served under `<base href="./">` and an absolute path there would resolve
 * against the wrong origin root.
 *
 * The fence is a tripwire, not authentication: the Desktop shell serves the GUI
 * from `dsh-app://app/` and forwards API requests with `origin` and
 * `sec-fetch-site` removed, so those headers cannot distinguish anything. What
 * actually gates the route is that only the shell attaches the `dsh-auth-`
 * cookie, and it never exposes that cookie to page script. A loopback request
 * is therefore accepted with either the marker or the cookie, and everything
 * else is refused.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { API_PREFIX, asRecord, type MemoryAction } from '../protocol.ts'
import { asJsonObject, isJsonRequest, readJsonBody, writeJson } from './http.ts'
import { isLoopbackAddress, isLoopbackRequest } from './loopback.ts'
import type { MemoryStore } from './store.ts'
import type { Consolidator } from './consolidate.ts'

/** The cookie the Desktop shell attaches to every forwarded request. */
export const BROWSER_AUTH_COOKIE_PREFIX = 'dsh-auth-'

/** Body caps: a document save is small; an import may carry a whole file. */
const ACTION_LIMIT = 64 * 1024
const SAVE_LIMIT = 1024 * 1024

/** One route as `ctx.webServer.register` takes it. */
export interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
}

/** True when a `Cookie` header carries a shell-issued auth cookie. */
export function carriesBrowserAuthCookie(header: string | undefined): boolean {
  if (typeof header !== 'string' || header === '') return false
  for (const segment of header.split(';')) {
    if (segment.trim().startsWith(BROWSER_AUTH_COOKIE_PREFIX)) return true
  }
  return false
}

/** True when the request proves it came from a browser in this origin. */
export function browserSameOriginMarker(request: IncomingMessage): boolean {
  if (request.headers['sec-fetch-site'] === 'same-origin') return true
  if (typeof request.headers.origin === 'string') return true
  return carriesBrowserAuthCookie(request.headers.cookie)
}

/**
 * Whether the request may touch the memory routes.
 *
 * Loopback plus a browser marker is enough; a non-loopback socket is refused
 * outright, because this deployment has no proxy that would legitimately
 * forward from elsewhere.
 */
export function isTrustedMemoryRequest(request: IncomingMessage): boolean {
  if (!browserSameOriginMarker(request)) return false
  if (isLoopbackRequest(request)) return true
  return isLoopbackAddress(request.socket.remoteAddress ?? undefined) && carriesBrowserAuthCookie(request.headers.cookie)
}

/** What the routes need from the plugin. */
export interface RoutesHost {
  store: MemoryStore
  consolidator: Consolidator
  /** Re-render the injected prompt section after a write. */
  onChanged: () => void
  log: (message: string) => void
}

/** Build the route table. */
export function memoryRoutes(host: RoutesHost): WebRoute[] {
  const guard = (request: IncomingMessage, response: ServerResponse): boolean => {
    if (isTrustedMemoryRequest(request)) return true
    writeJson(response, 403, { ok: false, error: 'forbidden' })
    return false
  }

  return [
    {
      kind: 'exact',
      path: `${API_PREFIX}/state`,
      handler: async (request, response) => {
        if (request.method !== 'GET') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        const snapshot = await host.store.snapshot()
        writeJson(response, 200, snapshot)
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/save`,
      handler: async (request, response) => {
        if (request.method !== 'POST') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        if (!isJsonRequest(request)) return writeJson(response, 415, { ok: false, error: 'json-required' })
        const body = asJsonObject(await readJsonBody(request, { maxBytes: SAVE_LIMIT }))
        if (body === undefined) return writeJson(response, 400, { ok: false, error: 'invalid-body' })
        const path = typeof body.path === 'string' ? body.path : ''
        const text = typeof body.text === 'string' ? body.text : ''
        const revision = typeof body.revision === 'string' ? body.revision : ''
        if (path === '') return writeJson(response, 400, { ok: false, error: 'invalid-path' })
        const outcome = await host.store.saveDocument(path, text, revision)
        if (!outcome.ok) {
          // The on-disk text travels back with the refusal so the editor can
          // show a merge instead of losing the user's typing.
          return writeJson(response, 409, {
            ok: false,
            error: 'conflict',
            path,
            text: outcome.text,
            revision: outcome.revision,
          })
        }
        host.onChanged()
        writeJson(response, 200, { ok: true, snapshot: await host.store.snapshot() })
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/preferences`,
      handler: async (request, response) => {
        if (request.method !== 'POST') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        if (!isJsonRequest(request)) return writeJson(response, 415, { ok: false, error: 'json-required' })
        const body = asJsonObject(await readJsonBody(request, { maxBytes: ACTION_LIMIT }))
        if (body === undefined) return writeJson(response, 400, { ok: false, error: 'invalid-body' })
        const patch = asJsonObject(body.patch)
        if (patch === undefined) return writeJson(response, 400, { ok: false, error: 'invalid-patch' })
        await host.store.patchPreferences({ patch: patch as never })
        host.onChanged()
        writeJson(response, 200, { ok: true, snapshot: await host.store.snapshot() })
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/action`,
      handler: async (request, response) => {
        if (request.method !== 'POST') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        if (!isJsonRequest(request)) return writeJson(response, 415, { ok: false, error: 'json-required' })
        const body = asJsonObject(await readJsonBody(request, { maxBytes: ACTION_LIMIT }))
        if (body === undefined) return writeJson(response, 400, { ok: false, error: 'invalid-body' })
        const action = body.action
        const record = asRecord(action)
        if (record === undefined || typeof record.kind !== 'string') {
          return writeJson(response, 400, { ok: false, error: 'invalid-action' })
        }
        try {
          const result = await runAction(host, record as unknown as MemoryAction)
          host.onChanged()
          writeJson(response, 200, { ok: true, result, snapshot: await host.store.snapshot() })
        } catch (error) {
          host.log(`workbuddy-memory: 动作失败：${String(error)}`)
          writeJson(response, 500, { ok: false, error: String(error) })
        }
      },
    },
  ]
}

/** Run one panel action. */
async function runAction(host: RoutesHost, action: MemoryAction): Promise<unknown> {
  switch (action.kind) {
    case 'consolidate': {
      const report = await host.consolidator.run('手动整理')
      return { report }
    }
    case 'reset-document':
      await host.store.resetDocument(action.path)
      return { path: action.path }
    case 'forget-entry':
      return { removed: await host.store.editEntry(action.topic as never, action.id, { remove: true }) }
    case 'pin-entry':
      return { pinned: await host.store.editEntry(action.topic as never, action.id, { pinned: action.pinned }) }
    case 'approve-draft':
      return { approved: await host.store.approveDraft(action.name) }
    case 'discard-draft':
      return { discarded: await host.store.discardDraft(action.name) }
    default:
      return { ignored: true }
  }
}

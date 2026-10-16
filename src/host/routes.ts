/**
 * The HTTP surface: one prefix, seven routes, and the same auth fence the
 * task-board plugin uses.
 *
 * The seven are `state`, `models`, `consolidate-status`, `save`, `preferences`,
 * `journal` and `action`.
 *
 * The prefix is root-absolute (`/api/memorybuddy`) because the route table
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
import {
  API_PREFIX,
  asRecord,
  type MemoryAction,
  type MemorySnapshot,
  type ModelCatalog,
  type RuntimeView,
} from '../protocol.ts'
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
  /**
   * Live runtime facts (`running`, the resolved model pick).
   *
   * They are a callback, not a value, because they describe the runtime *now*:
   * a pass can be in flight, and the model registry can change between requests.
   * They are also deliberately absent from `state.json` — a persisted
   * `running: true` would still claim a pass is in flight after a crash.
   */
  runtime?: () => Promise<RuntimeView>
  /** The enumerated model catalogue, cached host-side by the picker. */
  catalog?: () => Promise<ModelCatalog>
}

/** Build the route table. */
export function memoryRoutes(host: RoutesHost): WebRoute[] {
  const guard = (request: IncomingMessage, response: ServerResponse): boolean => {
    if (isTrustedMemoryRequest(request)) return true
    writeJson(response, 403, { ok: false, error: 'forbidden' })
    return false
  }

  /**
   * Attach the live half of the snapshot.
   *
   * A failing runtime probe must not take the whole panel down: the stored half
   * (entries, documents, questions) is the part the user came for, so a failure
   * degrades to the one fact the routes can always answer themselves.
   */
  const withRuntime = async (snapshot: MemorySnapshot): Promise<MemorySnapshot> => {
    if (host.runtime === undefined) {
      return { ...snapshot, runtime: { running: host.consolidator.busy } }
    }
    try {
      return { ...snapshot, runtime: await host.runtime() }
    } catch (error) {
      host.log(`读取运行时状态失败：${String(error)}`)
      return { ...snapshot, runtime: { running: host.consolidator.busy } }
    }
  }

  return [
    {
      kind: 'exact',
      path: `${API_PREFIX}/state`,
      handler: async (request, response) => {
        if (request.method !== 'GET') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        writeJson(response, 200, await withRuntime(await host.store.snapshot()))
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/models`,
      handler: async (request, response) => {
        if (request.method !== 'GET') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        if (host.catalog === undefined) {
          const empty: ModelCatalog = {
            providers: [],
            models: [],
            fetchedAt: new Date().toISOString(),
            note: '当前环境没有可用的模型服务',
          }
          return writeJson(response, 200, { ok: true, catalog: empty })
        }
        try {
          writeJson(response, 200, { ok: true, catalog: await host.catalog() })
        } catch (error) {
          host.log(`枚举模型失败：${String(error)}`)
          writeJson(response, 200, {
            ok: true,
            catalog: { providers: [], models: [], fetchedAt: new Date().toISOString(), note: String(error) },
          })
        }
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/consolidate-status`,
      handler: async (request, response) => {
        if (request.method !== 'GET') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        // A light poll target: the full snapshot re-reads every document and
        // recomputes a sha1 revision, which is far too much work to repeat every
        // two seconds while a model call is in flight.
        const snapshot = await host.store.snapshot()
        writeJson(response, 200, {
          ok: true,
          running: host.consolidator.busy,
          revision: snapshot.revision,
          consolidation: snapshot.consolidation,
          questions: snapshot.questions,
          history: snapshot.history,
          pending: snapshot.sessions.pending,
        })
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
        writeJson(response, 200, { ok: true, snapshot: await withRuntime(await host.store.snapshot()) })
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
        writeJson(response, 200, { ok: true, snapshot: await withRuntime(await host.store.snapshot()) })
      },
    },
    {
      kind: 'exact',
      path: `${API_PREFIX}/journal`,
      handler: async (request, response) => {
        if (request.method !== 'GET') return writeJson(response, 405, { ok: false, error: 'method-not-allowed' })
        if (!guard(request, response)) return
        const url = new URL(request.url ?? '/', 'http://localhost')
        const date = url.searchParams.get('date') ?? ''
        const journal = await host.store.readJournal(date)
        writeJson(response, 200, { ok: true, journal })
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
        // Consolidation is the one action that can outlive the browser's 15s
        // timeout (§4.4 规则 0) — with a model stage it can run for a minute. It
        // answers immediately and reports through the snapshot the panel is
        // already polling, so a slow pass reads as "整理中" instead of as a
        // failed click.
        if (record.kind === 'consolidate') {
          const started = host.consolidator.busy ? false : true
          if (started) {
            void host.consolidator
              .run('手动整理')
              .then(report => {
                host.onChanged()
                host.log(`手动整理完成：新增 ${report.added} · 合并 ${report.merged} · 归档 ${report.archived}`)
              })
              .catch(error => {
                host.log(`手动整理失败：${String(error)}`)
              })
          }
          return writeJson(response, 202, {
            ok: true,
            result: { started, reason: started ? undefined : '上一次整理还在进行中' },
            snapshot: await withRuntime(await host.store.snapshot()),
          })
        }
        try {
          const result = await runAction(host, record as unknown as MemoryAction)
          host.onChanged()
          writeJson(response, 200, { ok: true, result, snapshot: await withRuntime(await host.store.snapshot()) })
        } catch (error) {
          host.log(`动作失败：${String(error)}`)
          writeJson(response, 500, { ok: false, error: String(error) })
        }
      },
    },
  ]
}

/** Run one panel action. */
async function runAction(host: RoutesHost, action: MemoryAction): Promise<unknown> {
  switch (action.kind) {
    case 'reset-document':
      await host.store.resetDocument(action.path)
      return { path: action.path }
    case 'reset-all':
      return await host.store.resetAll()
    case 'forget-entry':
      return { removed: await host.store.editEntry(action.topic as never, action.id, { remove: true }) }
    case 'pin-entry':
      return { pinned: await host.store.editEntry(action.topic as never, action.id, { pinned: action.pinned }) }
    case 'dismiss-question':
      return { dismissed: await host.store.dismissQuestion(action.index) }
    case 'rollback':
      return await host.store.rollback(action.date)
    case 'approve-draft':
      return { approved: await host.store.approveDraft(action.name) }
    case 'discard-draft':
      return { discarded: await host.store.discardDraft(action.name) }
    default:
      return { ignored: true }
  }
}

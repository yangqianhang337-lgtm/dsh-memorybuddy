/**
 * Small HTTP helpers for the JSON routes.
 *
 * Every response carries `no-store`: the panel polls a state snapshot that must
 * never be served from a cache, or a save would appear to have been ignored.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** The default body cap for a JSON request. */
export const DEFAULT_BODY_LIMIT = 64 * 1024

/** Headers every JSON response carries. */
export const JSON_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
}

/** Narrow an unknown value to a JSON object. */
export function asJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/** Read a JSON body, returning `undefined` when it is empty, broken or too big. */
export async function readJsonBody(
  request: IncomingMessage,
  options: { maxBytes?: number } = {},
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? DEFAULT_BODY_LIMIT
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    total += buffer.byteLength
    if (total > maxBytes) {
      // Drain and close: leaving the socket open would let a client stream
      // forever against a request the server already refused.
      request.destroy()
      return undefined
    }
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** Write a JSON response. */
export function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { ...JSON_HEADERS, ...headers })
  response.end(payload)
}

/** True when the request declared a JSON body. */
export function isJsonRequest(request: IncomingMessage): boolean {
  const contentType = request.headers['content-type'] ?? ''
  return contentType.toLowerCase().startsWith('application/json')
}

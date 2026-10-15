/**
 * Loopback detection for the HTTP routes.
 *
 * The GUI is served by the Desktop shell, which forwards requests with the
 * `origin` and `sec-fetch-site` headers stripped, so a same-origin marker alone
 * cannot decide anything. This module answers the narrower question — "did this
 * request arrive over the loopback interface, addressed to a loopback host?" —
 * and the route guard combines it with the browser marker.
 *
 * `X-Forwarded-For` is never trusted: it is attacker-controlled on any hop that
 * is not the proxy, and the only proxy in this deployment is the shell itself.
 */

import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'

/** True for an IPv4 address inside 127.0.0.0/8. */
export function isIPv4Loopback(value: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value)
  if (match === null) return false
  return Number(match[1]) === 127
}

/** True for any address that can only be the local machine. */
export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined || address === '') return false
  const normalized = address.startsWith('::ffff:') ? address.slice(7) : address
  if (normalized === '::1') return true
  if (isIP(normalized) === 4) return isIPv4Loopback(normalized)
  return false
}

/** True when a `Host` header names a loopback host. */
export function isLoopbackHostname(hostname: string): boolean {
  const bare = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  if (bare === 'localhost') return true
  if (bare === '::1') return true
  if (isIP(bare) === 4) return isIPv4Loopback(bare)
  return false
}

/**
 * True when the request arrived from this machine and was addressed to it.
 *
 * All four must hold: the socket is loopback, the `Host` header parses as a
 * loopback authority, the request is not explicitly cross-site, and the
 * `Origin`, when present, matches the `Host`.
 */
export function isLoopbackRequest(request: IncomingMessage): boolean {
  if (!isLoopbackAddress(request.socket.remoteAddress ?? undefined)) return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

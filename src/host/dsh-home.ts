/**
 * Resolve the DSH data root the same way every other plugin does.
 *
 * `DSH_HOME` wins when set to a non-blank value; otherwise `~/.dsh`. The path
 * is expanded and made absolute against the working directory, so a relative
 * `DSH_HOME` cannot scatter memory files into whatever directory the Host
 * happened to start in. Nothing here may hardcode a user name: the package is
 * published, and a personal path would break every other machine.
 */

import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Expand a leading `~` against `home`. */
export function expandHome(path: string, home: string = homedir()): string {
  if (path === '~') return home
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home, path.slice(2))
  return path
}

/** The DSH home directory (`$DSH_HOME`, else `~/.dsh`). */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string {
  const configured = env.DSH_HOME?.trim()
  if (configured !== undefined && configured !== '') {
    const expanded = expandHome(configured, home)
    return isAbsolute(expanded) ? expanded : resolve(expanded)
  }
  return join(home, '.dsh')
}

/** Directory holding every markdown file this plugin owns. */
export const MEMORY_DIR_NAME = 'dsh-memorybuddy'

/** The plugin's data root: `$DSH_HOME/dsh-memorybuddy`. */
export function resolveMemoryRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDshHome(env), MEMORY_DIR_NAME)
}

/** The user-level skills directory a draft is promoted into on approval. */
export function resolveSkillsRoot(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDshHome(env), 'skills')
}

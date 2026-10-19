/**
 * Which project a command works on.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { CommandError } from './command'

const PACKAGE = '@anja.codes/vitakit'

function dependsOnVitakit(dir: string): boolean {
  const file = join(dir, 'package.json')
  if (!existsSync(file)) return false
  try {
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>
    return Boolean(manifest.dependencies?.[PACKAGE] ?? manifest.devDependencies?.[PACKAGE])
  } catch {
    return false
  }
}

/**
 * The nearest directory, from `start` upwards, whose package.json depends on
 * vitakit. The nearest, so that a site inside a workspace is chosen over the
 * workspace root.
 */
export function findProjectRoot(start: string): string | undefined {
  let dir = resolve(start)
  for (;;) {
    if (dependsOnVitakit(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/** The root a command works on: `--root`, or found from the working directory. */
export function resolveRoot(cwd: string, explicit: string | undefined): string {
  if (explicit !== undefined) {
    const root = resolve(cwd, explicit)
    if (!existsSync(root)) throw new CommandError(`--root ${explicit}: no such directory`)
    return root
  }
  const root = findProjectRoot(cwd)
  if (!root) {
    throw new CommandError(
      `not inside a vitakit project: no package.json from here upwards depends on ${PACKAGE}.\n`
      + `  Run this in your site's directory, or pass --root <dir>.`,
    )
  }
  return root
}

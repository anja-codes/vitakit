/**
 * Locating the files vitakit ships alongside its code: the CSL style, the TeX
 * templates, the document class, and the runtime components that `eject` copies.
 *
 * These are read at build time, from whichever chunk happens to import them,
 * and a chunk's depth inside `dist/` is not part of any contract. Rather than
 * having each call site guess with `existsSync` probes, everything goes through
 * `resolveAsset`, which resolves against the *package root* — the one fixed
 * point — and reports a single, actionable error when the layout is wrong.
 *
 * `scripts/check-dist.mjs` asserts the built layout in CI, so a packaging
 * mistake fails in this repository rather than in a user's project.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package-relative paths of the shipped assets, as callers refer to them. */
export type AssetPath
  = | 'styles'
    | 'tex'
    | 'tex/templates'
    | 'tex/vitakit-cv.cls'
    | 'runtime'
    | 'runtime/components'
    | 'schemas'

/**
 * Where each asset lives in the *source* tree, when it differs from `dist/`.
 * `styles/` sits at the package root in both layouts.
 */
function sourcePath(asset: AssetPath): string {
  return asset === 'styles' ? asset : join('src', asset)
}

let root: string | undefined

/** The installed (or checked-out) package root, found once and cached. */
export function packageRoot(): string {
  if (root) return root
  let dir = dirname(fileURLToPath(import.meta.url))
  // Walk up to the package root: `dist/` is at most a few levels deep, and a
  // source checkout is one level deep.
  for (let depth = 0; depth < 6; depth += 1) {
    if (existsSync(join(dir, 'package.json'))) return (root = dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error('vitakit: cannot locate the package root; the installation is incomplete')
}

/** True when this module is running from `dist/` rather than from `src/`. */
const built = /[/\\]dist[/\\]/.test(import.meta.url)

/**
 * Absolute path of a shipped asset.
 *
 * Code running from `dist/` uses the built copies; code running from source
 * (tests, `unbuild --stub`) prefers the source tree, so a stale `dist/` cannot
 * make a test pass against files that are no longer current. Either way the
 * other layout is accepted as a fallback.
 */
export function resolveAsset(asset: AssetPath): string {
  const base = packageRoot()
  const order = built ? ['dist', undefined] : [undefined, 'dist']
  const candidates = order.map(prefix =>
    prefix ? join(base, prefix, asset) : join(base, sourcePath(asset)))
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  throw new Error(
    `vitakit: missing bundled asset "${asset}"; looked in\n`
    + candidates.map(candidate => `  ${candidate}`).join('\n')
    + '\nRun `pnpm build` in the package, or reinstall it.',
  )
}

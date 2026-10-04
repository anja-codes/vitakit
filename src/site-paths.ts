/**
 * Paths on the website where a URL is expected: `slides: /slides/talk.pdf`,
 * a file in `public/`.
 *
 * Validation cannot know where the site is served, so the `url` primitive
 * only marks such a path, as `richText` marks its fields, and `loadContent`
 * resolves every mark: for the website against the deployment base path, for
 * the PDF against `profile.url`, the site's public address. The marker is
 * internal and never appears in `VitakitContent`.
 */

/** The single property that identifies an unresolved site path. */
export const PATH_KEY = '__vitakitPath'

export interface SitePathMarker {
  [PATH_KEY]: string
}

/** Root-relative, i.e. `/x` but not protocol-relative `//host/x`. */
export const isSitePath = (value: string): boolean => value.startsWith('/') && !value.startsWith('//')

export const sitePathMarker = (path: string): SitePathMarker => ({ [PATH_KEY]: path })

export function isSitePathMarker(value: unknown): value is SitePathMarker {
  return typeof value === 'object' && value !== null && PATH_KEY in value
}

/** Replace every marker, at any depth, with `resolve(path)`. */
export function resolveSitePaths(value: unknown, resolve: (path: string) => string): unknown {
  if (isSitePathMarker(value)) return resolve(value[PATH_KEY])
  if (Array.isArray(value)) return value.map(item => resolveSitePaths(item, resolve))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSitePaths(item, resolve)]))
  }
  return value
}

/**
 * A site path as an absolute URL below the site's public address, which may
 * include a subdirectory: `https://jane.github.io/site/` and `/slides/a.pdf`
 * give `https://jane.github.io/site/slides/a.pdf`. Without an address, the
 * path is left as it is, for the PDF to refuse where it would print it.
 */
export function absoluteSitePath(path: string, siteUrl: string | undefined): string {
  return siteUrl ? `${siteUrl.replace(/\/?$/, '/')}${path.slice(1)}` : path
}

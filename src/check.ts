/**
 * `@anja.codes/vitakit/check` — assertions on the *generated site*, not on inputs.
 *
 * Schemas validate what a user writes; they cannot catch a renderer that
 * silently does nothing, a sanitizer that strips markup, a wrong base path, or
 * a private CV entry that reached the public build. Those only show up in the
 * HTML, which is what this checks.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { loadContent } from './content'
import { MARKER_KEY } from './rich'
import { richHtml, richSource } from './shared/rich'
import { atMost } from './shared/visibility'
import type { Entry, VitakitContent } from './shared/types'

export interface CheckOptions {
  rootDir: string
  /** Generated site; defaults to `.output/public`. */
  outDir?: string
  baseURL?: string
  /**
   * Skip the leak check. It compares text of non-public entries against the
   * generated pages, which is a heuristic: a title or institution that is
   * legitimately public elsewhere looks like a leak. Turn it off rather than
   * rewording content to satisfy it.
   */
  skipLeakCheck?: boolean
}

export interface CheckResult {
  /** Human-readable summary lines for what was verified. */
  checked: string[]
  failures: string[]
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false)
}

async function htmlFiles(dir: string): Promise<string[]> {
  const found: string[] = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name)
    if (item.isDirectory()) found.push(...await htmlFiles(path))
    else if (item.name.endsWith('.html')) found.push(path)
  }
  return found
}

/**
 * The fields that identify an entry, for leak detection.
 *
 * Only title-like fields are used. Comparing *every* string would flag an
 * institution, co-author or course name that appears publicly for a different
 * entry -- a false positive that cannot be fixed except by rewording content.
 */
const IDENTIFYING = ['title', 'position', 'degree', 'student', 'event', 'thesis', 'project']

function identifyingText(entry: Entry): string[] {
  const parts: string[] = []
  const add = (value: unknown) => {
    const source = richSource(value)
    if (source) {
      // A page may show a field as written (`{{ }}`) or rendered (`v-html`), so
      // both forms count. Rendered math is KaTeX markup that a component may
      // lay out differently, so the prose between formulas counts on its own.
      parts.push(source)
      const html = richHtml(value)
      if (html && html !== source) parts.push(html)
      const prose = source.split(/\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\\])*\$/)
      if (prose.length > 1) parts.push(...prose.filter(part => part.trim().length >= 20))
    }
    // A nested object such as `thesis`: only its title.
    else if (typeof value === 'object' && value !== null && 'title' in (value as object)) {
      add((value as { title: unknown }).title)
    }
  }
  for (const field of IDENTIFYING) add(entry[field])
  // Short strings collide by accident; a real title is longer than this.
  return [...new Set(parts.map(part => normaliseText(part)))].filter(part => part.length >= 12)
}

/** Root-relative, i.e. `/x` but not protocol-relative `//host/x`. */
const isRootRelative = (value: string) => value.startsWith('/') && !value.startsWith('//')

/** Whether a root-relative path lies inside the deployment. */
const underBase = (path: string, base: string) => path.startsWith(base) || `${path}/` === base

/** Scripts and stylesheets the framework emitted: `<script src>`, `<link href>`. */
function assetReferences(html: string): string[] {
  const found: string[] = []
  for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/gi)) {
    const value = /\s(?:src|href)\s*=\s*(["'])(.*?)\1/i.exec(tag)?.[2]
    if (value && isRootRelative(value)) found.push(value)
  }
  return found
}

/**
 * Every root-relative URL in an attribute, on any element: `href`, `src`,
 * `poster`, `data`, `action`, `formaction`, and each candidate of a `srcset`.
 */
function urlReferences(html: string): string[] {
  const found: string[] = []
  for (const match of html.matchAll(/\s(src|href|poster|data|action|formaction|srcset)\s*=\s*(["'])(.*?)\2/gi)) {
    const values = match[1]!.toLowerCase() === 'srcset'
      ? match[3]!.split(/\s*,\s+|\s*,(?=\/)/).map(candidate => candidate.trim().split(/\s+/)[0]!)
      : [match[3]!]
    found.push(...values.filter(isRootRelative))
  }
  return found
}

/**
 * Whether a path below the base names something in the generated site: a file,
 * or a page, i.e. a directory with an `index.html` (`/cv/` and `/cv` alike).
 */
async function existsInSite(outDir: string, path: string): Promise<boolean> {
  let decoded: string
  try {
    decoded = decodeURIComponent(path.replace(/[?#].*$/, ''))
  } catch {
    return false
  }
  const target = join(outDir, decoded)
  if (relative(outDir, target).startsWith('..')) return false
  const found = await stat(target).catch(() => undefined)
  if (found?.isFile()) return true
  return found?.isDirectory() === true && (await stat(join(target, 'index.html')).catch(() => undefined))?.isFile() === true
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

/** The character a character reference stands for; unknown names stay as written. */
function decodeEntity(reference: string, name: string): string {
  if (name[0] === '#') {
    const code = name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
    return Number.isInteger(code) && code >= 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : reference
  }
  return ENTITIES[name] ?? reference
}

/**
 * Visible text of a page or a fragment, with markup and whitespace differences
 * removed. Character references are decoded rather than dropped: Vue writes an
 * apostrophe as `&#39;`, a rendered field contains it literally, and both must
 * compare equal to the title as written.
 */
function normaliseText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/\s+/g, ' ')
    .trim()
}

export async function checkStatic(options: CheckOptions): Promise<CheckResult> {
  const outDir = join(options.rootDir, options.outDir ?? '.output/public')
  const base = options.baseURL ?? process.env.NUXT_APP_BASE_URL ?? '/'
  const checked: string[] = []
  const failures: string[] = []
  const fail = (message: string) => failures.push(message)

  if (!await exists(outDir)) {
    return { checked, failures: [`no generated site at ${outDir}; run \`nuxt generate\` first`] }
  }

  // Content is reloaded with private entries visible, so the check knows what
  // must *not* appear in the output.
  let content: VitakitContent
  try {
    content = await loadContent(options.rootDir, { strict: true, baseURL: base, maxVisibility: 'private' })
  } catch (error) {
    return { checked, failures: [`content did not load: ${error instanceof Error ? error.message : String(error)}`] }
  }

  const files = await htmlFiles(outDir)
  const pages = new Map<string, string>()
  for (const file of files) pages.set(file, await readFile(file, 'utf8'))

  // 1. every page was prerendered
  for (const page of content.pages) {
    const file = join(outDir, page.route === '/' ? 'index.html' : `${page.route.slice(1)}index.html`)
    if (!await exists(file)) fail(`page ${page.route} was not generated (${file})`)
  }
  checked.push(`${content.pages.length} page(s) generated`)

  // 2. mathematics was rendered at build time
  let mathPages = 0
  for (const [file, html] of pages) {
    if (html.includes('katex-error')) fail(`${file}: KaTeX reported an error`)
    if (html.includes('class="katex')) mathPages += 1
    if (html.includes(MARKER_KEY)) fail(`${file}: an unrendered rich-text marker reached the output`)
  }
  checked.push(`mathematics rendered on ${mathPages} page(s)`)

  // 3. the site was built for this base path
  //
  // Judged by the scripts and stylesheets the framework emitted, wherever its
  // build directory is and whichever pages exist. A mismatch means the whole
  // build is for a different base, so the per-link check below would only
  // repeat the same problem for every page.
  //
  // Nuxt also records the base it was built for in each page's runtime config;
  // that catches the reverse mistake, a build for `/sub/` checked against `/`,
  // where every path trivially starts with the base.
  const assets = [...pages.values()].flatMap(assetReferences)
  const strayAssets = assets.filter(path => !underBase(path, base))
  const recorded = [...pages.values()]
    .map(html => /\bapp:\{baseURL:"([^"]*)"/.exec(html)?.[1])
    .find(value => value !== undefined && value !== base)
  const builtForBase = !strayAssets.length && recorded === undefined
  if (!builtForBase) {
    const evidence = recorded === undefined ? `e.g. ${strayAssets[0]}` : `it was built for ${recorded}`
    fail(
      `assets do not use the base path ${base} (${evidence}); the site was built for a different `
      + `base. Set NUXT_APP_BASE_URL to the same value for \`nuxt generate\` and for this check.`,
    )
  }
  checked.push(`base path ${base}`)

  // 4. nothing non-public leaked into the site
  if (!options.skipLeakCheck) {
    // Each page is stripped to visible text once, not once per entry.
    const text = new Map([...pages].map(([file, html]) => [file, normaliseText(html)]))
    let hidden = 0
    let leaked = 0
    for (const [id, entries] of Object.entries(content.sections)) {
      for (const entry of entries) {
        // Its position in the file, from its id; `entries` is sorted by date.
        const index = Number(entry.id.slice(id.length + 1))
        if (atMost(entry.visibility, 'public')) continue
        hidden += 1
        const fragments = identifyingText(entry)
        let found = false
        for (const [file, body] of text) {
          // One report per entry and page, however many of its forms match.
          const fragment = fragments.find(candidate => body.includes(candidate))
          if (fragment === undefined) continue
          found = true
          fail(
            `content/${id}.yml entry ${index + 1} is marked "${entry.visibility}" but its text appears in `
            + `${relative(outDir, file)}: "${fragment.slice(0, 60)}${fragment.length > 60 ? '…' : ''}".\n`
            + `  Either raise the entry's visibility or stop rendering it on that page`
            + ` (pass --no-leak-check if the match is a coincidence).`,
          )
        }
        if (found) leaked += 1
      }
    }
    checked.push(`${hidden - leaked} of ${hidden} non-public entr(ies) absent from the site`)
  }

  // 5. no asset or link escaped the base path
  //
  // A site served from a subdirectory breaks in a way that is invisible when
  // developing at `/`: a root-relative `src` or `href` points outside the
  // deployment. Anything written in Markdown, front matter or profile.yml goes
  // through the rewriting, so a survivor here means a path vitakit did not see
  // -- typically one hard-coded in a component.
  if (base !== '/' && builtForBase) {
    const escaped = new Set<string>()
    for (const [file, html] of pages) {
      for (const path of urlReferences(html)) {
        if (!underBase(path, base)) escaped.add(`${relative(outDir, file)}: ${path}`)
      }
    }
    for (const problem of escaped) {
      fail(`${problem} does not use the base path ${base}; in a component, use <NuxtLink> or prefix it with useRuntimeConfig().app.baseURL`)
    }
  }
  checked.push(`assets and links use ${base}`)

  // 5b. every link into the site leads somewhere
  //
  // `slides: /slides/talk.pdf` is only right if public/slides/talk.pdf exists,
  // and nothing but the built site can tell: a typo, a file never committed, a
  // page that was renamed. Paths outside the base are step 5's business.
  if (builtForBase) {
    const missing = new Map<string, string>()
    for (const [file, html] of pages) {
      for (const path of urlReferences(html)) {
        if (!underBase(path, base) || missing.has(path)) continue
        if (!(await existsInSite(outDir, path.slice(base.length)))) missing.set(path, relative(outDir, file))
      }
    }
    for (const [path, file] of missing) {
      fail(`${file}: ${path} leads nowhere: no such file or page in the generated site. A file belongs in public/, a page in content/pages/ or app/pages/`)
    }
    checked.push('links into the site lead somewhere')
  }

  // 6. the bibliography was formatted, wherever it is shown
  //
  // Showing publications on the website is a choice: a .bib file may exist
  // only for the PDF. What must not happen is a list that is shown but broken,
  // e.g. with formulas left as placeholders.
  if (content.publications.length) {
    const bibPages = [...pages].filter(([, html]) => html.includes('vita-bib'))
    for (const [file, html] of bibPages) {
      // citation-js-extras' stand-in for a formula while the HTML is sanitized.
      if (/bibmathplaceholderx*\d+end/i.test(html)) fail(`${relative(outDir, file)}: a formula in the bibliography was not rendered`)
    }
    checked.push(bibPages.length
      ? `bibliography on ${bibPages.length} page(s)`
      : 'bibliography not shown on any page (fine if publications.bib is only for the PDF)')
  }

  return { checked, failures }
}

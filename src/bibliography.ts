/**
 * BibTeX -> the publication lists of `content/publication-lists.yml`,
 * formatted and linked, at build time.
 *
 * The formatting itself is @behackl/citation-js-extras: title links, badges,
 * identifiers printed once, eprint fields, DOI spellings and formulas kept
 * through the style. What is left here is vitakit's part:
 *
 *   1. selecting each list (`publication-lists.ts`), with the custom `status`
 *      field as `schemas/publications.ts` defines it; the field only survives
 *      citation-js when declared in `customFields`
 *   2. sanitizing, while formulas are still placeholders, so that KaTeX
 *      markup survives; `defaultSchema` allows `className` only per tag with
 *      an explicit value list, so allowed classes must be merged into it
 *   3. links to files in `public/`, which do not go through the Markdown
 *      rewriting and need the deployment base path added here
 *   4. entries as data: each group is formatted in one pass (numbering, year
 *      suffixes) and split into its entries, with badges as data, so that
 *      `VitaPublication` lays out one entry and can be ejected on its own
 */
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { resolveAsset } from './assets'
import { Bibliography, type BibEntry, type FormatOptions } from '@behackl/citation-js-extras'
import { unified } from 'unified'
import rehypeParse from 'rehype-parse'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import type { Root } from 'hast'
import { prefixRootRelative, type Renderer } from './render'
import { fail, importProjectModule, Issues } from './issues'
import { resolvePublications, type PublicationsSchema } from './publications'
import { LISTS_FILE, publicationStatus, selectPublications, type PublicationListOptions } from './publication-lists'
import packageDefaults from './schemas/publications'
import type { Publication, PublicationList } from './shared/types'

/** The package's settings for publications: `src/schemas/publications.ts`. */
export const defaultPublications: PublicationsSchema = resolvePublications(packageDefaults, undefined, 'src/schemas/publications.ts')

/**
 * A project's `schemas/publications.ts`, validated, or the defaults. Loaded
 * like a section schema: the modification time is part of the import URL, so
 * that an edit takes effect without restarting the dev server.
 */
export async function loadPublicationsSchema(rootDir: string): Promise<PublicationsSchema> {
  const where = 'schemas/publications.ts'
  const path = join(rootDir, where)
  const stats = await stat(path).catch(() => undefined)
  if (!stats) return defaultPublications

  const module = await importProjectModule(path, stats.mtimeMs, where)
  if (module.default === undefined) {
    fail(where, 'must export the settings as its default export: `export default publications({ ... })`')
  }

  const schema = resolvePublications(module.default, defaultPublications, where)
  // A style path is relative to the project, not to wherever the process runs;
  // a bare name (`apa`) is a built-in style.
  return schema.cslStyle && /\.csl$/i.test(schema.cslStyle) && !isAbsolute(schema.cslStyle)
    ? { ...schema, cslStyle: resolve(rootDir, schema.cslStyle) }
    : schema
}

type AttributeRule = string | [string, ...(string | number | boolean)[]]

/**
 * Allow extra class names on a tag. `defaultSchema` permits `className` only
 * with an explicit value list per tag, and that per-tag rule wins over anything
 * added under `'*'` -- so values must be merged into the existing entry.
 */
function allowClasses(tag: string, ...classNames: string[]): AttributeRule[] {
  const rules = [...((defaultSchema.attributes?.[tag] ?? []) as AttributeRule[])]
  const index = rules.findIndex(rule => Array.isArray(rule) && rule[0] === 'className')
  const existing = index === -1 ? [] : (rules[index] as string[]).slice(1)
  const merged: AttributeRule = ['className', ...existing, ...classNames]
  if (index === -1) rules.push(merged)
  else rules[index] = merged
  return rules
}

/**
 * Everything else is stripped. Kept are the `div` classes citeproc writes for
 * `display` in a style -- a numbered style's number (`csl-left-margin`) and
 * the lines of a style that uses `display="block"` -- without which an ejected
 * or Zotero style could not be laid out with CSS, and the citation key on
 * each item, by which the list is split into entries. Fixed values only,
 * never taken from the .bib file.
 */
const sanitizer = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, {
    ...defaultSchema,
    attributes: {
      ...defaultSchema.attributes,
      li: [...(defaultSchema.attributes?.li ?? []), 'dataCslEntryId'],
      div: allowClasses('div', 'csl-block', 'csl-left-margin', 'csl-right-inline', 'csl-indent'),
      // citeproc uses these fixed styles for formatting without semantic tags,
      // e.g. upright emphasis within an italic title. Never allow arbitrary CSS.
      span: [...(defaultSchema.attributes?.span ?? []), ['style',
        'font-style:normal;', 'font-variant:small-caps;', 'font-variant:normal;',
        'font-weight:normal;', 'text-decoration:none;', 'text-decoration:underline;',
      ]],
    },
  })
  .use(rehypeStringify)

const parser = unified().use(rehypeParse, { fragment: true })
const serializer = unified().use(rehypeStringify)

/**
 * The inner HTML of each item of a formatted list, by citation key. A group is
 * formatted in one call, so that numbering and year suffixes (2024a, 2024b)
 * are right, and split here into its entries.
 */
function splitList(html: string): Map<string, string> {
  const items = new Map<string, string>()
  for (const list of parser.parse(html).children) {
    if (list.type !== 'element') continue
    for (const item of list.children) {
      if (item.type !== 'element' || item.tagName !== 'li') continue
      const inner: Root = { type: 'root', children: item.children }
      items.set(String(item.properties.dataCslEntryId), serializer.stringify(inner).trim())
    }
  }
  return items
}

/**
 * Bundled default style: a numeric style for mathematics with linked titles.
 * `content/publications.csl` replaces it (`vitakit eject publications.csl`
 * starts from a copy); so does the `cslStyle` option.
 */
export const defaultCslStyle: string = join(resolveAsset('styles'), 'vitakit-math.csl')

/**
 * The project's own style: a `.csl` file next to the `.bib` file with the same
 * name, i.e. `content/publications.csl`.
 */
export function projectCslStyle(bibPath: string): string | undefined {
  const path = bibPath.replace(/\.bib$/i, '.csl')
  return path !== bibPath && existsSync(path) ? path : undefined
}

/**
 * Readable genres for the BibTeX entry types citation-js leaves as they are,
 * which would otherwise appear verbatim: "My thesis, phdthesis, TU Graz".
 */
const GENRES: Record<string, string> = {
  phdthesis: 'PhD thesis',
  mastersthesis: 'Master\'s thesis',
  mathesis: 'Master\'s thesis',
  techreport: 'Technical report',
}

/** Applied to each variable as citeproc prints it, after the style's text-case. */
const readableGenre: NonNullable<FormatOptions['wrapVariable']> = (html, { variable }) =>
  variable === 'genre' ? GENRES[html.toLowerCase()] ?? html : html

/** The text of a .bib file; a missing one has no entries. */
const readBib = (path: string) => readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') return ''
  throw error
})

/** The entries of a .bib file, for selecting without formatting. */
export async function readBibliography(bibPath: string, schema: PublicationsSchema): Promise<Bibliography> {
  try {
    return new Bibliography({ data: await readBib(bibPath), customFields: ['status', ...schema.fields], preserveMath: true })
  } catch (error) {
    throw new Error(`${bibPath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

/**
 * Every list, selected from `bibPath` and formatted; a missing file has no
 * publications. `baseURL` is where the site is served, as for the Markdown
 * renderer: a root-relative link in the .bib file (`url = {/papers/x.pdf}`, a
 * file in `public/`) gets it prepended.
 */
export async function loadPublications(
  bibPath: string,
  renderer: Renderer,
  schema: PublicationsSchema,
  lists: Record<string, PublicationListOptions>,
  baseURL = '/',
  issues = new Issues(true),
): Promise<Record<string, PublicationList>> {
  const { statuses, fields } = schema
  const prefix = baseURL.replace(/\/$/, '')
  const withFile = (error: unknown) =>
    new Error(`${bibPath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  let bib: Bibliography
  try {
    bib = new Bibliography({
      data: await readBib(bibPath),
      cslStyle: schema.cslStyle ?? projectCslStyle(bibPath) ?? defaultCslStyle,
      // Only fields listed here survive the citation-js pipeline; they then
      // appear as `entry.custom.<field>`. Badges and lists read the raw fields.
      customFields: ['status', ...fields],
      preserveMath: true,
      // Defaults for every formatHtml call below.
      badges: schema.badges,
      sanitize: html => String(sanitizer.processSync(html)),
      wrapVariable: readableGenre,
      linkAttributes: link => ({ href: prefixRootRelative(link.url, prefix) }),
    })
  } catch (error) {
    throw withFile(error)
  }

  const statusOf = (entry: BibEntry) => publicationStatus(entry, schema)
  const known = new Set(statuses.map(status => status.id))
  const unknown = bib.entries.filter(entry => !known.has(statusOf(entry)))
  if (unknown.length) {
    throw new Error(
      `${bibPath}: unknown status ${[...new Set(unknown.map(statusOf))].join(', ')} `
      + `on ${unknown.map(entry => entry.key).join(', ')}; expected one of ${[...known].join(', ')}`
      + ' (statuses are defined in schemas/publications.ts)',
    )
  }

  /** One group, formatted in one pass and split into its entries. */
  const format = (entries: BibEntry[]): Publication[] => {
    let items: Map<string, string>
    try {
      items = splitList(bib.formatHtml(entries, {
        // Badges are data (`Publication.badges`), laid out by the component.
        appendBadges: false,
        // Inserted after sanitizing. citation-js-extras names the citation key
        // when a formula cannot be rendered; the file is added by withFile.
        renderMath: (tex, { display }) => display ? renderer.markdown(`$$${tex}$$`) : renderer.inline(`$${tex}$`),
      }))
    } catch (error) {
      throw withFile(error)
    }
    return entries.map((entry): Publication => {
      const html = items.get(entry.key)
      if (html === undefined) throw new Error(`${bibPath}: ${entry.key} is missing from the formatted list`)
      const { title, badges } = bib.links(entry)
      return {
        key: entry.key,
        html,
        ...(title ? { titleUrl: prefixRootRelative(title.url, prefix) } : {}),
        fields: Object.fromEntries(fields
          .filter(field => entry.custom[field] !== undefined)
          .map(field => [field, entry.custom[field]!])),
        badges: badges.map(badge => ({
          field: badge.field,
          value: badge.value,
          label: badge.label,
          url: prefixRootRelative(badge.url, prefix),
          ...(badge.className ? { className: badge.className } : {}),
        })),
      }
    })
  }

  const result: Record<string, PublicationList> = {}
  for (const [name, list] of Object.entries(lists)) {
    // While developing, a mistake in one list empties that one only.
    result[name] = await issues.attempt(LISTS_FILE, () => {
      const groups = selectPublications(bib, name, list, schema).map((group, index) => ({
        id: `${name}-${index + 1}`,
        ...(group.label !== undefined ? { label: group.label } : {}),
        count: group.entries.length,
        entries: format(group.entries),
      }))
      return { count: groups.reduce((sum, group) => sum + group.count, 0), groups }
    }, { count: 0, groups: [] })
  }
  return result
}

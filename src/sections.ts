/**
 * Section discovery: `content/<name>.yml` is a section, and its schema is found
 * by convention.
 *
 *   1. `schemas/<name>.ts` in the user's repo wins, if present
 *   2. otherwise the built-in schema for `<name>` is used
 *   3. otherwise the build fails, naming the file and printing a starter snippet
 *
 * There is deliberately no registry and no config file: the file name is the
 * wiring.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { schemas } from './schemas'
import { fail, formatZodIssues, importProjectModule } from './issues'
import { renderRichFields } from './rich'
import { resolveSitePaths } from './site-paths'
import { atMost } from './shared/visibility'
import type { Renderer } from './render'
import type { Entry, Visibility } from './shared/types'

const RESERVED = new Set(['site', 'profile'])

export interface SectionSource {
  /** Section id, e.g. `talks`. */
  id: string
  /** Absolute path of the YAML file. */
  file: string
  /** Where the schema came from, for error messages. */
  schemaOrigin: 'built-in' | 'repo'
  schema: z.ZodType
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(() => true, () => false)
}

/** Load a user-provided schema module, tolerating both default and named export. */
async function loadRepoSchema(path: string, id: string): Promise<z.ZodType> {
  const { mtimeMs } = await stat(path)
  const module = await importProjectModule(path, mtimeMs, `schemas/${id}.ts`)
  const schema = module.default ?? module.schema
  if (!schema || typeof (schema as z.ZodType).safeParse !== 'function') {
    fail(`schemas/${id}.ts`, 'must export a Zod schema as its default export')
  }
  return schema as z.ZodType
}

const STARTER = (id: string) => `create schemas/${id}.ts, for example:

  import { z, section, dateRange } from '@anja.codes/vitakit'

  export default section({
    date: dateRange,
    title: z.string(),
  })`

/** Find every section file in `content/` and pair it with a schema. */
export async function discoverSections(rootDir: string): Promise<SectionSource[]> {
  const contentDir = join(rootDir, 'content')
  const schemaDir = join(rootDir, 'schemas')

  const files = (await readdir(contentDir).catch(() => fail('content/', 'directory is missing')))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()

  const sources: SectionSource[] = []
  for (const file of files) {
    const id = file.replace(/\.ya?ml$/, '')
    if (RESERVED.has(id)) continue

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
      fail(`content/${file}`, 'file name must be lowercase kebab-case, e.g. `research-stays.yml`')
    }

    const override = join(schemaDir, `${id}.ts`)
    if (await exists(override)) {
      sources.push({ id, file: join(contentDir, file), schemaOrigin: 'repo', schema: await loadRepoSchema(override, id) })
      continue
    }

    const builtin = schemas[id as keyof typeof schemas]
    if (!builtin) fail(`content/${file}`, `no schema for this file; ${STARTER(id)}`)

    sources.push({ id, file: join(contentDir, file), schemaOrigin: 'built-in', schema: builtin })
  }

  return sources
}

/** Compare two entries by date, newest first; undated entries sort last. */
function byDateDesc(a: Entry, b: Entry): number {
  const left = (a.date as { from?: { sortKey: string } } | undefined)?.from?.sortKey
  const right = (b.date as { from?: { sortKey: string } } | undefined)?.from?.sortKey
  if (left === right) return 0
  if (!left) return 1
  if (!right) return -1
  return right.localeCompare(left)
}

export interface LoadSectionOptions {
  /** Highest visibility level to include. `public` for the website. */
  maxVisibility: Visibility
  renderer: Renderer
  /**
   * How a path on the site (`/slides/talk.pdf`) becomes a link; see
   * `site-paths.ts`. Left as it is by default.
   */
  resolvePath?: (path: string) => string
}

/** Read, validate, filter and sort one section file. */
export async function loadSection(source: SectionSource, options: LoadSectionOptions): Promise<Entry[]> {
  const where = `content/${source.id}.yml`
  const raw = await readFile(source.file, 'utf8')

  let data: unknown
  try {
    data = parseYaml(raw)
  } catch (error) {
    fail(where, error instanceof Error ? error.message : String(error))
  }

  if (data === null) return []
  if (!Array.isArray(data)) fail(where, 'expected a list of entries')

  const parsed = (source.schema as z.ZodType).safeParse(data)
  if (!parsed.success) {
    const origin = source.schemaOrigin === 'repo' ? ` (schema: schemas/${source.id}.ts)` : ''
    fail(where, `invalid${origin}\n${formatZodIssues(parsed.error)}`)
  }

  return (parsed.data as Entry[])
    // Errors name an entry by its position in the file, before filtering.
    .map((item, index) => ({ item: { ...item, id: `${source.id}-${index}` }, index }))
    .filter(({ item }) => atMost(item.visibility, options.maxVisibility))
    .map(({ item, index }) => renderRichFields(item, options.renderer, String(index), where) as Entry)
    .map(item => resolveSitePaths(item, options.resolvePath ?? (path => path)) as Entry)
    .sort(byDateDesc)
}

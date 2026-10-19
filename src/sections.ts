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

/**
 * File names in `content/` that are not sections. `profile.yml` is the profile;
 * `site` is kept free for site-wide settings.
 */
export const RESERVED_SECTION_NAMES: ReadonlySet<string> = new Set(['site', 'profile'])

/** Section names are file names: lowercase kebab-case. */
export const SECTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Why `id` cannot be a section name, or `undefined` when it can. Shared by
 * discovery and by the CLI, so that a section the CLI creates is one the
 * loader finds.
 */
export function sectionNameProblem(id: string): string | undefined {
  if (RESERVED_SECTION_NAMES.has(id)) return `"${id}" is reserved and cannot be a section`
  if (!SECTION_NAME.test(id)) return `"${id}" must be lowercase kebab-case, e.g. research-stays`
  return undefined
}

/** A `content/<id>.yml` (or `.yaml`) file, before its schema is resolved. */
export interface SectionFile {
  id: string
  /** Absolute path of the YAML file. */
  file: string
  /** Path relative to the project root, for messages: `content/talks.yml`. */
  where: string
}

export interface SectionSource extends SectionFile {
  /** Where the schema came from, for error messages. */
  schemaOrigin: 'built-in' | 'repo'
  schema: z.ZodType
}

/** A section file that could not become a source, with the reason. */
export interface SectionFileProblem {
  where: string
  message: string
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

  import { section, dateRange, richText, text } from '@anja.codes/vitakit'

  export default section({
    date: dateRange,
    title: richText,
    note: text.optional(),
  })`

/**
 * Find the section files in `content/`, without loading any schema.
 *
 * Problems that concern one file -- a name that cannot be a section, the same
 * section as both `.yml` and `.yaml` -- are returned per file, so that callers
 * can report them without losing the other sections.
 */
export async function findSectionFiles(rootDir: string): Promise<{ files: SectionFile[], problems: SectionFileProblem[] }> {
  const contentDir = join(rootDir, 'content')
  const names = (await readdir(contentDir).catch(() => fail('content/', 'directory is missing')))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()

  const byId = new Map<string, string[]>()
  for (const name of names) {
    const id = name.replace(/\.ya?ml$/, '')
    if (RESERVED_SECTION_NAMES.has(id)) continue
    byId.set(id, [...(byId.get(id) ?? []), name])
  }

  const files: SectionFile[] = []
  const problems: SectionFileProblem[] = []
  for (const [id, found] of byId) {
    const where = `content/${found[0]}`
    if (found.length > 1) {
      problems.push({ where, message: `the section "${id}" exists twice (${found.join(', ')}); keep one of them` })
      continue
    }
    if (!SECTION_NAME.test(id)) {
      problems.push({ where, message: 'file name must be lowercase kebab-case, e.g. `research-stays.yml`' })
      continue
    }
    files.push({ id, file: join(contentDir, found[0]!), where })
  }
  return { files, problems }
}

/** Pair one section file with its schema: the repo's, else the built-in one. */
export async function resolveSectionSchema(rootDir: string, file: SectionFile): Promise<SectionSource> {
  const override = join(rootDir, 'schemas', `${file.id}.ts`)
  if (await exists(override)) {
    return { ...file, schemaOrigin: 'repo', schema: await loadRepoSchema(override, file.id) }
  }

  const builtin = schemas[file.id as keyof typeof schemas]
  if (!builtin) fail(file.where, `no schema for this file; ${STARTER(file.id)}`)
  return { ...file, schemaOrigin: 'built-in', schema: builtin }
}

/**
 * Find every section file in `content/` and pair it with a schema. Strict:
 * the first problem throws. Use `findSectionFiles` and `resolveSectionSchema`
 * to report problems per section instead.
 */
export async function discoverSections(rootDir: string): Promise<SectionSource[]> {
  const { files, problems } = await findSectionFiles(rootDir)
  if (problems.length) fail(problems[0]!.where, problems[0]!.message)
  const sources: SectionSource[] = []
  for (const file of files) sources.push(await resolveSectionSchema(rootDir, file))
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
  const where = source.where
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
    .map((item, index) => ({ ...item, id: `${source.id}-${index}` }))
    .filter(item => atMost(item.visibility, options.maxVisibility))
    .map((item, index) => renderRichFields(item, options.renderer, String(index), where))
    .map(item => resolveSitePaths(item, options.resolvePath ?? (path => path)) as Entry)
    .sort(byDateDesc)
}

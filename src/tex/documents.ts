/**
 * Documents: one PDF, described by a `.tex` file the user owns and an optional
 * `.yml` beside it.
 *
 * The split is deliberate (see `docs/cv-documents.md`):
 *   `<name>.tex`  in what order things appear -- moving a line moves a section
 *   `<name>.yml`  what goes in them -- filters, limits, visibility
 *
 * A document without a `.yml` uses the defaults, so the simple case is one file.
 */
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { fail, formatZodIssues, messageOf } from '../issues'
import type { SectionSource } from '../sections'
import { atMost } from '../shared/visibility'
import { fieldValue, filterWhere } from '../shared/select'
import type { Entry, Visibility } from '../shared/types'

/**
 * Per-section selection for one document.
 *
 * Deliberately declarative: field equality, a year window, a count. An earlier
 * version accepted a small query language (`kind = invited and year >= 2020`),
 * which meant a parser, an operator table and its own error messages for cases
 * nobody had. Anything more selective than this belongs in a hand-written
 * `.tex` or an ejected template, which is the project's normal answer to
 * "I want something specific".
 */
const whereScalar = z.union([z.string(), z.number(), z.boolean()])

const sectionOptions = z.strictObject({
  /**
   * Keep entries whose field equals the value, or one of several values:
   *
   * ```yaml
   * where: { kind: invited }
   * where: { kind: [invited, seminar] }
   * ```
   */
  where: z.record(z.string(), z.union([whereScalar, z.array(whereScalar).min(1)])).default({}),
  /** Keep only the newest N entries. */
  limit: z.number().int().positive().optional(),
  /** Drop entries starting before this year. */
  since: z.number().int().optional(),
  /** Drop entries starting after this year. */
  until: z.number().int().optional(),
  /** Heading used by `\vitasection`; overrides the shared preamble's label. */
  title: z.string().min(1).optional(),
})

export const documentSchema = z.strictObject({
  /**
   * Highest visibility level this document may include. Defaults to `cv`,
   * because a CV is the reason the `cv` level exists; use `private` for an
   * application containing a cover letter, address or referees.
   *
   * There is no "publish this PDF" option: PDFs are never part of the website
   * build (see `vitakit-check`), and the website renders CV data directly.
   */
  visibility: z.enum(['public', 'cv', 'private']).default('cv'),
  sections: z.record(z.string(), sectionOptions).default({}),
  publications: z.strictObject({
    groups: z.array(z.string()).optional(),
  }).default({}),
})

export type DocumentOptions = z.infer<typeof documentSchema>

export interface DocumentSource {
  /** Base name, e.g. `cv` for `cv-tex/cv.tex`. */
  name: string
  texFile: string
  options: DocumentOptions
}

const DEFAULTS: DocumentOptions = documentSchema.parse({})

/** Read every `cv-tex/*.tex` and its options. */
export async function discoverDocuments(cvDir: string): Promise<DocumentSource[]> {
  const files = (await readdir(cvDir).catch(() => fail('cv-tex/', 'directory is missing')))
    .filter(name => name.endsWith('.tex'))
    .sort()

  const documents: DocumentSource[] = []
  for (const file of files) {
    const name = basename(file, '.tex')
    // `preamble.tex` and friends are inputs, not documents.
    const source = await readFile(join(cvDir, file), 'utf8')
    if (!/\\begin\{document\}/.test(source)) continue

    const optionsFile = join(cvDir, `${name}.yml`)
    const raw = await readFile(optionsFile, 'utf8').catch(() => undefined)
    let options = DEFAULTS
    if (raw !== undefined) {
      let data: unknown
      try {
        data = parseYaml(raw)
      } catch (error) {
        fail(`cv-tex/${name}.yml`, messageOf(error))
      }
      const parsed = documentSchema.safeParse(data ?? {})
      if (!parsed.success) fail(`cv-tex/${name}.yml`, `invalid\n${formatZodIssues(parsed.error)}`)
      options = parsed.data
    }
    documents.push({ name, texFile: join(cvDir, file), options })
  }

  if (!documents.length) fail('cv-tex/', 'no .tex file contains \\begin{document}')
  return documents
}

/** Check filter names against schemas, including fields absent from all entries. */
export function validateDocumentSections(document: DocumentSource, sources: SectionSource[]): void {
  const where = `cv-tex/${document.name}.yml`
  const sections = new Map(sources.map(source => [source.id, source.schema]))
  for (const [id, options] of Object.entries(document.options.sections)) {
    const schema = sections.get(id)
    if (!schema) fail(where, `sections.${id}: unknown section; the sections are ${[...sections.keys()].join(', ') || '(none)'}`)

    // section() and extendSection() produce arrays of objects. Do not infer
    // fields from entries: optional fields and empty collections are valid.
    if (schema instanceof z.ZodArray && schema.element instanceof z.ZodObject) {
      const fields = new Set(['year', ...Object.keys(schema.element.shape)])
      for (const field of Object.keys(options.where)) {
        if (!fields.has(field)) {
          fail(where, `sections.${id}.where.${field}: unknown field; the fields are ${[...fields].join(', ')}`)
        }
      }
    }
  }
}

/** Select the entries of one section for one document. */
export function selectEntries(
  entries: Entry[],
  options: DocumentOptions,
  sectionId: string,
): Entry[] {
  const section = options.sections[sectionId] ?? { where: {} }

  let result = entries.filter(entry => atMost(entry.visibility as Visibility | undefined, options.visibility))

  if (section.since !== undefined) {
    result = result.filter(entry => Number(fieldValue(entry, 'year') ?? 0) >= section.since!)
  }
  if (section.until !== undefined) {
    result = result.filter(entry => Number(fieldValue(entry, 'year') ?? Infinity) <= section.until!)
  }
  result = filterWhere(result, section.where)

  return section.limit ? result.slice(0, section.limit) : result
}

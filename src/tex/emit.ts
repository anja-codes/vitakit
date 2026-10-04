/**
 * Renders validated content into `.tex` files, one per section per document.
 *
 * Templates are Eta with `<% %>` tags. Two rules make them safe to write:
 *
 *   - every helper (`tex`, `rich`, `date`, `inst`, `url`) escapes its input
 *   - `<%~ %>` is used because the helpers have already escaped; raw
 *     interpolation of unescaped data is not possible through the helper API
 *
 * A user overrides any template by dropping a file of the same name into
 * `cv-tex/templates/`.
 */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Eta } from 'eta'
import { resolveAsset } from '../assets'
import { escapeRichTex, escapeTex, escapeUrl } from './escape'
import { formatDateRange } from '../shared/format'
import { entrySecondaryParts, entryTitleField } from '../shared/entry'
import { richSource } from '../shared/rich'
import { fail } from '../issues'
import { isSitePath } from '../site-paths'
import { selectEntries, type DocumentOptions } from './documents'
import type { DateRange, Entry, Institution, Link, PublicationGroup } from '../shared/types'

/** `tex/` in the installed package: templates and the document class. */
export const bundledTexDir: string = resolveAsset('tex')

const eta = new Eta({ autoEscape: false, autoTrim: [false, false] })

/**
 * Remove the blank lines that template control flow leaves behind.
 *
 * A blank line inside a list item starts a new paragraph, after which a `\\`
 * continuation fails with "There's no line here to end" -- so this is
 * correctness, not cosmetics.
 */
function tidy(body: string): string {
  return body.replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n').trim()
}

/**
 * Why a path on the site cannot be linked from the PDF: `/slides/talk.pdf`
 * only means something next to the website.
 */
export const SITE_PATH_HELP = 'is a path on the website, and the PDF can only link it with the address the '
  + 'site is published at: add it to content/profile.yml, e.g. `url: https://jane.example.org/`'

/**
 * Anything a template is allowed to interpolate, all escaping included.
 * `where` names the generated file, `source` the content file behind it.
 */
function helpers(where: string, source: string) {
  const tex = (value: unknown): string =>
    value === undefined || value === null ? '' : escapeTex(String(value))

  const rich = (value: unknown): string => {
    if (value === undefined || value === null) return ''
    // Rich fields reach LaTeX as their Markdown source, formulas included.
    const source = richSource(value)
    try {
      return escapeRichTex(source)
    } catch (error) {
      return fail(where, error instanceof Error ? error.message : String(error))
    }
  }

  /** The target of `\href`. A path on the site is absolute here if `profile.url` is set. */
  const href = (value: string): string => {
    if (isSitePath(value)) fail(source, `${value} ${SITE_PATH_HELP}`)
    return escapeUrl(value)
  }

  const url = (value: unknown): string => (value ? href(String(value)) : '')

  const inst = (value: unknown): string => {
    const institution = value as Institution | undefined
    if (!institution?.name) return ''
    return institution.url
      ? `\\href{${href(institution.url)}}{${escapeTex(institution.name)}}`
      : escapeTex(institution.name)
  }

  const linkOrText = (value: unknown): string => {
    if (typeof value === 'string') return escapeTex(value)
    const item = value as Link | undefined
    if (!item?.label) return ''
    return item.url ? `\\href{${href(item.url)}}{${escapeTex(item.label)}}` : escapeTex(item.label)
  }

  const date = (value: unknown): string => escapeTex(formatDateRange(value as DateRange | undefined))

  /** Teaching entries prefer the term label over the date. */
  const term = (entry: Entry): string =>
    typeof entry.term === 'string' ? escapeTex(entry.term) : date(entry.date)

  // Field selection is shared with the website (shared/entry.ts) so the PDF and
  // the page cannot disagree about what an entry's headline is.
  const titleOf = (entry: Entry): unknown => {
    const field = entryTitleField(entry)
    return field ? entry[field] : ''
  }

  const secondaryOf = (entry: Entry): string =>
    entrySecondaryParts(entry, entryTitleField(entry))
      .map(part => (part.kind === 'institution' ? inst(part.institution) : escapeTex(part.text)))
      .filter(Boolean)
      .join(', ')

  /**
   * `\vitabibgroup{id}{keys}`: the check that selects one publication group by
   * citation key. Keys are compared as strings, never typeset, so only the
   * characters that would break the argument itself are refused.
   */
  const bibgroup = (group: PublicationGroup): string => {
    const unsafe = /[\s%#\\{},~]/
    const bad = [group.id, ...group.entries.map(entry => entry.key)].find(value => !value || unsafe.test(value))
    if (bad !== undefined) {
      fail(where, `"${bad}" cannot be used as a citation key or group id in LaTeX; use letters, digits and - _ : . / +`)
    }
    return `\\vitabibgroup{${group.id}}{${group.entries.map(entry => entry.key).join(',')}}`
  }

  return { tex, rich, url, inst, linkOrText, date, term, titleOf, secondaryOf, bibgroup }
}

async function resolveTemplate(id: string, userDir: string): Promise<{ path: string, source: string }> {
  // A file in the repo always wins over the package default; falling back to
  // `_generic.eta` is intended for sections that have no dedicated template.
  const candidates = [join(userDir, `${id}.eta`), join(bundledTexDir, 'templates', `${id}.eta`), join(bundledTexDir, 'templates', '_generic.eta')]
  for (const path of candidates) {
    if (existsSync(path)) return { path, source: await readFile(path, 'utf8') }
  }
  throw new Error(`vitakit: no template for section ${id}`)
}

/**
 * Fail on an override that matches no section.
 *
 * Without this, `cv-tex/templates/talk.eta` (for the `talks` section) is simply
 * never read: the build succeeds and the PDF silently uses the generic layout.
 */
async function assertTemplatesAreUsed(templateDir: string, ids: string[]): Promise<void> {
  const files = await readdir(templateDir).catch(() => [] as string[])
  const known = new Set([...ids, 'publications', '_generic'])

  for (const file of files.filter(name => name.endsWith('.eta')).sort()) {
    const id = file.slice(0, -'.eta'.length)
    if (known.has(id)) continue
    const suggestion = ids.find(candidate => candidate.startsWith(id) || id.startsWith(candidate))
    fail(
      `cv-tex/templates/${file}`,
      `no section is called "${id}", so this template is never used`
      + `${suggestion ? `; did you mean ${suggestion}.eta?` : ''}`
      + `\n  sections: ${ids.join(', ') || '(none)'}`,
    )
  }
}

export interface EmitOptions {
  sections: Record<string, Entry[]>
  publications: PublicationGroup[]
  options: DocumentOptions
  /** `cv-tex/templates/`, where user overrides live. */
  templateDir: string
  /** `cv-tex/generated/<document>/`. */
  outDir: string
  /** `profile.url`: where the website is published, for links to paths on it. */
  siteUrl?: string
  /** Path of the .bib file, relative to the generated directory. */
  bibPath?: string
}

/** Write one `.tex` file per section, plus `publications.tex`. */
export async function emitDocument(emit: EmitOptions): Promise<string[]> {
  await mkdir(emit.outDir, { recursive: true })
  await assertTemplatesAreUsed(emit.templateDir, Object.keys(emit.sections))
  const written: string[] = []

  for (const [id, entries] of Object.entries(emit.sections)) {
    const where = `cv-tex/generated/${id}.tex`
    const selected = selectEntries(entries, emit.options, id)
    const { source } = await resolveTemplate(id, emit.templateDir)

    let body: string
    try {
      body = tidy(eta.renderString(source, { entries: selected, ...helpers(where, `content/${id}.yml`) }))
    } catch (error) {
      throw new Error(`template ${id}.eta: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }

    const file = join(emit.outDir, `${id}.tex`)
    await writeFile(file, `% Generated by vitakit. Do not edit; edit content/${id}.yml instead.\n${body.trim()}\n`)
    written.push(file)
  }

  if (emit.publications.length) {
    const groups = emit.options.publications.groups
      ? emit.options.publications.groups
          .map(id => emit.publications.find(group => group.id === id))
          .filter((group): group is PublicationGroup => group !== undefined)
      : emit.publications
    // biblatex prints the `url` field itself. A path on the site is made
    // absolute by the sourcemap in profile.tex, which needs `profile.url`.
    if (!emit.siteUrl) {
      const local = groups.flatMap(group => group.entries).find(entry => entry.titleUrl && isSitePath(entry.titleUrl))
      if (local) fail('content/publications.bib', `${local.key}: url ${local.titleUrl} ${SITE_PATH_HELP}`)
    }
    const { source } = await resolveTemplate('publications', emit.templateDir)
    const body = tidy(eta.renderString(source, { groups, ...helpers('publications.tex', 'content/publications.bib') }))
    const file = join(emit.outDir, 'publications.tex')
    await writeFile(file, `% Generated by vitakit. Do not edit; edit content/publications.bib instead.\n${body.trim()}\n`)
    written.push(file)
  }

  return written
}

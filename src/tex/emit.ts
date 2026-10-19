/**
 * Renders validated content into `.tex` files, one per section per document.
 *
 * Templates use `<% %>` for JavaScript and `<%~ %>` for helper output.
 * Helpers escape data and preserve already-formatted fragments when composed.
 *
 * A user overrides any template by dropping a file of the same name into
 * `cv-tex/templates/`.
 */
import { readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Eta } from 'eta'
import { resolveAsset } from '../assets'
import { createTemplateHelpers, fragment, SITE_PATH_HELP } from './helpers'
import { entrySecondaryParts, entryTitleField } from '../shared/entry'
import { fail } from '../issues'
import { isSitePath } from '../site-paths'
import { selectEntries, type DocumentOptions } from './documents'
import type { Entry, PublicationGroup } from '../shared/types'

export { SITE_PATH_HELP } from './helpers'

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

/** Generic field-selection policy, shared with the website, not formatters. */
function genericHelpers(h: ReturnType<typeof createTemplateHelpers>) {
  return {
    title(entry: Entry) {
      const field = entryTitleField(entry)
      return h.text(field ? entry[field] : undefined)
    },
    context(entry: Entry) {
      return h.join(entrySecondaryParts(entry, entryTitleField(entry))
        .map(part => part.kind === 'institution' ? h.linked(part.institution) : part.text))
    },
  }
}

/** Bibliography-only machinery: select exactly these citation keys. */
function bibgroup(group: PublicationGroup, where: string) {
  const unsafe = /[\s%#\\{},~]/
  const bad = [group.id, ...group.entries.map(entry => entry.key)].find(value => !value || unsafe.test(value))
  if (bad !== undefined) {
    fail(where, `"${bad}" cannot be used as a citation key or group id in LaTeX; use letters, digits and - _ : . / +`)
  }
  return fragment(`\\vitabibgroup{${group.id}}{${group.entries.map(entry => entry.key).join(',')}}`)
}

async function resolveTemplate(id: string, userDir: string): Promise<{ path: string, source: string }> {
  // A file in the repo always wins over the package default; falling back to
  // `_generic.eta` is intended for sections that have no dedicated template.
  const candidates = [
    join(userDir, `${id}.eta`),
    join(bundledTexDir, 'templates', `${id}.eta`),
    join(userDir, '_generic.eta'),
    join(bundledTexDir, 'templates', '_generic.eta'),
  ]
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
    const selected = selectEntries(entries, emit.options, id)
    const { path: templatePath, source } = await resolveTemplate(id, emit.templateDir)
    const h = createTemplateHelpers(templatePath, `content/${id}.yml`)

    let body: string
    try {
      body = tidy(eta.renderString(source, { entries: selected, ...h, generic: genericHelpers(h) }))
    } catch (error) {
      throw new Error(`template ${id}.eta: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }

    const file = join(emit.outDir, `${id}.tex`)
    await writeFile(file, `% Generated by vitakit. Do not edit; edit content/${id}.yml instead.\n${body.trim()}\n`)
    written.push(file)
  }

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
  const { path: templatePath, source } = await resolveTemplate('publications', emit.templateDir)
  const body = tidy(eta.renderString(source, {
    groups,
    ...createTemplateHelpers(templatePath, 'content/publications.bib'),
    bib: { group: (group: PublicationGroup) => bibgroup(group, templatePath) },
  }))
  const file = join(emit.outDir, 'publications.tex')
  await writeFile(file, `% Generated by vitakit. Do not edit; edit content/publications.bib instead.\n${body.trim()}\n`)
  written.push(file)

  // Keep latexmk's cache, but never let a removed source survive as stale TeX.
  // profile.tex is written by the build, not by this emitter.
  const current = new Set(['profile.tex', ...written.map(file => basename(file))])
  for (const file of await readdir(emit.outDir)) {
    if (file.endsWith('.tex') && !current.has(file)) await rm(join(emit.outDir, file))
  }

  return written
}

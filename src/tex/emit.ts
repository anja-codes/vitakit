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
import type { Entry, PublicationGroup, PublicationList } from '../shared/types'

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
        .map(part => part.kind === 'linked' ? h.linked(part.linked) : part.text))
    },
  }
}

/** Citation keys and group ids go into LaTeX as they are. */
function texSafe(values: string[], where: string): void {
  const bad = values.find(value => !value || /[\s%#\\{},~]/.test(value))
  if (bad !== undefined) {
    fail(where, `"${bad}" cannot be used as a citation key or group id in LaTeX; use letters, digits and - _ : . / +`)
  }
}

/** Bibliography-only machinery: cite a list's keys in order, select a group's. */
function bibHelpers(list: PublicationList, where: string) {
  return {
    cite() {
      const keys = list.groups.flatMap(group => group.entries.map(entry => entry.key))
      texSafe(keys, where)
      return fragment(`\\nocite{${keys.join(',')}}`)
    },
    group(group: PublicationGroup) {
      texSafe([group.id, ...group.entries.map(entry => entry.key)], where)
      return fragment(`\\vitabibgroup{${group.id}}{${group.entries.map(entry => entry.key).join(',')}}`)
    },
  }
}

/** Where a template came from, in the order they are tried. */
export interface ResolvedTemplate {
  path: string
  source: string
  /** `local` is in `cv-tex/templates/`, `bundled` is the package's own. */
  origin: 'local' | 'bundled'
  /** Whether this is `_generic.eta` rather than a template named for the section. */
  generic: boolean
}

/**
 * The template that renders section `id`. A file in the repo always wins over
 * the package default; `_generic.eta` is the fallback for sections without a
 * dedicated template. `exclude` skips one path, so that replacing a local
 * template can start from whatever would be used without it.
 */
export async function resolveTemplate(id: string, userDir: string, { exclude }: { exclude?: string } = {}): Promise<ResolvedTemplate> {
  const candidates: Omit<ResolvedTemplate, 'source'>[] = [
    { path: join(userDir, `${id}.eta`), origin: 'local', generic: false },
    { path: join(bundledTexDir, 'templates', `${id}.eta`), origin: 'bundled', generic: false },
    { path: join(userDir, '_generic.eta'), origin: 'local', generic: true },
    { path: join(bundledTexDir, 'templates', '_generic.eta'), origin: 'bundled', generic: true },
  ]
  for (const candidate of candidates) {
    if (candidate.path === exclude) continue
    if (existsSync(candidate.path)) return { ...candidate, source: await readFile(candidate.path, 'utf8') }
  }
  throw new Error(`vitakit: no template for section ${id}`)
}

/**
 * Fail on an override that matches no section.
 *
 * Without this, `cv-tex/templates/talk.eta` (for the `talks` section) is simply
 * never read: the build succeeds and the PDF silently uses the generic layout.
 */
export async function assertTemplatesAreUsed(templateDir: string, ids: string[]): Promise<void> {
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
  /** The publication lists the document shows, by name. */
  publications: Record<string, PublicationList>
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

/**
 * Render one section with its effective template, without writing anything.
 * `entries` are all loaded entries; the document's selection is applied here.
 */
export async function renderSection(
  id: string,
  entries: Entry[],
  options: DocumentOptions,
  templateDir: string,
): Promise<string> {
  const selected = selectEntries(entries, options, id)
  const { path: templatePath, source } = await resolveTemplate(id, templateDir)
  const h = createTemplateHelpers(templatePath, `content/${id}.yml`)
  try {
    return tidy(eta.renderString(source, { entries: selected, ...h, generic: genericHelpers(h) }))
  } catch (error) {
    throw new Error(`template ${id}.eta: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

/** Render one publication list, without writing anything. */
export async function renderPublications(
  list: PublicationList,
  templateDir: string,
  siteUrl?: string,
): Promise<string> {
  // biblatex prints the `url` field itself. A path on the site is made
  // absolute by the sourcemap in profile.tex, which needs `profile.url`.
  if (!siteUrl) {
    const local = list.groups.flatMap(group => group.entries).find(entry => entry.titleUrl && isSitePath(entry.titleUrl))
    if (local) fail('content/publications.bib', `${local.key}: url ${local.titleUrl} ${SITE_PATH_HELP}`)
  }
  const { path: templatePath, source } = await resolveTemplate('publications', templateDir)
  return tidy(eta.renderString(source, {
    groups: list.groups,
    ...createTemplateHelpers(templatePath, 'content/publications.bib'),
    bib: bibHelpers(list, templatePath),
  }))
}

/** Write one `.tex` file per section, and one per publication list in `publications/`. */
export async function emitDocument(emit: EmitOptions): Promise<string[]> {
  await mkdir(emit.outDir, { recursive: true })
  await assertTemplatesAreUsed(emit.templateDir, Object.keys(emit.sections))
  const written: string[] = []

  for (const [id, entries] of Object.entries(emit.sections)) {
    const body = await renderSection(id, entries, emit.options, emit.templateDir)
    const file = join(emit.outDir, `${id}.tex`)
    await writeFile(file, `% Generated by vitakit. Do not edit; edit content/${id}.yml instead.\n${body.trim()}\n`)
    written.push(file)
  }

  // Keep latexmk's cache, but never let a removed source survive as stale TeX.
  // profile.tex is written by the build, not by this emitter.
  const current = new Set(['profile.tex', ...written.map(file => basename(file))])
  for (const file of await readdir(emit.outDir)) {
    if (file.endsWith('.tex') && !current.has(file)) await rm(join(emit.outDir, file))
  }

  const listDir = join(emit.outDir, 'publications')
  await rm(listDir, { recursive: true, force: true })
  await mkdir(listDir)
  for (const [name, list] of Object.entries(emit.publications)) {
    const body = await renderPublications(list, emit.templateDir, emit.siteUrl)
    const file = join(listDir, `${name}.tex`)
    await writeFile(file, `% Generated by vitakit. Do not edit; edit content/publications.bib or content/publication-lists.yml instead.\n${body.trim()}\n`)
    written.push(file)
  }
  return written
}

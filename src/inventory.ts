/**
 * Everything in a project, and what is wrong with it, without failing on the
 * first problem.
 *
 * Built from the framework's own loaders (`loadContent` in lenient mode, the
 * section and document discovery), so that what is reported here is what a
 * build would do. Needs no generated site and no LaTeX.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import { loadContent } from './content'
import { describeSection, type FieldDescription } from './fields'
import { findSectionFiles, resolveSectionSchema, type SectionFile } from './sections'
import { schemas as builtinSchemas } from './schemas'
import { documentSectionProblems, findDocuments, type DocumentOptions } from './tex/documents'
import { documentDirective, findPdfPlacements, findWebPlacements, pageRoute, type PdfPlacement, type WebPlacements } from './placements'
import { messageOf, whereOf } from './issues'
import type { ContentIssue, VitakitContent, Visibility } from './shared/types'

export type Problem = ContentIssue

export interface SectionInventory {
  id: string
  /** `content/talks.yml` or `.yaml`. */
  where: string
  schema: {
    origin: 'built-in' | 'local' | 'none'
    /** `schemas/talks.ts` when local. */
    file?: string
    /** Another section whose schema this one re-exports. */
    sharedWith?: string
    /** Whether a local schema extends the built-in one of the same name. */
    extendsBuiltIn?: boolean
  }
  /** Accepted fields, when the schema loads and has a recognizable shape. */
  fields?: FieldDescription[]
  /** Entries per visibility, when the section is valid. */
  counts?: Record<Visibility, number>
  /** Entries in the file, valid or not, when it is a YAML list. */
  entries?: number
  problems: Problem[]
}

export interface PageInventory {
  route: string
  /** `content/pages/cv.md`. */
  markdown?: string
  /** `app/pages/cv.vue`. */
  vue?: string
  title?: string
  inMenu: boolean
}

export interface DocumentInventory {
  name: string
  /** `cv-tex/cv.tex`. */
  tex: string
  /** `cv-tex/cv.yml`, when present. */
  yml?: string
  options: DocumentOptions
  placements: PdfPlacement[]
  /** `cv-tex/cv.pdf` with its modification time, when built. */
  pdf?: { file: string, mtimeMs: number }
  problems: Problem[]
}

export interface Inventory {
  root: string
  sections: SectionInventory[]
  pages: PageInventory[]
  /** A catch-all Vue page serving the Markdown pages, e.g. `app/pages/[...slug].vue`. */
  catchAll?: string
  publications?: { file: string, entries: number, groups: number }
  documents: DocumentInventory[]
  web: WebPlacements
  /** Newest modification time of the sources a PDF is built from. */
  sourcesMtimeMs: number
  /** Every problem, including the ones listed per section and document. */
  problems: Problem[]
  /** The content as loaded, every visibility included. */
  content: VitakitContent
}

const posix = (path: string) => path.split(sep).join('/')

async function files(dir: string, filter: (name: string) => boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const found: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await files(path, filter))
    else if (filter(entry.name)) found.push(path)
  }
  return found.sort()
}

async function newest(paths: string[]): Promise<number> {
  let latest = 0
  for (const path of paths) {
    const info = await stat(path).catch(() => undefined)
    if (info && info.mtimeMs > latest) latest = info.mtimeMs
  }
  return latest
}

/** `export { default } from './talks'`: a schema shared with another section. */
function sharedSchema(source: string): string | undefined {
  return /export\s*\{\s*default\s*\}\s*from\s*['"]\.\/([a-z0-9-]+)(?:\.ts)?['"]/.exec(source)?.[1]
}

function belongsTo(problem: Problem, file: SectionFile): boolean {
  return problem.where === file.where || problem.where === `schemas/${file.id}.ts`
}

export interface InventoryOptions {
  /** Skip reading Vue files; for callers that only need content. */
  web?: boolean
}

export async function inventory(rootDir: string, options: InventoryOptions = {}): Promise<Inventory> {
  const content = await loadContent(rootDir, { strict: false, maxVisibility: 'private' })
  const problems: Problem[] = [...content.issues]

  // Sections
  const { files: sectionFiles } = await findSectionFiles(rootDir).catch(() => ({ files: [] as SectionFile[] }))
  const sections: SectionInventory[] = []
  const schemasForDocuments: { id: string, schema: z.ZodType }[] = []
  for (const file of sectionFiles) {
    const local = join(rootDir, 'schemas', `${file.id}.ts`)
    const builtIn = Object.hasOwn(builtinSchemas, file.id)
    const section: SectionInventory = {
      id: file.id,
      where: file.where,
      schema: { origin: existsSync(local) ? 'local' : builtIn ? 'built-in' : 'none' },
      problems: problems.filter(problem => belongsTo(problem, file)),
    }

    if (section.schema.origin === 'local') {
      section.schema.file = `schemas/${file.id}.ts`
      const source = await readFile(local, 'utf8')
      const shared = sharedSchema(source)
      if (shared) section.schema.sharedWith = shared
      if (builtIn && /\bextendSection\s*\(\s*schemas\.[\w$]+/.test(source)) section.schema.extendsBuiltIn = true
    }

    try {
      const raw = parseYaml(await readFile(file.file, 'utf8'))
      if (Array.isArray(raw)) section.entries = raw.length
      else if (raw === null) section.entries = 0
    } catch {
      // Reported by loadContent already.
    }

    if (section.schema.origin !== 'none') {
      try {
        const source = await resolveSectionSchema(rootDir, file)
        schemasForDocuments.push({ id: file.id, schema: source.schema })
        const fields = describeSection(source.schema)
        if (fields) section.fields = fields
      } catch {
        // Reported by loadContent already.
      }
    }

    if (!section.problems.length) {
      const counts: Record<Visibility, number> = { public: 0, cv: 0, private: 0 }
      for (const entry of content.sections[file.id] ?? []) counts[entry.visibility]++
      section.counts = counts
    }
    sections.push(section)
  }

  // Pages
  const menu = new Set(content.profile.nav.map(item => item.url))
  const pages = new Map<string, PageInventory>()
  const page = (route: string) => {
    if (!pages.has(route)) pages.set(route, { route, inMenu: menu.has(route) })
    return pages.get(route)!
  }
  const pagesDir = join(rootDir, 'content', 'pages')
  for (const path of await files(pagesDir, name => name.endsWith('.md'))) {
    const slug = relative(pagesDir, path).replace(/\.md$/, '')
    let route = slug === 'index' ? '/' : `/${slug}/`
    let title: string | undefined
    try {
      const { data } = matter(await readFile(path, 'utf8'))
      if (typeof data.route === 'string') route = data.route
      if (typeof data.title === 'string') title = data.title
    } catch {
      // Reported by loadContent already.
    }
    Object.assign(page(route), { markdown: posix(relative(rootDir, path)), ...(title ? { title } : {}) })
  }
  let catchAll: string | undefined
  const vuePagesDir = join(rootDir, 'app', 'pages')
  for (const path of await files(vuePagesDir, name => name.endsWith('.vue'))) {
    const below = relative(vuePagesDir, path)
    if (below.includes('[')) {
      if (/\[\.\.\.[^\]]+\]\.vue$/.test(below) && !below.includes(sep)) catchAll = posix(relative(rootDir, path))
      continue
    }
    page(pageRoute(below)).vue = posix(relative(rootDir, path))
  }

  // Publications
  const bib = join(rootDir, 'content', 'publications.bib')
  const publications = existsSync(bib)
    ? {
        file: 'content/publications.bib',
        entries: content.publications.reduce((sum, group) => sum + group.entries.length, 0),
        groups: content.publications.length,
      }
    : undefined

  // Documents
  const cvDir = join(rootDir, 'cv-tex')
  const { documents: found, problems: documentProblems } = await findDocuments(cvDir)
  problems.push(...documentProblems)
  const known = new Set([...sections.map(section => section.id), 'publications', 'profile'])
  const groupIds = new Set(content.publications.map(group => group.id))
  const documents: DocumentInventory[] = []
  for (const document of found) {
    const tex = `cv-tex/${document.name}.tex`
    const source = await readFile(document.texFile, 'utf8')
    const pdfPath = join(cvDir, `${document.name}.pdf`)
    const pdf = await stat(pdfPath).catch(() => undefined)
    const own: Problem[] = documentSectionProblems(document, schemasForDocuments)

    const directive = documentDirective(source)
    if (!directive) own.push({ where: tex, message: `has no \\vitadocument{${document.name}}` })
    else if (directive.name !== document.name) {
      own.push({ where: `${tex}:${directive.line}`, message: `\\vitadocument{${directive.name}} does not match the file name; expected \\vitadocument{${document.name}}` })
    }
    const placements = findPdfPlacements(document.name, tex, source)
    for (const placement of placements) {
      if (!known.has(placement.section)) {
        own.push({ where: `${tex}:${placement.line}`, message: `no section called "${placement.section}"` })
      }
    }
    for (const group of document.options.publications.groups ?? []) {
      if (!groupIds.has(group) && publications) {
        own.push({ where: `cv-tex/${document.name}.yml`, message: `publications.groups: no publication group "${group}"` })
      }
    }
    problems.push(...own)
    documents.push({
      name: document.name,
      tex,
      ...(existsSync(join(cvDir, `${document.name}.yml`)) ? { yml: `cv-tex/${document.name}.yml` } : {}),
      options: document.options,
      placements,
      ...(pdf ? { pdf: { file: `cv-tex/${document.name}.pdf`, mtimeMs: pdf.mtimeMs } } : {}),
      problems: [...documentProblems.filter(problem => problem.where === `cv-tex/${document.name}.yml`), ...own],
    })
  }

  const sourcesMtimeMs = await newest([
    ...await files(join(rootDir, 'content'), () => true),
    ...await files(join(rootDir, 'schemas'), () => true),
    ...await files(cvDir, name => /\.(tex|yml|yaml|eta|cls)$/.test(name)).then(list =>
      list.filter(path => !relative(cvDir, path).startsWith('generated'))),
  ])

  const web = options.web === false
    ? { placements: [], dynamic: [], components: new Map<string, string>() }
    : await findWebPlacements(rootDir).catch((error: unknown) => {
        problems.push({ where: whereOf(error, 'app/'), message: messageOf(error) })
        return { placements: [], dynamic: [], components: new Map<string, string>() }
      })

  return {
    root: rootDir,
    sections,
    pages: [...pages.values()].sort((a, b) => a.route.localeCompare(b.route)),
    ...(catchAll ? { catchAll } : {}),
    ...(publications ? { publications } : {}),
    documents,
    web,
    sourcesMtimeMs,
    problems,
    content,
  }
}

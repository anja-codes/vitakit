/**
 * Reads `content/`, validates it, renders it, and returns everything the app
 * needs as one typed object.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import { createRenderer, prefixRootRelative, type Renderer } from './render'
import { absoluteSitePath, resolveSitePaths } from './site-paths'
import { defaultPublications, loadPublications, loadPublicationsSchema } from './bibliography'
import { LISTS_FILE, loadPublicationLists, type PublicationListOptions } from './publication-lists'
import { findSectionFiles, loadSection, resolveSectionSchema } from './sections'
import { page as pageSchema, profile as profileSchema } from './schemas'
import { fail, formatZodIssues, Issues, messageOf, whereOf } from './issues'
import type { Entry, Page, Profile, PublicationList, VitakitContent, Visibility } from './shared/types'

export interface LoadContentOptions {
  /** Throw on the first problem (builds) or collect them (dev). */
  strict?: boolean
  /** Deployment base URL, used to rewrite root-relative asset paths. */
  baseURL?: string
  /** Highest visibility to include; the website must never exceed `public`. */
  maxVisibility?: Visibility
  /**
   * Who links to paths on the site (`/slides/talk.pdf`): the website, which
   * prefixes the base URL, or the PDF, which needs `profile.url` in front.
   */
  target?: 'website' | 'pdf'
}

const FALLBACK_PROFILE: Profile = { name: 'Your Name', links: [], nav: [], footerHtml: '' }

async function loadYaml(file: string, where: string): Promise<unknown> {
  const raw = await readFile(file, 'utf8').catch(() => fail(where, 'missing'))
  try {
    return parseYaml(raw)
  } catch (error) {
    fail(where, messageOf(error))
  }
}

async function loadProfile(
  contentDir: string,
  baseURL: string,
  renderer: Renderer,
  target: 'website' | 'pdf',
): Promise<Profile> {
  const data = await loadYaml(join(contentDir, 'profile.yml'), 'content/profile.yml')
  const parsed = profileSchema.safeParse(data)
  if (!parsed.success) fail('content/profile.yml', `invalid\n${formatZodIssues(parsed.error)}`)

  // `avatar` is a path below `public/`, so it needs the same base-URL treatment
  // that Markdown asset paths get -- otherwise the portrait 404s on a project
  // site served from a subdirectory.
  const prefix = baseURL.replace(/\/$/, '')
  const { avatar, nav, footer, ...rest } = parsed.data
  // Links may be paths on the site; see `site-paths.ts`.
  return resolveSitePaths({
    ...rest,
    ...(avatar ? { avatar: prefixRootRelative(avatar, prefix) } : {}),
    nav: nav.map(item => ({ label: item.label, url: item.to })),
    footerHtml: footer ? renderer.inline(footer) : '',
  }, sitePathResolver(target, baseURL, parsed.data.url)) as Profile
}

/** How a path on the site becomes a link, for the website or the PDF. */
function sitePathResolver(target: 'website' | 'pdf', baseURL: string, siteUrl: string | undefined): (path: string) => string {
  const prefix = baseURL.replace(/\/$/, '')
  return target === 'pdf' ? path => absoluteSitePath(path, siteUrl) : path => prefixRootRelative(path, prefix)
}

/** A stand-in page shown in dev so a broken file is visible in the browser. */
function errorPage(route: string, where: string, message: string): Page {
  const escaped = message.replace(/[&<>]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character]!))
  return {
    route,
    title: `Error in ${where}`,
    titleHtml: `Error in <code>${where}</code>`,
    order: -1,
    bodyHtml: `<pre>${escaped}</pre>`,
    error: message,
  }
}

async function loadPage(dir: string, file: string, renderer: Renderer): Promise<Page> {
  const where = `content/pages/${file}`
  const slug = file.slice(0, -'.md'.length)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(where, 'file name must be lowercase kebab-case, e.g. `research-interests.md`')
  }

  const { data, content } = matter(await readFile(join(dir, file), 'utf8'))
  const parsed = pageSchema.safeParse(data)
  if (!parsed.success) fail(where, `invalid front matter\n${formatZodIssues(parsed.error)}`)

  const route = parsed.data.route ?? (slug === 'index' ? '/' : `/${slug}/`)
  try {
    return {
      route,
      title: parsed.data.title,
      titleHtml: renderer.inline(parsed.data.title),
      description: parsed.data.description,
      order: parsed.data.order,
      bodyHtml: content.trim() ? renderer.markdown(content) : '',
    }
  } catch (error) {
    fail(where, messageOf(error))
  }
}

async function loadPages(contentDir: string, renderer: Renderer, issues: Issues): Promise<Page[]> {
  const dir = join(contentDir, 'pages')
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter(name => name.endsWith('.md'))
    .sort()

  const pages = await Promise.all(files.map(async (file) => {
    try {
      return await loadPage(dir, file, renderer)
    } catch (error) {
      if (issues.strict) throw error
      const where = whereOf(error, `content/pages/${file}`)
      const message = messageOf(error)
      issues.record(where, message)
      // The broken file keeps its route, so the error appears where the page
      // would have been and the rest of the site stays navigable.
      const slug = file.slice(0, -'.md'.length)
      return errorPage(slug === 'index' ? '/' : `/${slug}/`, where, message)
    }
  }))

  const seen = new Map<string, string>()
  for (const [index, page] of pages.entries()) {
    const previous = seen.get(page.route)
    if (previous) issues.record(`content/pages/${files[index]}`, `route ${page.route} is already used by ${previous}`)
    else seen.set(page.route, `content/pages/${files[index]}`)
  }

  return pages.sort((a, b) => a.order - b.order || a.route.localeCompare(b.route))
}

async function loadSections(
  rootDir: string,
  maxVisibility: Visibility,
  renderer: Renderer,
  resolvePath: (path: string) => string,
  issues: Issues,
): Promise<Record<string, Entry[]>> {
  // Each section stands on its own: one missing or broken schema must not
  // make the others disappear while developing.
  const { files, problems } = await issues.attempt('content/', () => findSectionFiles(rootDir), { files: [], problems: [] })
  for (const problem of problems) issues.record(problem.where, problem.message)
  const sections: Record<string, Entry[]> = {}
  for (const file of files) {
    sections[file.id] = await issues.attempt(
      file.where,
      async () => loadSection(await resolveSectionSchema(rootDir, file), { maxVisibility, renderer, resolvePath }),
      [],
    )
  }
  return sections
}

async function loadPublicationContent(rootDir: string, renderer: Renderer, baseURL: string, issues: Issues): Promise<Record<string, PublicationList>> {
  const schema = await issues.attempt('schemas/publications.ts', () => loadPublicationsSchema(rootDir), defaultPublications)
  const lists = await issues.attempt<Record<string, PublicationListOptions>>(LISTS_FILE, () => loadPublicationLists(rootDir, schema), {})
  // A broken .bib file empties the lists rather than removing them, so that
  // pages showing them still work while it is being fixed.
  const empty = Object.fromEntries(Object.keys(lists).map(name => [name, { count: 0, groups: [] }]))
  return issues.attempt('content/publications.bib', () => loadPublications(join(rootDir, 'content', 'publications.bib'), renderer, schema, lists, baseURL, issues), empty)
}

export async function loadContent(rootDir: string, options: LoadContentOptions = {}): Promise<VitakitContent> {
  const strict = options.strict ?? true
  const baseURL = options.baseURL ?? '/'
  const maxVisibility = options.maxVisibility ?? 'public'
  const issues = new Issues(strict)
  const renderer = createRenderer({ baseURL })
  const contentDir = join(rootDir, 'content')

  const target = options.target ?? 'website'

  // First: for the PDF, links to paths on the site depend on `profile.url`.
  const profile = await issues.attempt('content/profile.yml', () => loadProfile(contentDir, baseURL, renderer, target), FALLBACK_PROFILE)
  const resolvePath = sitePathResolver(target, baseURL, profile.url)

  const [pages, sections, publications] = await Promise.all([
    loadPages(contentDir, renderer, issues),
    loadSections(rootDir, maxVisibility, renderer, resolvePath, issues),
    loadPublicationContent(rootDir, renderer, baseURL, issues),
  ])

  return { profile, pages, sections, publications, issues: issues.list }
}

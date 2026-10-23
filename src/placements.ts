/**
 * Where sections and publication lists appear: on which website pages and in
 * which PDF documents.
 *
 * Read from the source files, not from a build. Only literal, recognizable
 * usages count -- `<VitaSection id="talks">`, `<TalkList id="talks" />`,
 * `useSection('talks')`, `\vitasection[…]{talks}`, `<VitaPublications
 * list="recent">`, `\vitapublications{recent}` -- and every usage that cannot
 * be resolved statically (`:id="section.id"`) is reported as dynamic, so a
 * caller can say "unknown" instead of "not shown".
 */
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

export interface WebPlacement {
  section: string
  /** Relative to the project root: `app/pages/cv.vue`. */
  file: string
  /** The page's route, for files in `app/pages/`. */
  route?: string
  line: number
  /** The component rendering it (`VitaSection`, `TalkList`), or `code` for `useSection`. */
  component: string
  /** Literal `title` attribute, if any. */
  title?: string
  /** `where` as written in the template, if any. */
  where?: string
  limit?: string
}

/** A usage whose section cannot be known without running the code. */
export interface DynamicUsage {
  file: string
  line: number
  /** What was found, e.g. `<VitaSection :id="section.id">`. */
  usage: string
}

export interface PdfPlacement {
  section: string
  document: string
  /** `cv-tex/cv.tex`. */
  file: string
  line: number
  macro: 'vitasection' | 'vitainput'
  /** The optional heading of `\vitasection[Heading]{id}`. */
  heading?: string
}

/** A `<VitaPublications>` element. */
export interface PublicationPlacement {
  file: string
  route?: string
  line: number
  /** The literal list name; absent when there is none or it is chosen in code. */
  list?: string
  /** `:list="…"`, when the name is chosen in code. */
  expression?: string
  title?: string
  /** Props that select publications, which a list does instead. */
  selecting: string[]
}

/** A `\vitapublications[Heading]{list}` line. */
export interface PdfPublicationPlacement {
  list: string
  document: string
  file: string
  line: number
  heading?: string
}

export interface WebPlacements {
  placements: WebPlacement[]
  publications: PublicationPlacement[]
  dynamic: DynamicUsage[]
  /** Local components, by the name a template uses: `TalkList`. */
  components: Map<string, string>
}

const posix = (path: string) => path.split(sep).join('/')

async function vueFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: string[] = []
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...await vueFiles(path))
    else if (entry.name.endsWith('.vue')) files.push(path)
  }
  return files.sort()
}

const pascal = (name: string) => name.split(/[-_.\s]+/).filter(Boolean)
  .map(part => part[0]!.toUpperCase() + part.slice(1)).join('')

/**
 * The name Nuxt registers a component under: its path below `components/`,
 * in PascalCase, without repeating a directory name the file name starts with.
 */
export function componentName(pathBelowComponents: string): string {
  const parts = posix(pathBelowComponents).replace(/\.vue$/, '').split('/').map(pascal)
  let name = ''
  for (const part of parts) name = part.startsWith(name) ? part : name + part
  return name
}

/** The route of a file in `app/pages/`, with vitakit's trailing slash. */
export function pageRoute(pathBelowPages: string): string {
  const path = posix(pathBelowPages).replace(/\.vue$/, '').replace(/(^|\/)index$/, '')
  return path ? `/${path}/` : '/'
}

/** `'talks'` or `"talks"` as a whole expression; otherwise `undefined`. */
function literal(expression: string): string | undefined {
  return /^\s*(['"`])([^'"`$]*)\1\s*$/.exec(expression)?.[2]
}

interface TemplateNode {
  type: number
  tag?: string
  props?: TemplateProp[]
  children?: TemplateNode[]
  loc: { start: { line: number } }
}
interface TemplateProp {
  type: number
  name: string
  value?: { content: string }
  arg?: { content: string }
  exp?: { content: string }
}

const ELEMENT = 1
const ATTRIBUTE = 6

function attribute(node: TemplateNode, name: string): { static?: string, expression?: string } | undefined {
  for (const prop of node.props ?? []) {
    if (prop.type === ATTRIBUTE && prop.name === name) return { static: prop.value?.content ?? '' }
    if (prop.type !== ATTRIBUTE && prop.name === 'bind' && prop.arg?.content === name) {
      return { expression: prop.exp?.content ?? '' }
    }
  }
  return undefined
}

function lineOf(text: string, offset: number): number {
  let line = 1
  for (let index = 0; index < offset; index++) if (text.charCodeAt(index) === 10) line++
  return line
}

/** Every recognizable section usage in the Vue files of `app/`. */
export async function findWebPlacements(rootDir: string): Promise<WebPlacements> {
  const { parse } = await import('@vue/compiler-sfc')
  const appDir = join(rootDir, 'app')
  const componentsDir = join(appDir, 'components')
  const pagesDir = join(appDir, 'pages')

  const components = new Map<string, string>()
  for (const file of await vueFiles(componentsDir)) {
    components.set(componentName(relative(componentsDir, file)), posix(relative(rootDir, file)))
  }

  const placements: WebPlacement[] = []
  const publications: PublicationPlacement[] = []
  const dynamic: DynamicUsage[] = []

  for (const path of await vueFiles(appDir)) {
    const file = posix(relative(rootDir, path))
    const inPages = !relative(pagesDir, path).startsWith('..')
    const inComponents = !relative(componentsDir, path).startsWith('..')
    const route = inPages ? pageRoute(relative(pagesDir, path)) : undefined
    const source = await readFile(path, 'utf8')
    const { descriptor } = parse(source, { filename: path })

    const visit = (node: TemplateNode) => {
      if (node.type === ELEMENT && node.tag) {
        const tag = node.tag.includes('-') ? pascal(node.tag) : node.tag
        if (tag === 'VitaPublications') {
          const list = attribute(node, 'list')
          const title = attribute(node, 'title')
          const name = list?.static ?? (list?.expression !== undefined ? literal(list.expression) : undefined)
          publications.push({
            file,
            route,
            line: node.loc.start.line,
            ...(name !== undefined ? { list: name } : list?.expression !== undefined ? { expression: list.expression } : {}),
            ...(title?.static !== undefined ? { title: title.static } : {}),
            selecting: SELECTING_PROPS.filter(prop => attribute(node, prop) !== undefined),
          })
        } else if (tag === 'VitaSection' || components.has(tag)) {
          const id = attribute(node, 'id')
          const section = id?.static ?? (id?.expression !== undefined ? literal(id.expression) : undefined)
          if (section) {
            const title = attribute(node, 'title')
            const where = attribute(node, 'where')
            const limit = attribute(node, 'limit')
            placements.push({
              section,
              file,
              route,
              line: node.loc.start.line,
              component: tag,
              ...(title?.static !== undefined ? { title: title.static } : {}),
              ...(where?.expression !== undefined ? { where: where.expression } : {}),
              ...(limit ? { limit: limit.static ?? limit.expression } : {}),
            })
          } else if (id?.expression !== undefined && !inComponents) {
            dynamic.push({ file, line: node.loc.start.line, usage: `<${node.tag} :id="${id.expression}">` })
          }
        }
      }
      for (const child of node.children ?? []) visit(child)
    }
    if (descriptor.template?.ast) visit(descriptor.template.ast as unknown as TemplateNode)

    for (const block of [descriptor.script, descriptor.scriptSetup]) {
      if (!block) continue
      const start = block.loc.start.line - 1
      for (const match of block.content.matchAll(/\buseSection\(\s*([^)]*?)\s*\)/g)) {
        const line = start + lineOf(block.content, match.index)
        const section = literal(match[1]!)
        if (section) placements.push({ section, file, route, line, component: 'code' })
        else if (!inComponents) dynamic.push({ file, line, usage: `useSection(${match[1]})` })
      }
    }
  }

  return { placements, publications, dynamic, components }
}

/**
 * Props that select publications: `groups` and `headings` of vitakit 0.2, and
 * those `VitaSection` takes. A list selects instead, the same on every page.
 */
const SELECTING_PROPS = ['groups', 'headings', 'where', 'limit', 'sort', 'groupBy', 'group-by']

/**
 * Publication list placements that a build would fail on: an unknown or
 * missing list name, props that select publications on the page, and
 * `\vitainput{publications}` of vitakit 0.2.
 */
export function publicationPlacementProblems(
  web: PublicationPlacement[],
  pdf: (PdfPlacement | PdfPublicationPlacement)[],
  lists: string[],
): { where: string, message: string }[] {
  const known = `the lists are ${lists.join(', ') || '(none)'} (content/publication-lists.yml)`
  const unknown = (name: string) => `no publication list "${name}"; ${known}`
  const migrate = '`vitakit migrate` converts it'
  const problems: { where: string, message: string }[] = []
  for (const placement of web) {
    const where = `${placement.file}:${placement.line}`
    const legacy = placement.selecting.filter(prop => prop === 'groups' || prop === 'headings')
    if (placement.selecting.length) {
      problems.push({
        where,
        message: `VitaPublications does not take ${placement.selecting.join(', ')}: which publications a list shows is set in content/publication-lists.yml${legacy.length ? `; ${migrate}` : ''}`,
      })
    } else if (placement.list === undefined && placement.expression === undefined) {
      problems.push({ where, message: `VitaPublications needs a list, e.g. <VitaPublications list="all" />; ${known}` })
    } else if (placement.list !== undefined && !lists.includes(placement.list)) {
      problems.push({ where, message: unknown(placement.list) })
    }
  }
  for (const placement of pdf) {
    const where = `${placement.file}:${placement.line}`
    if ('list' in placement) {
      if (!lists.includes(placement.list)) problems.push({ where, message: unknown(placement.list) })
    } else if (placement.macro === 'vitainput' && placement.section === 'publications') {
      problems.push({ where, message: `\\vitainput{publications} is now \\vitapublications[Heading]{list}, with a list from content/publication-lists.yml; ${migrate}` })
    }
  }
  return problems
}

/** Remove a TeX comment: everything from an unescaped `%`. */
function stripComment(line: string): string {
  const match = /(^|[^\\])%/.exec(line)
  return match ? line.slice(0, match.index + match[1]!.length) : line
}

/** `\vitasection` and `\vitainput` lines in a document's body. */
export function findPdfPlacements(document: string, file: string, source: string): PdfPlacement[] {
  const placements: PdfPlacement[] = []
  const lines = source.split('\n')
  let inBody = false
  for (const [index, raw] of lines.entries()) {
    const line = stripComment(raw)
    if (!inBody) {
      if (/\\begin\{document\}/.test(line)) inBody = true
      else continue
    }
    for (const match of line.matchAll(/\\vitasection(?:\[([^\]]*)\])?\{([^}]*)\}/g)) {
      placements.push({
        section: match[2]!.trim(),
        document,
        file,
        line: index + 1,
        macro: 'vitasection',
        ...(match[1] !== undefined ? { heading: match[1] } : {}),
      })
    }
    for (const match of line.matchAll(/\\vitainput\{([^}]*)\}/g)) {
      placements.push({ section: match[1]!.trim(), document, file, line: index + 1, macro: 'vitainput' })
    }
  }
  return placements
}

/** `\vitapublications` lines in a document's body. */
export function findPdfPublicationPlacements(document: string, file: string, source: string): PdfPublicationPlacement[] {
  const placements: PdfPublicationPlacement[] = []
  let inBody = false
  for (const [index, raw] of source.split('\n').entries()) {
    const line = stripComment(raw)
    if (!inBody) {
      if (/\\begin\{document\}/.test(line)) inBody = true
      else continue
    }
    for (const match of line.matchAll(/\\vitapublications(?:\[([^\]]*)\])?\{([^}]*)\}/g)) {
      placements.push({ list: match[2]!.trim(), document, file, line: index + 1, ...(match[1] !== undefined ? { heading: match[1] } : {}) })
    }
  }
  return placements
}

/** The name in `\vitadocument{name}`, if the document has one. */
export function documentDirective(source: string): { name: string, line: number } | undefined {
  for (const [index, raw] of source.split('\n').entries()) {
    const match = /\\vitadocument\{([^}]*)\}/.exec(stripComment(raw))
    if (match) return { name: match[1]!.trim(), line: index + 1 }
  }
  return undefined
}

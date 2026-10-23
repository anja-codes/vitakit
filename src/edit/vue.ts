/**
 * Add or change a section's element on a Vue page, without reformatting it.
 *
 * `@vue/compiler-sfc` locates the elements; edits are text inserted at their
 * positions. Only elements with a literal `id` count, the same rule as for
 * `vitakit status`.
 */
import { parse } from '@vue/compiler-sfc'
import { indentationAt, insertLinesAfter, insertLinesBefore, lineEnd, lineStart, type Recognized } from './text'

interface Node {
  type: number
  tag?: string
  props?: { type: number, name: string, value?: { content: string }, arg?: { content: string }, exp?: { content: string }, loc: { start: { offset: number }, end: { offset: number } } }[]
  children?: Node[]
  loc: { start: { offset: number, line: number }, end: { offset: number } }
}

const ELEMENT = 1
const ATTRIBUTE = 6
const pascal = (name: string) => name.split('-').map(part => part[0]!.toUpperCase() + part.slice(1)).join('')

function literalAttribute(node: Node, name: string): string | undefined {
  for (const prop of node.props ?? []) {
    if (prop.type === ATTRIBUTE && prop.name === name) return prop.value?.content
    if (prop.type !== ATTRIBUTE && prop.name === 'bind' && prop.arg?.content === name) {
      return /^\s*(['"`])([^'"`$]*)\1\s*$/.exec(prop.exp?.content ?? '')?.[2]
    }
  }
  return undefined
}

/** Where a new line can go after an element: after the block of the page holding it. */
export interface Anchor {
  start: number
  end: number
  line: number
  /** Whether a `v-else` follows it, which nothing may be put before. */
  chained: boolean
}

export interface SectionElement {
  id: string
  tag: string
  start: number
  end: number
  line: number
  /** Whether it has content between its tags, such as slots. */
  hasContent: boolean
  /**
   * The element itself, or the block of the root element it is in -- such as
   * a `<section v-if>` with a heading -- after which a new element goes.
   */
  anchor: Anchor
}

const hasContent = (node: Node) =>
  (node.children ?? []).some(child => child.type !== 3 && !(child.type === 2 && !(child as unknown as { content: string }).content.trim()))

const directive = (node: Node | undefined, ...names: string[]) =>
  (node?.props ?? []).some(prop => prop.type !== ATTRIBUTE && names.includes(prop.name))

/**
 * Section elements in a page's template: `VitaSection`, or a component from
 * `components`, with a literal id; and `VitaPublications` with a literal list.
 */
export function sectionElements(source: string, components: Iterable<string> = []): Recognized<{ elements: SectionElement[], lists: SectionElement[], root?: Node }> {
  const known = new Set(['VitaSection', ...components])
  let ast: Node | undefined
  try {
    const { descriptor, errors } = parse(source)
    if (errors.length) return { ok: false, reason: `cannot be parsed: ${String(errors[0])}` }
    ast = descriptor.template?.ast as unknown as Node | undefined
  } catch (error) {
    return { ok: false, reason: `cannot be parsed: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!ast) return { ok: false, reason: 'it has no <template>' }
  const roots = (ast.children ?? []).filter(node => node.type === ELEMENT)
  const root = roots.length === 1 ? roots[0] : undefined

  const elements: SectionElement[] = []
  const lists: SectionElement[] = []
  const visit = (node: Node, anchor?: Anchor) => {
    if (node.type === ELEMENT && node.tag) {
      const tag = node.tag.includes('-') ? pascal(node.tag) : node.tag
      const found = (id: string): SectionElement => ({
        id,
        tag: node.tag!,
        start: node.loc.start.offset,
        end: node.loc.end.offset,
        line: node.loc.start.line,
        hasContent: hasContent(node),
        anchor: anchor ?? { start: node.loc.start.offset, end: node.loc.end.offset, line: node.loc.start.line, chained: false },
      })
      const id = known.has(tag) ? literalAttribute(node, 'id') : undefined
      if (id) elements.push(found(id))
      const list = tag === 'VitaPublications' ? literalAttribute(node, 'list') : undefined
      if (list) lists.push(found(list))
    }
    const children = (node.children ?? []).filter(child => child.type === ELEMENT)
    for (const [index, child] of children.entries()) {
      const block = node === root
        ? { start: child.loc.start.offset, end: child.loc.end.offset, line: child.loc.start.line, chained: directive(children[index + 1], 'else', 'else-if') }
        : anchor
      visit(child, block)
    }
  }
  visit(ast)
  return { ok: true, value: { elements, lists, ...(root ? { root } : {}) } }
}

/** An HTML attribute value. */
function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

export interface VuePlacement {
  id: string
  title?: string
  /** The component to use; `VitaSection` by default. */
  component?: string
  /** Put the element after this section's element; after the last one otherwise. */
  after?: string
}

export function sectionElementSource(placement: VuePlacement): string {
  return `<${placement.component ?? 'VitaSection'} id="${placement.id}"${placement.title ? ` title="${attribute(placement.title)}"` : ''} />`
}

export function publicationsElementSource(list: string, title?: string): string {
  return `<VitaPublications list="${attribute(list)}"${title ? ` title="${attribute(title)}"` : ''} />`
}

/**
 * The page with one more element: after the anchor named `after`, else after
 * the last anchor, else at the end of the template's single root element.
 */
function insertElement(source: string, markup: string, anchors: SectionElement[], root: Node | undefined, after?: string): Recognized<{ source: string, afterSection?: string }> {
  const sorted = [...anchors].sort((a, b) => a.start - b.start)
  const found = (after && sorted.find(existing => existing.id === after)) ?? sorted[sorted.length - 1]
  if (found) {
    const { anchor } = found
    if (anchor.chained) return { ok: false, reason: `a v-else follows line ${anchor.line}; a line after it would split the v-if from its v-else` }
    if (source.slice(lineStart(source, anchor.start), anchor.start).trim() || source.slice(anchor.end, lineEnd(source, anchor.end)).trim()) {
      return { ok: false, reason: `line ${anchor.line} holds other markup too` }
    }
    const indent = indentationAt(source, anchor.start)
    return { ok: true, value: { source: insertLinesAfter(source, anchor.end - 1, [`${indent}${markup}`]), afterSection: found.id } }
  }
  if (!root || !root.tag) return { ok: false, reason: 'its template has no single root element to add to' }
  const close = source.lastIndexOf(`</${root.tag}`, root.loc.end.offset)
  if (close === -1 || close < root.loc.start.offset || source.slice(lineStart(source, close), close).trim() !== '') {
    return { ok: false, reason: `its <${root.tag}> does not end on a line of its own` }
  }
  const indent = `${indentationAt(source, close)}  `
  return { ok: true, value: { source: insertLinesBefore(source, close, ['', `${indent}${markup}`]) } }
}

/**
 * The page with one more section element: after `after`, else after the last
 * section, else at the end of the template's single root element.
 */
export function addSectionToPage(source: string, placement: VuePlacement, components: Iterable<string> = []): Recognized<{ source: string, afterSection?: string }> {
  const found = sectionElements(source, components)
  if (!found.ok) return found
  const { elements, lists, root } = found.value
  if (elements.some(element => element.id === placement.id)) return { ok: false, reason: `it already shows ${placement.id}` }
  // A publication list counts as an anchor only when asked for by name.
  const anchors = [...elements, ...lists.filter(list => list.id === placement.after && !elements.some(element => element.id === list.id))]
  return insertElement(source, sectionElementSource(placement), anchors, root, placement.after)
}

/** The page with a publication list added, after a section or another list. */
export function addPublicationsToPage(source: string, placement: { list: string, title?: string, after?: string }, components: Iterable<string> = []): Recognized<{ source: string, afterSection?: string }> {
  const found = sectionElements(source, components)
  if (!found.ok) return found
  const { elements, lists, root } = found.value
  if (lists.some(list => list.id === placement.list)) return { ok: false, reason: `it already shows the list ${placement.list}` }
  return insertElement(source, publicationsElementSource(placement.list, placement.title), [...elements, ...lists], root, placement.after)
}

/**
 * Show a section through another component: every element with this section's
 * id gets the new tag, keeping its attributes. An element with content of its
 * own (slots) is not changed, since the new component may not take them.
 */
export function useComponentForSection(source: string, id: string, component: string, components: Iterable<string> = []): Recognized<{ source: string, changed: number[] }> {
  const found = sectionElements(source, components)
  if (!found.ok) return found
  const elements = found.value.elements.filter(element => element.id === id)
  if (!elements.length) return { ok: false, reason: `it does not show ${id}` }
  const blocked = elements.find(element => element.hasContent)
  if (blocked) return { ok: false, reason: `line ${blocked.line} has content of its own, such as slots; move it into the component` }
  const changed: number[] = []
  let result = source
  // From the end, so earlier offsets stay valid.
  for (const element of [...elements].reverse()) {
    if (element.tag === component) continue
    let text = result.slice(element.start, element.end)
    text = `<${component}${text.slice(element.tag.length + 1)}`
    if (text.endsWith(`</${element.tag}>`)) text = `${text.slice(0, -(element.tag.length + 3))}</${component}>`
    result = result.slice(0, element.start) + text + result.slice(element.end)
    changed.unshift(element.line)
  }
  return { ok: true, value: { source: result, changed } }
}

/** One attribute of an element: `list="all"`, `:groups="['a']"`, `v-if="x"`. */
export interface ElementProp {
  /** The prop it sets (`groups` for `:groups`), or `v-if` for other directives. */
  name: string
  start: number
  end: number
  /** The text of a plain attribute; `undefined` for one without a value. */
  value?: string
  /** The expression of a bound prop. */
  expression?: string
}

export interface PublicationsElement {
  tag: string
  start: number
  line: number
  props: ElementProp[]
  hasContent: boolean
}

/** Every `VitaPublications` element of a page, with its props and their positions. */
export function publicationsElements(source: string): Recognized<PublicationsElement[]> {
  let ast: Node | undefined
  try {
    const { descriptor, errors } = parse(source)
    if (errors.length) return { ok: false, reason: `cannot be parsed: ${String(errors[0])}` }
    ast = descriptor.template?.ast as unknown as Node | undefined
  } catch (error) {
    return { ok: false, reason: `cannot be parsed: ${error instanceof Error ? error.message : String(error)}` }
  }
  const found: PublicationsElement[] = []
  const visit = (node: Node) => {
    if (node.type === ELEMENT && node.tag && (node.tag.includes('-') ? pascal(node.tag) : node.tag) === 'VitaPublications') {
      found.push({
        tag: node.tag,
        start: node.loc.start.offset,
        line: node.loc.start.line,
        hasContent: hasContent(node),
        props: (node.props ?? []).map(prop => ({
          name: prop.type === ATTRIBUTE ? prop.name : prop.name === 'bind' && prop.arg ? prop.arg.content : `v-${prop.name}`,
          start: prop.loc.start.offset,
          end: prop.loc.end.offset,
          ...(prop.type === ATTRIBUTE ? (prop.value ? { value: prop.value.content } : {}) : { expression: prop.exp?.content ?? '' }),
        })),
      })
    }
    for (const child of node.children ?? []) visit(child)
  }
  if (ast) visit(ast)
  return { ok: true, value: found }
}

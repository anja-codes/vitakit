/**
 * Add or change a section's element on a Vue page, without reformatting it.
 *
 * `@vue/compiler-sfc` locates the elements; edits are text inserted at their
 * positions. Only elements with a literal `id` count, the same rule as for
 * `vitakit status`.
 */
import { parse } from '@vue/compiler-sfc'
import { indentationAt, insertLinesAfter, insertLinesBefore, lineStart, type Recognized } from './text'

interface Node {
  type: number
  tag?: string
  props?: { type: number, name: string, value?: { content: string }, arg?: { content: string }, exp?: { content: string } }[]
  children?: Node[]
  loc: { start: { offset: number, line: number }, end: { offset: number } }
}

const ELEMENT = 1
const ATTRIBUTE = 6
const pascal = (name: string) => name.split('-').map(part => part[0]!.toUpperCase() + part.slice(1)).join('')

function literalId(node: Node): string | undefined {
  for (const prop of node.props ?? []) {
    if (prop.type === ATTRIBUTE && prop.name === 'id') return prop.value?.content
    if (prop.type !== ATTRIBUTE && prop.name === 'bind' && prop.arg?.content === 'id') {
      return /^\s*(['"`])([^'"`$]*)\1\s*$/.exec(prop.exp?.content ?? '')?.[2]
    }
  }
  return undefined
}

export interface SectionElement {
  id: string
  tag: string
  start: number
  end: number
  line: number
  /** Whether it has content between its tags, such as slots. */
  hasContent: boolean
}

/**
 * Section elements in a page's template: `VitaSection`, or a component from
 * `components`, with a literal id.
 */
export function sectionElements(source: string, components: Iterable<string> = []): Recognized<{ elements: SectionElement[], root?: Node }> {
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

  const elements: SectionElement[] = []
  const visit = (node: Node) => {
    if (node.type === ELEMENT && node.tag) {
      const tag = node.tag.includes('-') ? pascal(node.tag) : node.tag
      const id = known.has(tag) ? literalId(node) : undefined
      if (id) {
        const hasContent = (node.children ?? []).some(child => child.type !== 3 && !(child.type === 2 && !(child as unknown as { content: string }).content.trim()))
        elements.push({ id, tag: node.tag, start: node.loc.start.offset, end: node.loc.end.offset, line: node.loc.start.line, hasContent })
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(ast)
  const roots = (ast.children ?? []).filter(node => node.type === ELEMENT)
  return { ok: true, value: { elements, ...(roots.length === 1 ? { root: roots[0] } : {}) } }
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

/**
 * The page with one more section element: after `after`, else after the last
 * section, else at the end of the template's single root element.
 */
export function addSectionToPage(source: string, placement: VuePlacement, components: Iterable<string> = []): Recognized<{ source: string, afterSection?: string }> {
  const found = sectionElements(source, components)
  if (!found.ok) return found
  const { elements, root } = found.value
  if (elements.some(element => element.id === placement.id)) return { ok: false, reason: `it already shows ${placement.id}` }
  const element = sectionElementSource(placement)

  const anchor = (placement.after && elements.find(existing => existing.id === placement.after)) ?? elements[elements.length - 1]
  if (anchor) {
    const indent = indentationAt(source, anchor.start)
    return { ok: true, value: { source: insertLinesAfter(source, anchor.end - 1, [`${indent}${element}`]), afterSection: anchor.id } }
  }
  if (!root || !root.tag) return { ok: false, reason: 'its template has no single root element to add to' }
  const close = source.lastIndexOf(`</${root.tag}`, root.loc.end.offset)
  if (close === -1 || close < root.loc.start.offset || source.slice(lineStart(source, close), close).trim() !== '') {
    return { ok: false, reason: `its <${root.tag}> does not end on a line of its own` }
  }
  const indent = `${indentationAt(source, close)}  `
  return { ok: true, value: { source: insertLinesBefore(source, close, ['', `${indent}${element}`]) } }
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

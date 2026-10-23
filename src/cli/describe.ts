/**
 * Shared wording for what the inventory found.
 */
import type { Inventory, Problem, SectionInventory } from '../inventory'
import type { PdfPlacement, WebPlacement } from '../placements'

export function webPlacementsOf(inventory: Inventory, section: string): WebPlacement[] {
  return inventory.web.placements.filter(placement => placement.section === section)
}

export function pdfPlacementsOf(inventory: Inventory, section: string): PdfPlacement[] {
  return inventory.documents.flatMap(document => document.placements.filter(placement => placement.section === section))
}

/** Where a section appears on the website, in one short cell. */
export function webCell(inventory: Inventory, section: string): string {
  const placements = webPlacementsOf(inventory, section)
  if (!placements.length) return inventory.web.dynamic.length ? 'unknown' : '–'
  const counts = new Map<string, { count: number, where: boolean }>()
  for (const placement of placements) {
    const key = placement.route ?? placement.file.replace(/^app\/components\//, '').replace(/\.vue$/, '')
    const current = counts.get(key) ?? { count: 0, where: false }
    counts.set(key, { count: current.count + 1, where: current.where || placement.where !== undefined })
  }
  return [...counts].map(([key, { count, where }]) =>
    `${key}${count > 1 ? ` (×${count}${where ? ', where' : ''})` : where ? ' (where)' : ''}`).join(' ')
}

/** In which PDF documents a section appears, in one short cell. */
export function pdfCell(inventory: Inventory, section: string): string {
  const documents = [...new Set(pdfPlacementsOf(inventory, section).map(placement => placement.document))]
  return documents.length ? documents.join(', ') : '–'
}

/** Where a publication list appears: pages and PDF documents, or `not shown anywhere`. */
export function listPlacementsText(inventory: Inventory, list: string): string {
  const pages = inventory.web.publications.filter(placement => placement.list === list).map(placement => placement.route ?? placement.file)
  const documents = inventory.documents.filter(document => document.publications.some(placement => placement.list === list)).map(document => `${document.name} (pdf)`)
  const all = [...new Set([...pages, ...documents])]
  return all.length ? all.join(', ') : 'not shown anywhere'
}

/** Zod's `- 2.title: …` as people count: `entry 3, title: …`. */
export function readableIssue(line: string): string {
  return line.replace(/^(\s*)- (\d+)(?:\.([\w.-]+))?: /, (_match, indent: string, index: string, field?: string) =>
    `${indent}entry ${Number(index) + 1}${field ? `, ${field}` : ''}: `).replace(/^(\s*)- /, '$1')
}

/** The meaningful lines of a problem message, common indentation removed. */
export function messageLines(message: string): string[] {
  const lines = message.split('\n').filter(line => line.trim() && line.trim() !== 'invalid')
  const indent = Math.min(...lines.map(line => /^\s*/.exec(line)![0].length))
  return lines.map(line => readableIssue(line.slice(indent)))
}

export function firstLine(text: string): string {
  const lines = messageLines(text)
  const first = lines[0] ?? text
  return first.endsWith(':') ? first.slice(0, -1) : `${first}${lines.length > 1 ? ` (+${lines.length - 1} more)` : ''}`
}

/** `12 entries: 10 public, 1 cv, 1 private` */
export function countsText(section: SectionInventory): string {
  if (section.counts) {
    const total = section.counts.public + section.counts.cv + section.counts.private
    const parts = (['public', 'cv', 'private'] as const)
      .filter(level => section.counts![level] > 0)
      .map(level => `${section.counts![level]} ${level}`)
    return `${total} ${total === 1 ? 'entry' : 'entries'}${parts.length > 1 || (parts.length === 1 && !section.counts.public) ? `: ${parts.join(', ')}` : ''}`
  }
  if (section.entries !== undefined) return `${section.entries} ${section.entries === 1 ? 'entry' : 'entries'}`
  return ''
}

export function problemLines(problems: Problem[], indent = '  '): string[] {
  return problems.flatMap(problem => [
    `${indent}${problem.where}`,
    ...messageLines(problem.message).map(line => `${indent}  ${line}`),
  ])
}

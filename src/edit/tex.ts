/**
 * Add a `\vitasection` or `\vitapublications` line to a PDF document, after a
 * recognized one.
 */
import { findPdfPlacements, findPdfPublicationPlacements } from '../placements'
import { escapeTex } from '../tex/escape'
import { indentationAt, insertLinesAfter, insertLinesBefore, type Recognized } from './text'

/** `\vitasection[Heading]{id}`, the heading escaped for LaTeX. */
export function vitasectionLine(id: string, heading?: string): string {
  return `\\vitasection${heading ? `[${escapeTex(heading)}]` : ''}{${id}}`
}

/** `\vitapublications[Heading]{list}`, the heading escaped for LaTeX. */
export function vitapublicationsLine(list: string, heading?: string): string {
  return `\\vitapublications${heading ? `[${escapeTex(heading)}]` : ''}{${list}}`
}

export interface TexPlacement {
  id: string
  heading?: string
  /** Put the line after this section's (or list's) line; after the last one otherwise. */
  after?: string
}

/** Every recognized line, as anchors: sections, `\vitainput`s and lists. */
function anchors(source: string): { id: string, line: number }[] {
  return [
    ...findPdfPlacements('', '', source).map(placement => ({ id: placement.section, line: placement.line })),
    ...findPdfPublicationPlacements('', '', source).map(placement => ({ id: placement.list, line: placement.line })),
  ].sort((a, b) => a.line - b.line)
}

/** The document with `text` on a line of its own, after the anchor named `after` or the last one. */
function insertLine(source: string, text: string, after?: string): Recognized<{ source: string, line: number, afterSection?: string }> {
  const found = anchors(source)
  const lines = source.split('\n')
  const offsetOf = (lineNumber: number) => lines.slice(0, lineNumber - 1).reduce((sum, line) => sum + line.length + 1, 0)
  const anchor = (after && found.find(existing => existing.id === after)) ?? found[found.length - 1]
  if (anchor) {
    const offset = offsetOf(anchor.line)
    // A line holding more than the macro (`\section{…}\vitainput{…}`) is
    // still a line: the new one goes after it, indented like it.
    return {
      ok: true,
      value: { source: insertLinesAfter(source, offset, [`${indentationAt(source, offset)}${text}`]), line: anchor.line + 1, afterSection: anchor.id },
    }
  }
  const end = lines.findIndex(line => /^\s*\\end\{document\}/.test(line))
  if (end === -1) return { ok: false, reason: 'it has no \\end{document} line' }
  return { ok: true, value: { source: insertLinesBefore(source, offsetOf(end + 1), [text, '']), line: end + 1 } }
}

/** The document with the section added, and the line it is on. */
export function addSectionToDocument(source: string, placement: TexPlacement): Recognized<{ source: string, line: number, afterSection?: string }> {
  if (findPdfPlacements('', '', source).some(existing => existing.section === placement.id && existing.macro === 'vitasection')) {
    return { ok: false, reason: `it already includes ${placement.id}` }
  }
  return insertLine(source, vitasectionLine(placement.id, placement.heading), placement.after)
}

/** The document with a publication list added, and the line it is on. */
export function addPublicationsToDocument(source: string, placement: TexPlacement): Recognized<{ source: string, line: number, afterSection?: string }> {
  if (findPdfPublicationPlacements('', '', source).some(existing => existing.list === placement.id)) {
    return { ok: false, reason: `it already includes the list ${placement.id}` }
  }
  return insertLine(source, vitapublicationsLine(placement.id, placement.heading), placement.after)
}

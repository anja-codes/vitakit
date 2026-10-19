/**
 * Add a `\vitasection` line to a PDF document, after a recognized one.
 */
import { findPdfPlacements } from '../placements'
import { escapeTex } from '../tex/escape'
import { indentationAt, insertLinesAfter, insertLinesBefore, type Recognized } from './text'

/** `\vitasection[Heading]{id}`, the heading escaped for LaTeX. */
export function vitasectionLine(id: string, heading?: string): string {
  return `\\vitasection${heading ? `[${escapeTex(heading)}]` : ''}{${id}}`
}

export interface TexPlacement {
  id: string
  heading?: string
  /** Put the line after this section's line; after the last section otherwise. */
  after?: string
}

/** The document with the section added, and the line it is on. */
export function addSectionToDocument(source: string, placement: TexPlacement): Recognized<{ source: string, line: number, afterSection?: string }> {
  const placements = findPdfPlacements('', '', source)
  if (placements.some(existing => existing.section === placement.id && existing.macro === 'vitasection')) {
    return { ok: false, reason: `it already includes ${placement.id}` }
  }
  const line = vitasectionLine(placement.id, placement.heading)
  const lines = source.split('\n')
  const offsetOf = (lineNumber: number) => lines.slice(0, lineNumber - 1).reduce((sum, text) => sum + text.length + 1, 0)

  const anchor = (placement.after && placements.find(existing => existing.section === placement.after))
    ?? placements[placements.length - 1]
  if (anchor) {
    const offset = offsetOf(anchor.line)
    // A line holding more than the macro (`\section{…}\vitainput{…}`) is
    // still a line: the new one goes after it, indented like it.
    return {
      ok: true,
      value: { source: insertLinesAfter(source, offset, [`${indentationAt(source, offset)}${line}`]), line: anchor.line + 1, afterSection: anchor.section },
    }
  }
  const end = lines.findIndex(text => /^\s*\\end\{document\}/.test(text))
  if (end === -1) return { ok: false, reason: 'it has no \\end{document} line' }
  return { ok: true, value: { source: insertLinesBefore(source, offsetOf(end + 1), [line, '']), line: end + 1 } }
}

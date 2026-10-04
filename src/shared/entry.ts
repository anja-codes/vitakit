/**
 * Which fields of an entry are its title and its context.
 *
 * A generic section has no dedicated component or template, so both sides have
 * to guess: "what is the headline here, and what belongs on the second line?"
 * That guess lives here, once. It used to exist twice — in the TeX emitter and
 * in `VitaSection.vue` — with different field lists and different separators,
 * so the website and the PDF already disagreed about the same entry.
 *
 * Presentation stays with each side: the website joins with `·` and renders
 * HTML, the emitter joins with `,` and escapes. Only the *selection* is shared.
 */
import type { Entry, Institution } from './types'

/** Fields tried, in order, for the headline. */
export const TITLE_FIELDS: readonly string[] = ['title', 'position', 'degree', 'role', 'student']

/** Plain-text fields tried, in order, for the context line. */
export const SECONDARY_FIELDS: readonly string[] = ['student', 'role', 'event', 'term', 'degree']

/** Fields that may hold an institution, in order of preference. */
export const INSTITUTION_FIELDS: readonly string[] = ['institution', 'issuer', 'organisation']

/**
 * The field holding the entry's headline, or `undefined` when nothing fits.
 * Returns the field *name* so callers can render its value themselves: the
 * website needs the rendered HTML, the emitter the LaTeX source.
 */
export function entryTitleField(entry: Entry, fields: readonly string[] = TITLE_FIELDS): string | undefined {
  return fields.find((field) => {
    const value = entry[field]
    if (typeof value === 'string') return value.length > 0
    // A rendered richText field.
    return typeof value === 'object' && value !== null && 'html' in value
  })
}

/** A piece of the context line: plain text, or an institution that may link. */
export type SecondaryPart
  = | { kind: 'text', text: string }
    | { kind: 'institution', institution: Institution }

/**
 * The context line, as structured parts. The field used for the title is
 * skipped, so nothing appears twice.
 */
export function entrySecondaryParts(entry: Entry, titleField?: string): SecondaryPart[] {
  const parts: SecondaryPart[] = []

  for (const field of SECONDARY_FIELDS) {
    if (field === titleField) continue
    const value = entry[field]
    if (typeof value === 'string' && value.length > 0) parts.push({ kind: 'text', text: value })
  }

  for (const field of INSTITUTION_FIELDS) {
    const value = entry[field] as Institution | undefined
    if (value?.name) {
      parts.push({ kind: 'institution', institution: value })
      break
    }
  }

  if (typeof entry.location === 'string' && entry.location.length > 0) {
    parts.push({ kind: 'text', text: entry.location })
  }

  return parts
}

/**
 * The common Eta interface: format values, compose safe fragments, and emit
 * the standard CV macros. Field selection and collection policy live elsewhere.
 */
import { escapeRichTex, escapeTex, escapeUrl } from './escape'
import { formatDateRange } from '../shared/format'
import { fail } from '../issues'
import { isSitePath } from '../site-paths'
import type { DateRange, RichText } from '../shared/types'

export const SITE_PATH_HELP = 'is a path on the website, and the PDF can only link it with the address the '
  + 'site is published at: add it to content/profile.yml, e.g. `url: https://jane.example.org/`'

/**
 * Distinguish generated TeX from data when helpers are composed. Eta stringifies
 * these on output. Empty output is always the empty string, so `a || b` works.
 */
class Fragment {
  constructor(readonly value: string) {}
  toString(): string { return this.value }
}
type Output = Fragment | ''
/** Internal constructor, also used by the bibliography-specific renderer. */
export const fragment = (value: string): Output => value ? new Fragment(value) : ''

function isRichText(value: unknown): value is RichText {
  return typeof value === 'object' && value !== null
    && 'text' in value && typeof value.text === 'string'
    && 'html' in value && typeof value.html === 'string'
}

function isTemplate(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && 'raw' in value && Array.isArray(value.raw)
}

interface EntryLayout {
  date?: unknown
  title: unknown
  context?: unknown
}

/** `where` identifies the template; `source` identifies its content file. */
export function createTemplateHelpers(where: string, source: string) {
  const text = (value: unknown): Output => {
    if (value === undefined || value === null || value === '') return ''
    if (value instanceof Fragment) return value
    if (typeof value === 'string' || typeof value === 'boolean'
      || (typeof value === 'number' && Number.isFinite(value))) {
      return fragment(escapeTex(String(value)))
    }
    if (isRichText(value)) {
      try {
        return fragment(escapeRichTex(value.text))
      } catch (error) {
        return fail(where, error instanceof Error ? error.message : String(error))
      }
    }
    return fail(where, 'text expects text or a number; use date(...) or linked(...) for structured values')
  }

  /** URL-target escaping, not visible link rendering. */
  const url = (value: unknown): Output => {
    if (value === undefined || value === null || value === '') return ''
    if (typeof value !== 'string') return fail(where, 'url expects a URL string')
    if (isSitePath(value)) fail(source, `${value} ${SITE_PATH_HELP}`)
    return fragment(escapeUrl(value))
  }

  const linked = (value: unknown, target?: unknown): Output => {
    let label = value
    if (typeof value === 'object' && value !== null
      && !(value instanceof Fragment) && !isRichText(value)) {
      if ('label' in value && typeof value.label === 'string') label = value.label
      else return fail(where, 'linked expects text or { label, url? }; use `linked` in the section schema')
      if (target === undefined && 'url' in value) target = value.url
    }
    const body = text(label)
    if (!body) return ''
    const href = url(target)
    return href ? fragment(`\\href{${href}}{${body}}`) : body
  }

  const date = (value: unknown): Output => {
    if (value === undefined || value === null) return ''
    if (typeof value !== 'object' || !('from' in value)
      || typeof value.from !== 'object' || value.from === null
      || !('year' in value.from) || typeof value.from.year !== 'number'
      || !('point' in value) || typeof value.point !== 'boolean'
      || !('ongoing' in value) || typeof value.ongoing !== 'boolean') {
      return fail(where, 'date expects a normalized date; use dateRange in the collection schema')
    }
    return fragment(escapeTex(formatDateRange(value as DateRange)))
  }

  const join = (values: readonly unknown[], separator: unknown = ', '): Output => {
    if (!Array.isArray(values)) return fail(where, 'join expects an array of values')
    const parts = values.map(value => String(text(value))).filter(value => value !== '')
    return fragment(parts.join(String(text(separator))))
  }

  /** Literal chunks are trusted LaTeX; interpolations are data or fragments. */
  const optional = (strings: TemplateStringsArray, ...values: unknown[]): Output => {
    if (!isTemplate(strings) || strings.raw.length !== values.length + 1) {
      return fail(where, 'optional must be used as a tagged template: optional`...${value}...`')
    }
    if (values.some(value => value === undefined || value === null || value === '')) return ''
    const parts = values.map(text)
    if (parts.some(value => !value)) return ''
    return fragment(strings.raw.map((literal, index) => literal + (parts[index] ?? '')).join(''))
  }

  function note(value: unknown): Output
  function note(strings: TemplateStringsArray, ...values: unknown[]): Output
  function note(value: unknown, ...values: unknown[]): Output {
    const body = isTemplate(value) ? optional(value, ...values) : text(value)
    return body ? fragment(`\\vitanote{${body}}`) : ''
  }

  const entry = (layout: EntryLayout): Output => {
    if (typeof layout !== 'object' || layout === null || !Object.hasOwn(layout, 'title')
      || Object.keys(layout).some(key => !['date', 'title', 'context'].includes(key))) {
      return fail(where, 'vita.entry expects { title, date?, context? }')
    }
    // Empty slots are valid; unlike optional notes they must not hide the row.
    return fragment(`\\vitaentry{${text(layout.date)}}{${text(layout.title)}}{${text(layout.context)}}`)
  }

  return { text, date, linked, url, join, optional, vita: { entry, note } }
}

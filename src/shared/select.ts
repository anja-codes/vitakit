/**
 * Selecting entries by field: the `where` of a PDF document's `.yml` and of
 * `<VitaSection where>`. One implementation, so that the website and the PDF
 * cannot disagree about which entries match.
 *
 * Deliberately small: equality with one value, or with any of several. Values
 * are compared as text, so `where: { year: 2024 }` and `{ year: '2024' }` mean
 * the same.
 */
import type { Entry } from './types'

/** A value to compare with, or several of which any may match. */
export type WhereValue = string | number | boolean | readonly (string | number | boolean)[]

/** Field name -> wanted value(s). Every field must match. */
export type Where = Readonly<Record<string, WhereValue>>

/**
 * The comparable value of a field: `year` from the date, the source text of a
 * formatted-text field, the label of a link.
 */
export function fieldValue(entry: Entry, field: string): unknown {
  if (field === 'year' && !Object.hasOwn(entry, 'year')) {
    return (entry.date as { from?: { year: number } } | undefined)?.from?.year
  }
  const value = entry[field]
  if (typeof value === 'object' && value !== null && 'text' in value) return (value as { text: string }).text
  if (typeof value === 'object' && value !== null && 'label' in value) return (value as { label: string }).label
  return value
}

/** Whether an entry matches every field of `where`. */
export function matchesWhere(entry: Entry, where: Where): boolean {
  return Object.entries(where).every(([field, expected]) => {
    const wanted = (Array.isArray(expected) ? expected : [expected]).map(String)
    return wanted.includes(String(fieldValue(entry, field) ?? ''))
  })
}

/** The entries matching `where`; all of them when it is empty or absent. */
export function filterWhere<T extends Entry>(entries: readonly T[], where: Where | undefined): T[] {
  return where && Object.keys(where).length ? entries.filter(entry => matchesWhere(entry, where)) : [...entries]
}

/**
 * Presentation helpers shared by the website and the LaTeX side.
 *
 * These live in the package because they are logic: a date rendered one way on
 * the site and another way in the PDF is a bug, not a design choice.
 */
import type { DatePoint, DateRange } from './types'

export interface DateFormatOptions {
  locale?: string
  /** `numeric` gives 2024-03, `long` gives March 2024, `year` gives 2024. */
  precision?: 'auto' | 'year'
  /** Text for an open-ended range. */
  presentLabel?: string
}

function formatPoint(point: DatePoint, { locale = 'en', precision = 'auto' }: DateFormatOptions): string {
  if (precision === 'year' || point.month === undefined) return String(point.year)
  const date = new Date(Date.UTC(point.year, point.month - 1, point.day ?? 1))
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    ...(point.day === undefined ? {} : { day: 'numeric' }),
    timeZone: 'UTC',
  }).format(date)
}

/** `2019–2023`, `since 2023`, `March 2024`. */
export function formatDateRange(range: DateRange | undefined, options: DateFormatOptions = {}): string {
  if (!range) return ''
  const { presentLabel = 'present' } = options
  const from = formatPoint(range.from, options)
  if (range.point) return from
  if (range.ongoing) return `${from}–${presentLabel}`
  if (!range.to) return from
  const to = formatPoint(range.to, options)
  return from === to ? from : `${from}–${to}`
}

/** A sortable key, for user code that needs to order entries itself. */
export function dateSortKey(range: DateRange | undefined): string {
  return range?.from.sortKey ?? ''
}

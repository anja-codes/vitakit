/**
 * Zod building blocks shared by the built-in schemas and available to users
 * writing their own `schemas/*.ts`.
 *
 * Two rules keep user-written schemas consistent with built-in ones:
 *   - dates go through `dateRange`, so sorting and formatting behave the same
 *   - entries are strict objects, so a typo is an error rather than a silent
 *     missing field
 */
import { z } from 'zod'
import { richMarker } from './rich'
import { isSitePath, sitePathMarker, PATH_KEY, type SitePathMarker } from './site-paths'
import type { DatePoint, DateRange, RichTextMarker, Visibility } from './shared/types'

export { z }

export const text = z.string().trim().min(1)

/**
 * A field that may contain Markdown and mathematics, e.g. a talk or thesis
 * title containing `$k$`.
 *
 * Validation cannot render it (the renderer needs the deployment base URL and
 * can fail), so parsing only marks the value; `loadSection` renders every
 * marker afterwards, turning it into `{ text, html }`.
 */
export const richText = text.transform((value): RichTextMarker => richMarker(value))

/** An `http(s)` or `mailto` URL, nothing else: no `javascript:`, no `file:`. */
export const absoluteUrl = z.string().trim().refine(
  // One check, not `.url().refine(...)`: zod runs a refinement even after
  // `.url()` failed, and `new URL()` then throws instead of reporting.
  value => URL.canParse(value) && ['http:', 'https:', 'mailto:'].includes(new URL(value).protocol),
  'expected an http(s) or mailto URL',
)

/**
 * A link: an `http(s)` or `mailto` URL, or a path on the site such as
 * `/slides/talk.pdf` (a file in `public/`). A path is marked here and resolved
 * by `loadContent`, for the website against the deployment base path, for the
 * PDF against `profile.url`.
 */
export const url = z.string().trim().transform((value, context): string | SitePathMarker => {
  if (isSitePath(value) && !/\s/.test(value)) return sitePathMarker(value)
  const parsed = absoluteUrl.safeParse(value)
  if (parsed.success) return parsed.data
  context.addIssue({ code: 'custom', message: 'expected an http(s) or mailto URL, or a path on the site such as /slides/talk.pdf' })
  return z.NEVER
})

const DATE = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/

function parseDatePoint(value: string, context: z.RefinementCtx): DatePoint | undefined {
  const match = DATE.exec(value)
  if (!match) {
    context.addIssue({ code: 'custom', message: `expected a date like 2024, 2024-03 or 2024-03-15, got "${value}"` })
    return undefined
  }
  const [, y, m, d] = match
  const year = Number(y)
  const month = m === undefined ? undefined : Number(m)
  const day = d === undefined ? undefined : Number(d)

  if (month !== undefined && (month < 1 || month > 12)) {
    context.addIssue({ code: 'custom', message: `month out of range in "${value}"` })
    return undefined
  }
  if (day !== undefined) {
    const date = new Date(Date.UTC(year, month! - 1, day))
    if (date.getUTCMonth() !== month! - 1 || date.getUTCDate() !== day) {
      context.addIssue({ code: 'custom', message: `"${value}" is not a real date` })
      return undefined
    }
  }

  return {
    raw: value,
    year,
    month,
    day,
    // Pad missing parts so that 2024 < 2024-03 < 2024-03-15 sorts correctly.
    sortKey: `${String(year).padStart(4, '0')}-${String(month ?? 1).padStart(2, '0')}-${String(day ?? 1).padStart(2, '0')}`,
  }
}

const datePoint = z.union([z.string(), z.number().int()])
  .transform(value => String(value))

/**
 * A single date or a span. Accepts, in order of how people actually write CVs:
 *
 * ```yaml
 * date: 2024-03-15          # a point
 * date: { from: 2019, to: 2023 }
 * date: { from: 2023, to: present }
 * ```
 */
export const dateRange = z.union([
  datePoint,
  z.strictObject({
    from: datePoint,
    to: z.union([datePoint, z.literal('present')]).optional(),
  }),
]).transform((value, context): DateRange => {
  const source = typeof value === 'string' ? { from: value, to: undefined } : value
  const from = parseDatePoint(source.from, context)
  const ongoing = source.to === 'present'
  const to = source.to === undefined || ongoing ? undefined : parseDatePoint(source.to as string, context)

  if (!from || (source.to !== undefined && !ongoing && !to)) return z.NEVER

  if (to && to.sortKey < from.sortKey) {
    context.addIssue({ code: 'custom', message: `range ends (${to.raw}) before it starts (${from.raw})` })
    return z.NEVER
  }

  return { from, to, ongoing, point: typeof value === 'string' }
})

export const institution = z.union([
  text.transform(name => ({ name })),
  z.strictObject({ name: text, url: url.optional() }),
])

export const link = z.union([
  url.transform(value => ({
    label: typeof value === 'string' ? value.replace(/^https?:\/\//, '').replace(/\/$/, '') : value[PATH_KEY],
    url: value,
  })),
  z.strictObject({ label: text, url }),
])

export const visibility: z.ZodDefault<z.ZodEnum<Record<Visibility, Visibility>>>
  = z.enum(['public', 'cv', 'private']).default('public')

/**
 * Wrap an entry shape so that every section entry supports `visibility`.
 * Built-in and user schemas both go through this.
 */
export function entry<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject({ visibility, ...shape })
}

/** A list of entries: what a `content/<name>.yml` file must contain. */
export function section<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.array(entry(shape))
}

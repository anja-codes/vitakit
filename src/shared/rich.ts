/**
 * Reading a rich-text field, wherever it is consumed.
 *
 * A `richText` field is validated as a marker and rendered afterwards (the
 * renderer needs the deployment base URL, and a TeX error must name the field
 * that caused it), so consumers meet two shapes: `{ text, html }` after
 * rendering, and a plain string when a schema used `z.string()` instead.
 *
 * Every consumer used to test for this itself — the emitter, the static check
 * and `VitaSection.vue` each had their own version. They all go through these
 * two functions now, and none of them needs to know about the marker at all:
 * see `src/rich.ts` for the build-side half.
 */
import type { RichText } from './types'

function isRichText(value: unknown): value is RichText {
  return typeof value === 'object' && value !== null
    && typeof (value as RichText).text === 'string'
}

/** The plain-text form: Markdown source, for LaTeX, comparisons and `title=`. */
export function richSource(value: unknown): string {
  if (typeof value === 'string') return value
  return isRichText(value) ? value.text : ''
}

/** The rendered form, or `undefined` when there is nothing to render. */
export function richHtml(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (isRichText(value) && typeof value.html === 'string') return value.html
  return undefined
}

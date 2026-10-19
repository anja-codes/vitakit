/**
 * The build-side half of rich text: turning markers into rendered fields.
 *
 * `richText` cannot render during validation — the renderer needs the
 * deployment base URL, and a failure must be reported with the field that
 * caused it — so parsing only leaves a marker and this module replaces every
 * marker afterwards. The marker is internal: it never appears in
 * `VitakitContent`, and `vitakit verify` fails the build if one reaches the
 * output.
 */
import { fail } from './issues'
import type { Renderer } from './render'
import type { RichTextMarker } from './shared/types'

/** The single property that identifies an unrendered rich-text field. */
export const MARKER_KEY = '__vitakitRich'

export function isRichMarker(value: unknown): value is RichTextMarker {
  return typeof value === 'object' && value !== null && MARKER_KEY in value
}

/** Wrap a validated string as a marker. Used by the `richText` primitive. */
export function richMarker(value: string): RichTextMarker {
  return { [MARKER_KEY]: value }
}

/**
 * Replace every marker with its rendered form, at any depth.
 *
 * `path` names the field in an error message, `where` the file it came from.
 */
export function renderRichFields(value: unknown, renderer: Renderer, path: string, where: string): unknown {
  if (isRichMarker(value)) {
    try {
      return { text: value[MARKER_KEY], html: renderer.inline(value[MARKER_KEY]) }
    } catch (error) {
      fail(where, `${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => renderRichFields(item, renderer, `${path}[${index}]`, where))
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, renderRichFields(item, renderer, path ? `${path}.${key}` : key, where)],
    ))
  }
  return value
}

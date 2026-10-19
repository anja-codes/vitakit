/**
 * Add a menu entry to `content/profile.yml`, keeping everything else as is.
 */
import { isMap, isSeq, parseDocument } from 'yaml'
import { lineEnd, lineStart, type Recognized } from './text'

/** A YAML scalar: plain where that is safe, quoted otherwise. */
export function yamlScalar(value: string): string {
  return /^[A-Za-z0-9/][\w ./()'-]*$/.test(value) && !/(^|\s)#|:\s|\s$/.test(value) ? value : JSON.stringify(value)
}

export function addNavItem(source: string, item: { label: string, to: string }): Recognized<string> {
  const document = parseDocument(source)
  if (document.errors.length) return { ok: false, reason: `cannot be parsed: ${document.errors[0]!.message}` }
  if (!isMap(document.contents)) return { ok: false, reason: 'it is not a map of settings' }
  const entry = `- { label: ${yamlScalar(item.label)}, to: ${yamlScalar(item.to)} }`

  const nav = document.contents.get('nav', true)
  if (nav === undefined) {
    const ending = source.endsWith('\n') ? '' : '\n'
    return { ok: true, value: `${source}${ending}\nnav:\n  ${entry}\n` }
  }
  if (!isSeq(nav) || nav.flow) return { ok: false, reason: 'its nav is not a list with one entry per line' }
  if (nav.items.some(existing => isMap(existing) && existing.get('to') === item.to)) {
    return { ok: false, reason: `its menu already links ${item.to}` }
  }
  const last = nav.items[nav.items.length - 1] as { range?: [number, number, number] } | undefined
  if (!last?.range) return { ok: false, reason: 'its nav is empty; add the first entry by hand' }
  const start = lineStart(source, last.range[0])
  const prefix = /^[ \t]*-[ \t]*/.exec(source.slice(start))?.[0]
  if (!prefix) return { ok: false, reason: 'its nav entries are not one per line' }
  const end = lineEnd(source, last.range[1] - 1)
  const indent = prefix.slice(0, prefix.indexOf('-'))
  return { ok: true, value: `${source.slice(0, end)}\n${indent}${entry}${source.slice(end)}` }
}

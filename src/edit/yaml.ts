/**
 * Add a menu entry to `content/profile.yml` or a list to
 * `content/publication-lists.yml`, keeping everything else as is.
 */
import { isMap, isScalar, isSeq, parseDocument } from 'yaml'
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

/** A value in YAML flow style: `3`, `preprint`, `[a, b]`, `{ status: preprint }`. */
function flow(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(flow).join(', ')}]`
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([key, item]) => `${yamlScalar(key)}: ${flow(item)}`).join(', ')} }`
  return typeof value === 'string' ? yamlScalar(value) : String(value)
}

/** A publication list as YAML: its name, then one setting per line. */
export function publicationListYaml(name: string, settings: Record<string, unknown>): string {
  const lines = Object.entries(settings).filter(([, value]) => value !== undefined).map(([key, value]) => `  ${key}: ${flow(value)}`)
  return lines.length ? `${name}:\n${lines.join('\n')}` : `${name}: {}`
}

/** The line a list is declared on in `content/publication-lists.yml`, if it is. */
export function publicationListLine(source: string, name: string): number | undefined {
  const document = parseDocument(source)
  const pair = isMap(document.contents) ? document.contents.items.find(item => isScalar(item.key) && item.key.value === name) : undefined
  const offset = (pair?.key as { range?: [number, number, number] } | undefined)?.range?.[0]
  return offset === undefined ? undefined : source.slice(0, offset).split('\n').length
}

/** `content/publication-lists.yml` with one more list at its end. */
export function addPublicationList(source: string, name: string, settings: Record<string, unknown>): Recognized<string> {
  const document = parseDocument(source)
  if (document.errors.length) return { ok: false, reason: `cannot be parsed: ${document.errors[0]!.message}` }
  if (document.contents !== null && !isMap(document.contents)) return { ok: false, reason: 'it is not one list per name' }
  if (isMap(document.contents) && document.contents.flow) return { ok: false, reason: 'its lists are written on one line' }
  const line = publicationListLine(source, name)
  if (line !== undefined) return { ok: false, reason: `it has a list "${name}" already, on line ${line}` }
  const body = source.replace(/\s*$/, '')
  return { ok: true, value: `${body}${body ? '\n\n' : ''}${publicationListYaml(name, settings)}\n` }
}

/**
 * The `defineProps` line of a section component, typed for its sections.
 *
 * `vitakit customize --web` writes components whose `id` names the sections
 * they show, `id: 'talks' | 'talks-public'`, which types the entries in their
 * slots. Two edits need to read and change that line again: `customize --use`
 * adds a section to a component, and `migrate` types a component written by
 * vitakit 0.3 (`id?: string, entries?: Entry[]`).
 *
 * Only that one line, in the forms vitakit writes, is recognised; anything
 * else is the user's and is reported instead of rewritten.
 */
import { entryComponentProps, listComponentProps } from '../cli/snippets'
import type { Recognized } from './text'

/** What vitakit 0.3 wrote around VitaSection, and for a list of its own. */
const UNTYPED_ENTRY = 'const props = defineProps<{ id?: string, entries?: Entry[], title?: string, where?: Where, limit?: number }>()'
const UNTYPED_LIST = 'const props = defineProps<{ id: string, title?: string, where?: Where, limit?: number }>()'

const IDS = String.raw`'[a-z0-9-]+'(?:\s*\|\s*'[a-z0-9-]+')*`
const TYPED_ENTRY = new RegExp(String.raw`^const props = defineProps<\{ id: (${IDS}), entries\?: SectionEntries<(${IDS})>, title\?: string, where\?: Where, limit\?: number \}>\(\)$`, 'm')
const TYPED_LIST = new RegExp(String.raw`^const props = defineProps<\{ id: (${IDS}), title\?: string, where\?: Where, limit\?: number \}>\(\)$`, 'm')

export type ComponentKind = 'entry' | 'list'

export interface SectionProps {
  kind: ComponentKind
  /** The sections its `id` accepts; empty for an untyped 0.3 component. */
  ids: string[]
  /** Whether it still has 0.3's untyped props. */
  untyped: boolean
}

const parseIds = (type: string) => [...type.matchAll(/'([a-z0-9-]+)'/g)].map(match => match[1]!)

/** The props of a component vitakit wrote, or a reason they are not recognised. */
export function sectionProps(source: string): Recognized<SectionProps> {
  const lines = source.split('\n')
  if (lines.includes(UNTYPED_ENTRY)) return { ok: true, value: { kind: 'entry', ids: [], untyped: true } }
  if (lines.includes(UNTYPED_LIST)) return { ok: true, value: { kind: 'list', ids: [], untyped: true } }
  const entry = TYPED_ENTRY.exec(source)
  if (entry && entry[1] === entry[2]) return { ok: true, value: { kind: 'entry', ids: parseIds(entry[1]!), untyped: false } }
  const list = TYPED_LIST.exec(source)
  if (list) return { ok: true, value: { kind: 'list', ids: parseIds(list[1]!), untyped: false } }
  return { ok: false, reason: 'its defineProps is not the one vitakit writes' }
}

/**
 * The component typed for exactly `ids`, keeping its order of sections first;
 * `changed` is false when it is typed so already.
 */
export function typeSectionProps(source: string, ids: readonly string[]): Recognized<{ source: string, changed: boolean, from: SectionProps }> {
  const found = sectionProps(source)
  if (!found.ok) return found
  const { kind, ids: current, untyped } = found.value
  const wanted = [...new Set([...current, ...ids])]
  if (!untyped && wanted.length === current.length) return { ok: true, value: { source, changed: false, from: found.value } }

  const line = kind === 'entry' ? entryComponentProps(wanted) : listComponentProps(wanted)
  let result = untyped
    ? source.replace(kind === 'entry' ? UNTYPED_ENTRY : UNTYPED_LIST, line)
    : source.replace(kind === 'entry' ? TYPED_ENTRY : TYPED_LIST, line)
  if (untyped) result = retypeImports(result, kind)
  return { ok: true, value: { source: result, changed: result !== source, from: found.value } }
}

/**
 * The 0.3 component imported `type Entry` for its props; the typed one needs
 * `type SectionEntries` instead (around VitaSection), and a list component's
 * `computed<Entry[]>` no longer needs a type at all.
 */
function retypeImports(source: string, kind: ComponentKind): string {
  let result = source
  if (kind === 'list') result = result.replace('const entries = computed<Entry[]>(() => {', 'const entries = computed(() => {')
  const stillUsed = /\bEntry\b/.test(result.replace(/import[^\n]*from '@anja\.codes\/vitakit\/shared'/g, ''))
  return result.replace(/^(import (?:type )?\{)([^}\n]*)(\} from '@anja\.codes\/vitakit\/shared')$/m, (whole, start: string, names: string, end: string) => {
    const typeOnly = start.startsWith('import type')
    const list = names.split(',').map(name => name.trim()).filter(Boolean)
    const entry = list.findIndex(name => name.replace(/^type /, '') === 'Entry')
    const wanted = kind === 'entry' ? (typeOnly ? 'SectionEntries' : 'type SectionEntries') : undefined
    if (entry !== -1 && !stillUsed) list.splice(entry, 1)
    if (wanted && !list.some(name => name.replace(/^type /, '') === 'SectionEntries')) {
      // Before the first name that sorts after it, as vitakit writes imports.
      const at = list.findIndex(name => name.replace(/^type /, '').localeCompare('SectionEntries') > 0)
      list.splice(at === -1 ? list.length : at, 0, wanted)
    }
    if (!list.length) return ''
    // In the order the user wrote, so that the line changes no more than needed.
    return `${start} ${list.join(', ')} ${end}`
  })
}

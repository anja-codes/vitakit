/** The `defineProps` line of a section component: recognised, and typed for its sections. */
import { describe, expect, it } from 'vitest'
import { sectionProps, typeSectionProps } from '../src/edit/props'
import { entryComponent, listComponent } from '../src/cli/snippets'

/** A component as `vitakit customize --web` wrote it in 0.3. */
const ENTRY_03 = `<script setup lang="ts">
import type { Entry, Linked, RichText, Where } from '@anja.codes/vitakit/shared'

const props = defineProps<{ id?: string, entries?: Entry[], title?: string, where?: Where, limit?: number }>()

interface Thesis { title: RichText, supervisor?: Linked }
const thesis = (entry: Entry) => entry.thesis as Thesis | undefined
</script>
`
const LIST_03 = `<script setup lang="ts">
import { computed } from 'vue'
import { filterWhere, type DateRange, type Entry, type Where } from '@anja.codes/vitakit/shared'

const props = defineProps<{ id: string, title?: string, where?: Where, limit?: number }>()

const entries = computed<Entry[]>(() => {
  const selected = filterWhere(useSection(props.id), props.where)
  return props.limit ? selected.slice(0, props.limit) : selected
})
</script>
`

const value = <T>(result: { ok: true, value: T } | { ok: false, reason: string }): T => {
  if (!result.ok) throw new Error(result.reason)
  return result.value
}

describe('sectionProps', () => {
  it('recognises what customize writes, now and in 0.3', () => {
    expect(value(sectionProps(ENTRY_03))).toEqual({ kind: 'entry', ids: [], untyped: true })
    expect(value(sectionProps(LIST_03))).toEqual({ kind: 'list', ids: [], untyped: true })
    expect(value(sectionProps(entryComponent('talks', 'TalkSection', [], 'note')))).toEqual({ kind: 'entry', ids: ['talks'], untyped: false })
    expect(value(sectionProps(listComponent('talks', 'TalkList', [])))).toEqual({ kind: 'list', ids: ['talks'], untyped: false })
  })

  it('leaves props of the user\'s own alone', () => {
    expect(sectionProps('const props = defineProps<{ id: string, extra: number }>()\n')).toEqual({ ok: false, reason: 'its defineProps is not the one vitakit writes' })
  })
})

describe('typeSectionProps', () => {
  it('types a 0.3 component for its section, keeping the user\'s own code', () => {
    const { source, changed } = value(typeSectionProps(ENTRY_03, ['education']))
    expect(changed).toBe(true)
    expect(source).toContain(`const props = defineProps<{ id: 'education', entries?: SectionEntries<'education'>, title?: string, where?: Where, limit?: number }>()`)
    // Entry is still used by the user's helper, so it stays imported.
    expect(source).toContain(`import type { Entry, Linked, RichText, SectionEntries, Where } from '@anja.codes/vitakit/shared'`)
    expect(source).toContain('const thesis = (entry: Entry) => entry.thesis as Thesis | undefined')
  })

  it('drops the Entry import where nothing else uses it', () => {
    const plain = ENTRY_03.replace(/\ninterface[^]*?\| undefined\n/, '\n').replace('Entry, Linked, RichText, Where', 'Entry, Where')
    expect(value(typeSectionProps(plain, ['talks'])).source).toContain(`import type { SectionEntries, Where } from '@anja.codes/vitakit/shared'`)
    const list = value(typeSectionProps(LIST_03, ['talks', 'talks-public'])).source
    expect(list).toContain(`const props = defineProps<{ id: 'talks' | 'talks-public', title?: string, where?: Where, limit?: number }>()`)
    expect(list).toContain('const entries = computed(() => {')
    expect(list).toContain(`import { filterWhere, type DateRange, type Where } from '@anja.codes/vitakit/shared'`)
  })

  it('adds a section to a typed component, once', () => {
    const typed = entryComponent('talks', 'TalkSection', [], 'note')
    const both = value(typeSectionProps(typed, ['talks-public']))
    expect(both.source).toContain(`id: 'talks' | 'talks-public', entries?: SectionEntries<'talks' | 'talks-public'>`)
    expect(value(typeSectionProps(both.source, ['talks-public'])).changed).toBe(false)
    expect(value(typeSectionProps(both.source, ['talks'])).changed).toBe(false)
  })
})

/**
 * `@anja.codes/vitakit/shared`: the helpers the website and the PDF both use,
 * so that they cannot disagree about an entry.
 */
import { describe, expect, it } from 'vitest'
import { entrySecondaryParts, entryTitleField } from '../src/shared/entry'
import { formatDateRange } from '../src/shared/format'
import { richHtml, richSource } from '../src/shared/rich'
import { atMost } from '../src/shared/visibility'
import { dateRange } from '../src/primitives'
import type { Entry } from '../src/shared/types'

const entry = (fields: Record<string, unknown>): Entry => ({ id: 'x-0', visibility: 'public', ...fields })

describe('entryTitleField', () => {
  it('takes the first title-like field present', () => {
    expect(entryTitleField(entry({ title: 'A talk', position: 'Postdoc' }))).toBe('title')
    expect(entryTitleField(entry({ position: 'Postdoc', student: 'A. Student' }))).toBe('position')
    expect(entryTitleField(entry({ title: '', student: 'A. Student' }))).toBe('student')
  })

  it('recognises a rendered rich-text field', () => {
    expect(entryTitleField(entry({ title: { text: '$k$-ary', html: '<span/>' } }))).toBe('title')
  })

  it('returns undefined when nothing fits', () => {
    expect(entryTitleField(entry({ note: 'only a note' }))).toBeUndefined()
  })

  it('honours an explicit field list', () => {
    expect(entryTitleField(entry({ title: 'A', student: 'B' }), ['student'])).toBe('student')
  })
})

describe('entrySecondaryParts', () => {
  it('lists text fields, then one link, then the location', () => {
    expect(entrySecondaryParts(entry({
      title: 'A talk',
      event: 'AofA 2025',
      role: 'Speaker',
      institution: { label: 'TU Graz', url: 'https://tugraz.at' },
      location: 'Graz',
    }), 'title')).toEqual([
      { kind: 'text', text: 'Speaker' },
      { kind: 'text', text: 'AofA 2025' },
      { kind: 'linked', linked: { label: 'TU Graz', url: 'https://tugraz.at' } },
      { kind: 'text', text: 'Graz' },
    ])
  })

  it('skips the field used as the title', () => {
    expect(entrySecondaryParts(entry({ student: 'A. Student', degree: 'MSc' }), 'degree'))
      .toEqual([{ kind: 'text', text: 'A. Student' }])
  })

  it('takes only the first linked field', () => {
    expect(entrySecondaryParts(entry({ issuer: { label: 'B' }, institution: { label: 'A' } })))
      .toEqual([{ kind: 'linked', linked: { label: 'A' } }])
  })
})

describe('richSource / richHtml', () => {
  it('read a rendered field', () => {
    const rendered = { text: 'Random $k$-ary trees', html: '<span class="katex"/>' }
    expect(richSource(rendered)).toBe('Random $k$-ary trees')
    expect(richHtml(rendered)).toBe('<span class="katex"/>')
  })

  it('accept a plain string, for schemas that used z.string()', () => {
    expect(richSource('Plain title')).toBe('Plain title')
    expect(richHtml('Plain title')).toBe('Plain title')
  })

  it.each([undefined, null, 42, {}, { html: '<b/>' }, [], ''])('read %j as empty, never as "[object Object]"', (value) => {
    expect(richSource(value)).toBe('')
    expect(richHtml(value)).toBeUndefined()
  })
})

describe('formatDateRange', () => {
  const format = (value: unknown, options?: Parameters<typeof formatDateRange>[1]) =>
    formatDateRange(dateRange.parse(value), options)

  it('formats points, spans and open ends', () => {
    expect(format('2024')).toBe('2024')
    expect(format({ from: '2019', to: '2023' })).toBe('2019–2023')
    expect(format({ from: '2023', to: 'present' })).toBe('2023–present')
    expect(format({ from: '2023', to: 'present' }, { presentLabel: 'heute' })).toBe('2023–heute')
  })

  it('collapses a span that starts and ends at the same label', () => {
    expect(format({ from: '2021', to: '2021' })).toBe('2021')
    expect(format({ from: '2021-03', to: '2021-11' }, { precision: 'year' })).toBe('2021')
  })

  it('shows months and days where they were written', () => {
    expect(format('2024-03')).toBe('Mar 2024')
    expect(format('2024-03-15')).toBe('Mar 15, 2024')
    expect(format('2024-03', { precision: 'year' })).toBe('2024')
  })

  it('is empty for an entry without a date', () => {
    expect(formatDateRange(undefined)).toBe('')
  })
})

describe('atMost', () => {
  it.each([
    ['public', 'public', true],
    ['cv', 'public', false],
    ['cv', 'cv', true],
    ['private', 'cv', false],
    ['private', 'private', true],
    [undefined, 'public', true],
  ] as const)('%s within %s: %s', (value, limit, expected) => {
    expect(atMost(value, limit)).toBe(expected)
  })
})

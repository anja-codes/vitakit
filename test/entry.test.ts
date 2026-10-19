/**
 * The website and the PDF must agree about what an entry's headline is. These
 * assert the shared selection directly, since the two renderers only differ in
 * separators and escaping afterwards.
 */
import { describe, expect, it } from 'vitest'
import { entrySecondaryParts, entryTitleField } from '../src/shared/entry'
import type { Entry } from '../src/shared/types'

const entry = (fields: Record<string, unknown>): Entry =>
  ({ id: 'x-0', visibility: 'public', ...fields }) as Entry

describe('entryTitleField', () => {
  it('prefers title, then the position-like fields', () => {
    expect(entryTitleField(entry({ title: 'A talk', position: 'Postdoc' }))).toBe('title')
    expect(entryTitleField(entry({ position: 'Postdoc' }))).toBe('position')
    expect(entryTitleField(entry({ student: 'A. Student' }))).toBe('student')
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
  it('never repeats the field used as the title', () => {
    // `degree` outranks `student`, so the student name becomes the context.
    const supervision = entry({ student: 'A. Student', degree: 'MSc' })
    const title = entryTitleField(supervision)
    expect(title).toBe('degree')
    expect(entrySecondaryParts(supervision, title).map(part => part.kind === 'text' && part.text))
      .toEqual(['A. Student'])
  })

  it('keeps the institution structured so each side can link it', () => {
    const parts = entrySecondaryParts(entry({
      title: 'A talk',
      event: 'AofA 2025',
      institution: { label: 'TU Graz', url: 'https://tugraz.at' },
      location: 'Graz',
    }), 'title')
    expect(parts).toEqual([
      { kind: 'text', text: 'AofA 2025' },
      { kind: 'linked', linked: { label: 'TU Graz', url: 'https://tugraz.at' } },
      { kind: 'text', text: 'Graz' },
    ])
  })

  it('takes only the first institution-like field', () => {
    const parts = entrySecondaryParts(entry({ institution: { label: 'A' }, issuer: { label: 'B' } }))
    expect(parts).toEqual([{ kind: 'linked', linked: { label: 'A' } }])
  })
})

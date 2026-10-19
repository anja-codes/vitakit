import { describe, expect, it } from 'vitest'
import { draftExtension, draftSchema } from '../src/draft'
import { schemas } from '../src/schemas'

const fieldsOf = (entries: unknown[]) => Object.fromEntries(draftSchema('x', entries).fields.map(field => [field.name, field.code]))
const notesOf = (entries: unknown[], name: string) => draftSchema('x', entries).fields.find(field => field.name === name)!.notes

describe('drafting a schema from entries', () => {
  it('looks at every value, and only makes absent fields optional', () => {
    expect(fieldsOf([
      { date: 2024, title: 'A', venue: 'BRG', amount: 3, online: true },
      { date: { from: 2019, to: 'present' }, title: 'B', amount: 0, online: false },
    ])).toEqual({ date: 'dateRange', title: 'richText', venue: 'text.optional()', amount: 'z.number()', online: 'z.boolean()' })
  })

  it('keeps year-like numbers numbers, and suggests date only by name', () => {
    expect(fieldsOf([{ year: 2012, credits: 2014 }, { year: 2013, credits: 2015 }])).toEqual({ year: 'z.number()', credits: 'z.number()' })
    expect(notesOf([{ year: 2012 }, { year: 2013 }], 'year')).toContain('to sort entries by it, call this field date')
  })

  it('reads links where the layouts expect them, and { name, url } anywhere', () => {
    expect(fieldsOf([{ institution: 'Uni Graz', funder: { name: 'FWF', url: 'https://fwf.ac.at' }, host: 'Jane' }]))
      .toEqual({ institution: 'linked', funder: 'linked', host: 'text' })
  })

  it('suggests choices only for a few repeated short values, never decides them', () => {
    const entries = ['PI', 'PI', 'co-PI', 'co-PI'].map(role => ({ role }))
    expect(fieldsOf(entries)).toEqual({ role: 'text' })
    expect(notesOf(entries, 'role')[0]).toMatch(/values so far: PI, co-PI; to allow only these: z\.enum\(\['PI', 'co-PI'\]\)/)
    expect(notesOf([{ host: 'Jane' }, { host: 'John' }], 'host')).toEqual([])
  })

  it('shows dates in other forms written the vitakit way', () => {
    expect(notesOf([{ date: '03/2015' }], 'date')[0]).toMatch(/e\.g\. 2015-03$/)
    expect(notesOf([{ time: ['2012', '2014'] }], 'time')).toContain('if this is a period, write it as a date instead: { from: 2012, to: 2014 }, and call the field date to sort by it')
    expect(notesOf([{ time: ['since 07/2023'] }], 'time')).toContain('if this is a period, write it as a date instead: { from: 2023-07, to: present }, and call the field date to sort by it')
  })

  it('makes a mostly numeric field a number and names the values that are not', () => {
    const draft = draftSchema('x', [{ credits: 2 }, { credits: 3 }, { credits: '2 each' }])
    expect(draft.fields[0]).toEqual({ name: 'credits', code: 'z.number()', notes: ['mostly numbers; "2 each" is not: write a number, or use text'] })
    expect(draft.changes).toEqual(['credits, entry 3: Invalid input: expected number, received string'.replace('Invalid input: ', '')])
  })

  it('lists what the entries must change, grouped, as people count', () => {
    const draft = draftSchema('x', [{ type: ['A'], url: '' }, { type: 'B', url: '' }, { type: 'C' }, { type: ['D'], url: 'https://d.example' }])
    expect(draft.fields.map(field => field.code)).toEqual(['z.array(text)', 'url.optional()'])
    expect(draft.changes).toEqual([
      'url, entries 1, 2: empty; leave the field out',
      'type, entries 2, 3: expected array, received string',
    ])
  })

  it('quotes names that need it, and says entries without date keep file order', () => {
    const draft = draftSchema('x', [{ 'institution-url': 'https://a.example', title: 'T' }])
    expect(draft.source).toContain(`  'institution-url': url,`)
    expect(draft.source).toContain('// a name like institutionUrl needs no quotes')
    expect(draft.source).toContain('Without a field called `date`, entries keep the order of the file.')
    expect(draftSchema('x', [{ date: 2024 }]).source).not.toContain('order of the file')
  })

  it('drafts nested groups and lists of links', () => {
    expect(fieldsOf([{ project: { title: 'P', grant: 'P1' }, resources: [{ label: 'Slides', url: '/s.pdf' }] }]))
      .toEqual({ project: 'z.strictObject({\n    title: text,\n    grant: text,\n  })', resources: 'z.array(linked)' })
  })
})

describe('drafting the fields a schema is missing', () => {
  it('drafts only what the built-in schema does not have', () => {
    const extension = draftExtension(schemas.teaching, [
      { date: 2024, title: 'Analysis', term: 'WT', hours: 2 },
      { date: 2023, title: 'Algebra', hours: 3, type: ['Lecture'] },
    ])!
    expect(extension.fields.map(field => [field.name, field.code])).toEqual([['hours', 'z.number()'], ['type', 'z.array(text).optional()']])
    expect(extension.imports).toEqual(['text', 'z'])
    expect(extension.changes).toEqual([])
  })

  it('reports a missing required built-in field', () => {
    const extension = draftExtension(schemas.supervision, [{ student: 'A', title: 'T', ongoing: true }])!
    expect(extension.changes).toEqual(['date, entry 1: missing; every entry needs it'])
  })
})

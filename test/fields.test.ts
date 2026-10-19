import { describe, expect, it } from 'vitest'
import { describeSection, fieldSummary } from '../src/fields'
import { extendSection, schemas } from '../src/schemas'
import { dateRange, linked, richText, section, text, url, z } from '../src/primitives'

describe('field descriptions', () => {
  it('describes a built-in section in plain types', () => {
    const fields = describeSection(schemas.education)!
    expect(fields.map(field => [field.path, fieldSummary(field)])).toEqual([
      ['date', 'date, required'],
      ['degree', 'text, required'],
      ['institution', 'link, required'],
      ['thesis', 'group of fields, optional'],
      ['note', 'text, optional'],
    ])
    expect(fields[3]!.fields!.map(field => [field.path, fieldSummary(field)])).toEqual([
      ['thesis.title', 'formatted text, required'],
      ['thesis.type', 'text, optional'],
      ['thesis.supervisor', 'link, optional'],
      ['thesis.url', 'web address, optional'],
    ])
  })

  it('sees through extendSection, defaults, lists and enums', () => {
    const fields = describeSection(extendSection(schemas.supervision, {
      score: z.number().optional(),
      hosts: z.array(text).optional(),
      links: z.array(linked).default([]),
      level: z.enum(['bachelor', 'master']),
    }))!
    const byPath = Object.fromEntries(fields.map(field => [field.path, fieldSummary(field)]))
    expect(byPath).toMatchObject({
      ongoing: 'yes/no, default false',
      score: 'number, optional',
      hosts: 'list of text, optional',
      links: 'list of link, default []',
      level: 'one of bachelor, master, required',
    })
    expect(fields.some(field => field.path === 'visibility')).toBe(false)
  })

  it('calls anything it cannot name custom, without guessing', () => {
    const fields = describeSection(section({
      date: dateRange,
      title: richText,
      slides: url,
      either: z.union([z.string(), z.number()]),
      shout: text.transform(value => value.toUpperCase()),
    }))!
    expect(fields.map(field => field.type)).toEqual(['date', 'formatted-text', 'web-address', 'custom', 'custom'])
  })

  it('does not describe schemas that are not lists of entries', () => {
    expect(describeSection(z.object({ a: text }))).toBeUndefined()
  })
})

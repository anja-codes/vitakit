/** The Zod building blocks of built-in and user-written schemas. */
import { describe, expect, it } from 'vitest'
import { dateRange, linked, requiredLink, section, text, url } from '../src/primitives'
import { extendSection, schemas } from '../src/schemas'
import { sitePathMarker } from '../src/site-paths'
import { z } from 'zod'

const issues = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues.map(issue => issue.message) ?? []

describe('dateRange', () => {
  it('accepts a year, a month or a day, as a string or a YAML number', () => {
    expect(dateRange.parse('2024-03-15')).toEqual({
      from: { raw: '2024-03-15', year: 2024, month: 3, day: 15, sortKey: '2024-03-15' },
      to: undefined,
      ongoing: false,
      point: true,
    })
    expect(dateRange.parse(2024).from).toEqual({ raw: '2024', year: 2024, month: undefined, day: undefined, sortKey: '2024-01-01' })
  })

  it('accepts spans and open ends', () => {
    const span = dateRange.parse({ from: '2019', to: '2023-06' })
    expect(span).toMatchObject({ from: { year: 2019 }, to: { year: 2023, month: 6 }, ongoing: false, point: false })

    const ongoing = dateRange.parse({ from: 2023, to: 'present' })
    expect(ongoing).toMatchObject({ from: { year: 2023 }, to: undefined, ongoing: true, point: false })
  })

  it('pads sort keys so that precisions compare correctly', () => {
    const keys = ['2024-03-15', '2024', '2023-12', '2024-03'].map(value => dateRange.parse(value).from.sortKey)
    expect(keys.sort()).toEqual(['2023-12-01', '2024-01-01', '2024-03-01', '2024-03-15'])
  })

  it.each([
    ['March 2024', /expected a date like 2024/],
    ['2024-13', /month out of range/],
    ['2023-02-30', /not a real date/],
    [{ from: '2023', to: '2019' }, /range ends \(2019\) before it starts \(2023\)/],
    [{ from: '2023', to: 'sometime' }, /expected a date like 2024/],
  ])('rejects %j', (value, message) => {
    expect(issues(dateRange, value).join('\n')).toMatch(message)
  })
})

describe('url', () => {
  it.each(['https://example.org/a', 'http://example.org', 'mailto:jane@example.org'])('accepts %s as it is', (value) => {
    expect(url.parse(value)).toBe(value)
  })

  it('marks a path on the site, to be resolved once the base URL is known', () => {
    expect(url.parse('/slides/talk.pdf')).toEqual(sitePathMarker('/slides/talk.pdf'))
    expect(linked.parse({ label: 'CV', url: '/cv.pdf' })).toEqual({ label: 'CV', url: sitePathMarker('/cv.pdf') })
    expect(linked.parse('/cv.pdf')).toEqual({ label: '/cv.pdf', url: sitePathMarker('/cv.pdf') })
  })

  it.each(['slides/talk.pdf', '//cdn.example.org/x', '/with space.pdf', 'javascript:alert(1)', 'file:///etc/passwd'])('rejects %s, saying what is expected', (value) => {
    expect(issues(url, value)).toEqual(['expected an http(s) or mailto URL, or a path on the site such as /slides/talk.pdf'])
  })
})

describe('linked', () => {
  it('accepts a label, a URL, or an object with label or name', () => {
    expect(linked.parse('TU Graz')).toEqual({ label: 'TU Graz' })
    expect(linked.parse('https://example.org/a/')).toEqual({ label: 'example.org/a', url: 'https://example.org/a/' })
    expect(linked.parse('mailto:jane@example.org')).toEqual({ label: 'jane@example.org', url: 'mailto:jane@example.org' })
    expect(linked.parse({ label: 'TU Graz', url: 'https://tugraz.at' })).toEqual({ label: 'TU Graz', url: 'https://tugraz.at' })
    expect(linked.parse({ name: 'TU Graz', url: 'https://tugraz.at' })).toEqual({ label: 'TU Graz', url: 'https://tugraz.at' })
    expect(linked.parse({ name: 'TU Graz' })).toEqual({ label: 'TU Graz' })
  })

  it('treats text that is not a URL as a label, even when it has a colon', () => {
    expect(linked.parse('Talk: an introduction')).toEqual({ label: 'Talk: an introduction' })
  })

  it('rejects unknown keys, both label and name, and invalid URLs in objects', () => {
    for (const value of [{ name: 'X', link: 'https://x.org' }, { name: 'X', label: 'Y' }, { label: 'X', url: 'javascript:alert(1)' }, '']) {
      expect(linked.safeParse(value).success, JSON.stringify(value)).toBe(false)
    }
  })

  it('can require a URL', () => {
    expect(requiredLink.safeParse('https://example.org').success).toBe(true)
    expect(issues(requiredLink, { label: 'ORCID' })).toEqual(['expected a URL, or { label, url }'])
  })
})

describe('section', () => {
  const talks = section({ date: dateRange, title: text })

  it('defaults visibility to public', () => {
    expect(talks.parse([{ date: 2024, title: 'A talk' }])[0]!.visibility).toBe('public')
  })

  it('rejects an unknown visibility and a misspelt field', () => {
    expect(talks.safeParse([{ date: 2024, title: 'x', visibility: 'secret' }]).success).toBe(false)
    expect(JSON.stringify(talks.safeParse([{ date: 2024, titel: 'A talk' }]).error!.issues)).toContain('titel')
  })
})

describe('extendSection', () => {
  const extended = extendSection(schemas.teaching, { evaluationScore: z.number().optional() })

  it('adds a field to a built-in section', () => {
    expect(extended.parse([{ date: 2024, title: 'Course', evaluationScore: 1.3 }])[0]!.evaluationScore).toBe(1.3)
  })

  it('keeps the built-in fields and their strictness', () => {
    expect(extended.safeParse([{ date: 2024, evaluationScore: 1.3 }]).success).toBe(false)
    expect(extended.safeParse([{ date: 2024, title: 'Course', titel: 'Course' }]).success).toBe(false)
  })
})

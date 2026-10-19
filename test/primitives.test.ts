import { describe, expect, it } from 'vitest'
import { dateRange, linked, requiredLink, section, text, url, z } from '../src/primitives'
import { sitePathMarker } from '../src/site-paths'
import { formatDateRange } from '../src/shared/format'

const parse = <T extends z.ZodType>(schema: T, value: unknown) => schema.safeParse(value)

describe('dateRange', () => {
  it('accepts the three precisions people actually write', () => {
    for (const [value, expected] of [['2024', 2024], ['2024-03', 2024], ['2024-03-15', 2024]] as const) {
      const result = parse(dateRange, value)
      expect(result.success, value).toBe(true)
      expect(result.data!.from.year).toBe(expected)
      expect(result.data!.point).toBe(true)
    }
  })

  it('accepts a year given as a number, because YAML unquotes it', () => {
    expect(parse(dateRange, 2024).success).toBe(true)
  })

  it('sorts correctly across precisions', () => {
    const keys = ['2024', '2024-03', '2024-03-15', '2023-12']
      .map(value => parse(dateRange, value).data!.from.sortKey)
    expect([...keys].sort()).toEqual(['2023-12-01', '2024-01-01', '2024-03-01', '2024-03-15'])
  })

  it('handles spans and open ends', () => {
    const span = parse(dateRange, { from: '2019', to: '2023' }).data!
    expect(span.ongoing).toBe(false)
    expect(span.to!.year).toBe(2023)

    const ongoing = parse(dateRange, { from: '2023', to: 'present' }).data!
    expect(ongoing.ongoing).toBe(true)
    expect(ongoing.to).toBeUndefined()
  })

  it('rejects impossible and inverted dates', () => {
    expect(parse(dateRange, '2024-13').success).toBe(false)
    expect(parse(dateRange, '2023-02-30').success).toBe(false)
    expect(parse(dateRange, 'March 2024').success).toBe(false)
    const inverted = parse(dateRange, { from: '2023', to: '2019' })
    expect(inverted.success).toBe(false)
    expect(inverted.error!.issues[0]!.message).toMatch(/ends .* before it starts/)
  })
})

describe('formatDateRange', () => {
  const of = (value: unknown) => parse(dateRange, value).data!

  it('formats points, spans and open ends', () => {
    expect(formatDateRange(of('2024'))).toBe('2024')
    expect(formatDateRange(of({ from: '2019', to: '2023' }))).toBe('2019–2023')
    expect(formatDateRange(of({ from: '2023', to: 'present' }))).toBe('2023–present')
    expect(formatDateRange(of({ from: '2021', to: '2021' }))).toBe('2021')
  })

  it('respects month precision and the year override', () => {
    expect(formatDateRange(of('2024-03'))).toMatch(/Mar 2024/)
    expect(formatDateRange(of('2024-03'), { precision: 'year' })).toBe('2024')
  })
})

describe('url', () => {
  it('accepts http(s) and mailto URLs', () => {
    for (const value of ['https://example.org/a', 'http://example.org', 'mailto:jane@example.org']) {
      expect(parse(url, value).data).toBe(value)
    }
  })

  it('marks a path on the site, to be resolved once the base URL is known', () => {
    expect(parse(url, '/slides/talk.pdf').data).toEqual(sitePathMarker('/slides/talk.pdf'))
    expect(parse(linked, { label: 'CV', url: '/cv.pdf' }).data).toEqual({ label: 'CV', url: sitePathMarker('/cv.pdf') })
    expect(parse(linked, '/cv.pdf').data).toEqual({ label: '/cv.pdf', url: sitePathMarker('/cv.pdf') })
  })

  it('rejects anything else, saying what is expected', () => {
    for (const value of ['slides/talk.pdf', '//cdn.example.org/x', '/with space.pdf', 'javascript:alert(1)', 'file:///etc/passwd']) {
      const result = parse(url, value)
      expect(result.success, value).toBe(false)
      expect(result.error?.issues[0]?.message).toMatch(/or a path on the site such as \/slides\/talk\.pdf/)
    }
  })
})

describe('linked', () => {
  it('accepts a label, a URL, or an object with label or name', () => {
    expect(parse(linked, 'TU Graz').data).toEqual({ label: 'TU Graz' })
    expect(parse(linked, 'https://example.org/a').data).toEqual({ label: 'example.org/a', url: 'https://example.org/a' })
    expect(parse(linked, 'mailto:jane@example.org').data).toEqual({ label: 'jane@example.org', url: 'mailto:jane@example.org' })
    expect(parse(linked, { label: 'TU Graz', url: 'https://tugraz.at' }).data)
      .toEqual({ label: 'TU Graz', url: 'https://tugraz.at' })
    expect(parse(linked, { name: 'TU Graz', url: 'https://tugraz.at' }).data)
      .toEqual({ label: 'TU Graz', url: 'https://tugraz.at' })
    expect(parse(linked, { name: 'TU Graz' }).data).toEqual({ label: 'TU Graz' })
  })

  it('treats text that is not a URL as a label, even when it has a colon', () => {
    expect(parse(linked, 'Talk: an introduction').data).toEqual({ label: 'Talk: an introduction' })
  })

  it('rejects unknown keys, both label and name, and invalid URLs in objects', () => {
    expect(parse(linked, { name: 'X', link: 'https://x.org' }).success).toBe(false)
    expect(parse(linked, { name: 'X', label: 'Y' }).success).toBe(false)
    expect(parse(linked, { label: 'X', url: 'javascript:alert(1)' }).success).toBe(false)
    expect(parse(linked, '').success).toBe(false)
  })

  it('can require a URL', () => {
    expect(parse(requiredLink, 'https://example.org').success).toBe(true)
    expect(parse(requiredLink, { label: 'ORCID' }).error?.issues[0]?.message).toMatch(/expected a URL/)
  })
})

describe('section', () => {
  const talks = section({ date: dateRange, title: text })

  it('defaults visibility to public and rejects typos', () => {
    const ok = parse(talks, [{ date: '2024', title: 'A talk' }])
    expect(ok.data![0]!.visibility).toBe('public')

    const typo = parse(talks, [{ date: '2024', titel: 'A talk' }])
    expect(typo.success).toBe(false)
    expect(JSON.stringify(typo.error!.issues)).toMatch(/titel/)
  })

  it('accepts the visibility levels used by the LaTeX side', () => {
    expect(parse(talks, [{ date: '2024', title: 'x', visibility: 'cv' }]).success).toBe(true)
    expect(parse(talks, [{ date: '2024', title: 'x', visibility: 'secret' }]).success).toBe(false)
  })
})

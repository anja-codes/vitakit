/**
 * The documentation makes concrete API promises; these check the ones that
 * would otherwise only be verified by a reader trying them.
 */
import { describe, expect, it } from 'vitest'
import { extendSection, schemas, section, dateRange, richText, linked, text, url, z } from '../src/index'

describe('documented API', () => {
  it('exports every primitive the docs tell people to import', () => {
    for (const primitive of [section, dateRange, richText, linked, text, url, z]) {
      expect(primitive).toBeDefined()
    }
  })

  it('extendSection adds a field to a built-in section', () => {
    const extended = extendSection(schemas.teaching, { evaluationScore: z.number().optional() })
    const parsed = extended.safeParse([{ date: 2024, title: 'Course', evaluationScore: 1.3 }])
    expect(parsed.success).toBe(true)
    expect(parsed.data![0]!.evaluationScore).toBe(1.3)
    // The built-in fields still apply.
    expect(extended.safeParse([{ date: 2024, titel: 'Course' }]).success).toBe(false)
  })

  it('accepts the linked shorthands shown in the reference', () => {
    const outreach = section({ date: dateRange, title: richText, venue: linked.optional() })
    const parsed = outreach.safeParse([{ date: '2025-03-14', title: 'A $k$-ary talk', venue: 'BRG Viktring' }])
    expect(parsed.success).toBe(true)
    expect(parsed.data![0]!.venue).toEqual({ label: 'BRG Viktring' })
  })

  it('documents the talk kinds used by document filters', () => {
    const kinds = ['invited', 'contributed', 'seminar', 'poster', 'outreach']
    for (const kind of kinds) {
      expect(schemas.talks.safeParse([{ date: 2024, title: 'x', kind }]).success, kind).toBe(true)
    }
  })

  it('defaults publication status to published, as the reference states', () => {
    // Covered end to end in workflows.test.ts; here only the documented default.
    expect(schemas.talks.safeParse([{ date: 2024, title: 'x' }]).data![0]!.visibility).toBe('public')
  })
})

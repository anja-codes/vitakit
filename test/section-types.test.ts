/**
 * Typed section entries: `extendSection` keeps its types, `SectionEntry` is an
 * entry as a component receives it, and the Nuxt module's declaration file
 * names each section's schema.
 *
 * The type assertions are checked by `pnpm typecheck` (which includes
 * test/); at run time they are no-ops.
 */
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { extendSection, schemas } from '../src/schemas'
import { linked, section, text, url, richText, dateRange, z } from '../src/primitives'
import { sectionTypeSources, sectionTypesDeclaration } from '../src/section-types'
import type { DateRange, Entry, RichText, SectionEntries, SectionEntry, Visibility } from '../src/shared/types'
import { project } from './support/project'

describe('SectionEntry', () => {
  it('is what a component receives: rendered text, resolved links, an id', () => {
    type Talk = SectionEntry<typeof schemas.talks>
    expectTypeOf<Talk['title']>().toEqualTypeOf<RichText>()
    expectTypeOf<Talk['slides']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<Talk['date']>().toEqualTypeOf<DateRange>()
    expectTypeOf<Talk['kind']>().toEqualTypeOf<'invited' | 'contributed' | 'seminar' | 'poster' | 'outreach' | undefined>()
    expectTypeOf<Talk['id']>().toEqualTypeOf<string>()
    expectTypeOf<Talk['visibility']>().toEqualTypeOf<Visibility>()
    // @ts-expect-error a field the schema does not have
    expectTypeOf<Talk['titel']>()
  })

  it('maps nested groups and links, at any depth', () => {
    type Education = SectionEntry<typeof schemas.education>
    type Thesis = NonNullable<Education['thesis']>
    expectTypeOf<Thesis['title']>().toEqualTypeOf<RichText>()
    expectTypeOf<NonNullable<Thesis['supervisor']>>().toEqualTypeOf<{ label: string, url?: string }>()
    expectTypeOf<Education['institution']>().toEqualTypeOf<{ label: string, url?: string }>()
  })

  it('maps lists of values', () => {
    const grants = section({ date: dateRange, funders: z.array(linked), links: z.array(url).optional(), abstracts: z.array(richText) })
    type Grant = SectionEntry<typeof grants>
    expectTypeOf<Grant['funders']>().toEqualTypeOf<{ label: string, url?: string }[]>()
    expectTypeOf<Grant['links']>().toEqualTypeOf<string[] | undefined>()
    expectTypeOf<Grant['abstracts']>().toEqualTypeOf<RichText[]>()
  })

  it('goes wherever an Entry is expected', () => {
    expectTypeOf<SectionEntry<typeof schemas.talks>>().toExtend<Entry>()
  })
})

describe('extendSection', () => {
  it('keeps the built-in fields and adds the new ones', () => {
    const extended = extendSection(schemas.education, { evaluation: text.optional() })
    type Education = SectionEntry<typeof extended>
    expectTypeOf<Education['degree']>().toEqualTypeOf<string>()
    expectTypeOf<Education['evaluation']>().toEqualTypeOf<string | undefined>()
    expectTypeOf<NonNullable<Education['thesis']>['title']>().toEqualTypeOf<RichText>()
  })

  it('extends a nested group, as a project does to add a co-supervisor', () => {
    const extended = extendSection(schemas.education, {
      thesis: schemas.education.element.shape.thesis.unwrap().extend({ cosupervisor: linked.optional() }).optional(),
    })
    type Thesis = NonNullable<SectionEntry<typeof extended>['thesis']>
    expectTypeOf<NonNullable<Thesis['cosupervisor']>>().toEqualTypeOf<{ label: string, url?: string }>()
    expectTypeOf<Thesis['title']>().toEqualTypeOf<RichText>()
  })

  it('is still strict about fields at run time', () => {
    const extended = extendSection(schemas.education, { evaluation: text.optional() })
    expect(extended.safeParse([{ date: 2020, degree: 'PhD', institution: 'Graz', evaluation: 'good' }]).success).toBe(true)
    expect(extended.safeParse([{ date: 2020, degree: 'PhD', institution: 'Graz', evalution: 'good' }]).success).toBe(false)
  })
})

describe('SectionEntries', () => {
  it('falls back to Entry for a section the project does not declare', () => {
    expectTypeOf<SectionEntries<'not-a-section'>>().toEqualTypeOf<Entry[]>()
    expectTypeOf<SectionEntries<string>>().toEqualTypeOf<Entry[]>()
  })
})

describe('the declaration file', () => {
  it('names the project\'s schema where there is one, the built-in one otherwise', async () => {
    const root = await project({
      'content/talks.yml': '- { date: 2024, title: T }\n',
      'content/education.yml': '- { date: 2020, degree: PhD, institution: Graz }\n',
      'content/grants.yml': '- { date: 2024, title: G }\n',
      'content/orphans.yml': '- { title: no schema anywhere }\n',
      'schemas/education.ts': `import { extendSection, schemas, text } from '@anja.codes/vitakit'\nexport default extendSection(schemas.education, { evaluation: text.optional() })\n`,
      'schemas/grants.ts': `import { section, text, dateRange } from '@anja.codes/vitakit'\nexport default section({ date: dateRange, title: text })\n`,
    })
    const sources = await sectionTypeSources(root)
    expect(sources.map(source => source.id)).toEqual(['education', 'grants', 'talks'])

    const declaration = sectionTypesDeclaration(sources, join(root, '.nuxt'))
    expect(declaration).toContain(`    "education": SectionEntry<typeof import('../../schemas/education').default>\n`)
    expect(declaration).toContain(`    "grants": SectionEntry<typeof import('../../schemas/grants').default>\n`)
    expect(declaration).toContain(`    "talks": SectionEntry<typeof import('@anja.codes/vitakit').schemas["talks"]>\n`)
    expect(declaration).toContain(`declare module '@anja.codes/vitakit/shared' {\n  interface VitakitSections {\n`)
    expect(declaration).not.toContain('orphans')
  })

  it('is empty, not broken, without a content folder', async () => {
    const root = await project({})
    const declaration = sectionTypesDeclaration(await sectionTypeSources(root), join(root, '.nuxt'))
    expect(declaration).toContain('  interface VitakitSections {\n  }\n')
  })
})

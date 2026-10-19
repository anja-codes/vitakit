import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { cli } from './cli'
import { exampleProject as project, readProjectFile } from './project'

const read = readProjectFile

const GRANTS = [
  '- date: 2023',
  '  title: Scaling limits of random trees',
  '  funder: { name: FWF, url: https://fwf.ac.at }',
  '  amount: 342000',
  '  role: PI',
  '- date: { from: 2021, to: 2022 }',
  '  title: Travel grant',
  '  funder: ÖMG',
  '  amount: 1500',
  '  role: sole applicant',
  '',
].join('\n')

describe('add section, with flags', () => {
  it('drafts a schema from the entries and places the section on a page and in a PDF', async () => {
    const root = await project({ 'content/grants.yml': GRANTS })
    const result = await cli(['add', 'section', 'grants', '--page', '/cv/', '--document', 'cv', '--after', 'education', '--title', 'Grants & funding', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('+ schemas/grants.ts')
    expect(result.out).toContain('Accepted, but not shown by the standard layout: funder, amount.')

    const schema = await read(root, 'schemas/grants.ts')
    expect(schema).toContain('  funder: linked,')
    expect(schema).toContain('  amount: z.number(),')
    expect(await read(root, 'app/pages/cv.vue')).toContain('<VitaSection id="education" title="Education" />\n    <VitaSection id="grants" title="Grants &amp; funding" />\n')
    expect(await read(root, 'cv-tex/cv.tex')).toContain('\\vitasection[Education]{education}\n\\vitasection[Grants \\& funding]{grants}\n')

    const content = await loadContent(root, { strict: true })
    expect(content.sections.grants!.map(entry => entry.funder)).toEqual([{ label: 'FWF', url: 'https://fwf.ac.at' }, { label: 'ÖMG' }])
    expect((await cli(['validate'], { cwd: root })).code).toBe(0)
    expect((await cli(['status'], { cwd: root })).out).toMatch(/grants\s+2 entries\s+\/cv\/\s+cv/)

    // Again: everything exists, nothing to do.
    const again = await cli(['add', 'section', 'grants', '--page', '/cv/', '--document', 'cv', '--yes'], { cwd: root })
    expect(again.out).toContain('= app/pages/cv.vue   already shows grants')
    expect(again.out).toContain('Nothing to write.')
  })

  it('says what the entries must change for the draft, before writing', async () => {
    const root = await project({
      'content/supervision.yml': null,
      'content/theses.yml': '- { student: A, studenturl: "", year: 2021 }\n- { student: B, studenturl: https://b.example, year: "2022" }\n',
    })
    const result = await cli(['add', 'section', 'theses', '--dry-run'], { cwd: root })
    expect(result.code).toBe(0)
    expect(result.out).toContain('The drafted schema does not accept every entry yet. In content/theses.yml, change:')
    expect(result.out).toContain('studenturl, entry 1: empty; leave the field out')
    expect(result.out).toContain('// some entries write the number in quotes; remove them')
    expect(result.out).toContain('Dry run: nothing was written.')
    expect(existsSync(join(root, 'schemas/theses.ts'))).toBe(false)
  })

  it('creates a starter for a new custom section, and an empty file for a built-in one', async () => {
    const root = await project({ 'content/teaching.yml': null })
    expect((await cli(['add', 'section', 'outreach', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'content/outreach.yml')).toContain('- date: 2025-03-14')
    expect(await read(root, 'schemas/outreach.ts')).toContain('title: richText,')

    const builtIn = await cli(['add', 'section', 'teaching', '--yes'], { cwd: root })
    expect(builtIn.out).toContain('+ content/teaching.yml   empty for now; vitakit already knows the teaching fields')
    expect(existsSync(join(root, 'schemas/teaching.ts'))).toBe(false)
    expect(await read(root, 'content/teaching.yml')).toContain('# - date: 2025-03\n#   title: Text with *emphasis* and $k$-ary trees\n')
    const content = await loadContent(root, { strict: true })
    expect(content.sections.teaching).toEqual([])
    expect(content.sections.outreach).toHaveLength(1)
  })

  it('shares the schema of a section whose fields the entries have', async () => {
    const root = await project({ 'content/talks-public.yml': '- { date: 2024, title: Maths night, kind: outreach }\n' })
    const hint = await cli(['add', 'section', 'talks-public', '--dry-run'], { cwd: root })
    expect(hint.out).toContain('Its entries fit the schema of talks: --like talks would share it.')

    const result = await cli(['add', 'section', 'talks-public', '--like', 'talks', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(await read(root, 'schemas/talks-public.ts')).toContain('export default schemas.talks')
    expect((await cli(['explain', 'talks-public'], { cwd: root })).out).toMatch(/schema\s+schemas\/talks-public\.ts, the same as talks/)
    expect((await cli(['validate', 'talks-public'], { cwd: root })).code).toBe(0)
  })

  it('creates a page given by its route', async () => {
    const root = await project({ 'content/grants.yml': GRANTS })
    expect((await cli(['add', 'section', 'grants', '--page', '/funding/', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'app/pages/funding.vue')).toContain('    <VitaSection id="grants" title="Grants" />\n  </article>')
    expect(await read(root, 'content/profile.yml')).toContain('  - { label: Funding, to: /funding/ }')
  })

  it.each([
    [['add', 'section', 'profile'], /reserved/],
    [['add', 'section', 'Grants'], /kebab-case/],
    [['add', 'section', 'publications'], /publications\.bib/],
    [['add', 'section', 'grants', '--page', '/nope/x/'], /no Vue page has this route/],
    [['add', 'section', 'grants', '--document', 'nope'], /no cv-tex\/nope\.tex/],
    [['add', 'section', 'grants', '--like', 'nope'], /no section "nope"/],
  ])('refuses %s', async (args, message) => {
    const result = await cli([...args, '--yes'], { cwd: await project({ 'content/grants.yml': GRANTS }) })
    expect(result.code).toBe(1)
    expect(result.err).toMatch(message)
  })
})

describe('add section, asking', () => {
  it('asks where, after what, and the heading, then confirms', async () => {
    const root = await project({ 'content/grants.yml': GRANTS })
    // /cv/ (Enter) · after: 2 = education · PDF: yes · after: 2 = education · heading · write
    const result = await cli(['add', 'section', 'grants'], { cwd: root, answers: ['', '2', '', '2', 'Grants and funding', ''] })
    expect(result.code, result.err).toBe(0)
    expect(result.asked).toEqual(['> ', '> ', '\nInclude grants in the PDF cv-tex/cv.tex? [Y/n] ', '> ', '\nHeading [Grants]: ', '\nWrite these changes? [Y/n] '])
    expect(result.out).toContain('Show grants on which page of your website?')
    expect(result.out).toMatch(/2 {2}\/cv\/ {2}\(app\/pages\/cv\.vue\) {3}\(Enter\)/)
    expect(await read(root, 'app/pages/cv.vue')).toContain('<VitaSection id="education" title="Education" />\n    <VitaSection id="grants" title="Grants and funding" />')
    expect(await read(root, 'cv-tex/cv.tex')).toContain('\\vitasection[Education]{education}\n\\vitasection[Grants and funding]{grants}')
  })

  it('offers a shared schema, and can be declined at the end', async () => {
    const root = await project({ 'content/talks-public.yml': '- { date: 2024, title: Maths night }\n' })
    // share: yes · page: 5 = not on the website · PDF: no · write: no
    const result = await cli(['add', 'section', 'talks-public'], { cwd: root, answers: ['', String(5), 'n', 'n'] })
    expect(result.asked[0]).toMatch(/fit the schema of talks\. Use the same schema\? \[Y\/n\]/)
    expect(result.out).toContain('+ schemas/talks-public.ts')
    expect(result.out).toContain('Cancelled; nothing was written.')
    expect(result.code).toBe(1)
    expect(existsSync(join(root, 'schemas/talks-public.ts'))).toBe(false)
  })

  it('writes nothing without a terminal unless told to', async () => {
    const root = await project({ 'content/grants.yml': GRANTS })
    const result = await cli(['add', 'section', 'grants'], { cwd: root })
    expect(result.code).toBe(1)
    expect(result.err).toMatch(/nothing written: confirm with --yes/)
    expect(existsSync(join(root, 'schemas/grants.ts'))).toBe(false)
  })
})

describe('add field', () => {
  it('extends a built-in section, then adds to that file', async () => {
    const root = await project()
    const first = await cli(['add', 'field', 'teaching', 'evaluation', '--type', 'number', '--yes'], { cwd: root })
    expect(first.code, first.err).toBe(0)
    expect(first.out).toContain('    evaluation: 4.5')
    expect(await read(root, 'schemas/teaching.ts')).toContain('export default extendSection(schemas.teaching, {\n  evaluation: z.number().optional(),\n})')

    expect((await cli(['add', 'field', 'teaching', 'level', '--type', 'choice', '--choice', 'bachelor', '--choice', 'master', '--yes'], { cwd: root })).code).toBe(0)
    expect((await cli(['add', 'field', 'teaching', 'hosts', '--type', 'link', '--several', '--required', '--dry-run'], { cwd: root })).out)
      .toContain('+   hosts: z.array(linked),')
    expect((await cli(['add', 'field', 'teaching', 'hosts', '--type', 'link', '--several', '--yes'], { cwd: root })).code).toBe(0)
    const schema = await read(root, 'schemas/teaching.ts')
    // Imports are added at the end, leaving the rest of the line as it was.
    expect(schema).toContain(`import { extendSection, schemas, z, linked } from '@anja.codes/vitakit'`)
    expect(schema).toContain(`  level: z.enum(['bachelor', 'master']).optional(),\n  hosts: z.array(linked).optional(),\n})`)

    await writeFile(join(root, 'content/teaching.yml'), `${await read(root, 'content/teaching.yml')}  evaluation: 4.6\n  level: master\n  hosts: [Jane Doe]\n`)
    const content = await loadContent(root, { strict: true })
    expect(content.sections.teaching!.find(entry => entry.evaluation)).toMatchObject({ evaluation: 4.6, level: 'master', hosts: [{ label: 'Jane Doe' }] })

    const again = await cli(['add', 'field', 'teaching', 'evaluation', '--type', 'number'], { cwd: root })
    expect(again.out).toContain('teaching has a field evaluation already: number, optional. Nothing to do.')
    expect((await cli(['add', 'field', 'teaching', 'title', '--type', 'text'], { cwd: root })).out).toContain('already')
  })

  it('asks for what flags did not say', async () => {
    const root = await project()
    // type: 3 = number · several: no · required: no · write
    const result = await cli(['add', 'field', 'talks', 'audience'], { cwd: root, answers: ['3', '', '', ''] })
    expect(result.code, result.err).toBe(0)
    expect(result.asked.slice(1)).toEqual(['Can an entry have several? [y/N] ', 'Should every entry have it? [y/N] ', '\nWrite these changes? [Y/n] '])
    expect(await read(root, 'schemas/talks.ts')).toContain('audience: z.number().optional(),')
  })

  it('prints a line to paste when the schema is not recognizable', async () => {
    const root = await project({ 'schemas/talks.ts': `import { schemas } from '@anja.codes/vitakit'\nconst s = schemas.talks\nexport default s\n` })
    const result = await cli(['add', 'field', 'talks', 'audience', '--type', 'text', '--yes'], { cwd: root })
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/\? schemas\/talks\.ts {3}cannot be changed safely \(its default export is not a section/)
    expect(result.out).toContain('    audience: text.optional(),')
    expect(result.out).toContain('Nothing to write.')
  })

  it.each([
    [['add', 'field', 'teaching', 'x'], 2, /which type\? --type/],
    [['add', 'field', 'teaching', 'x', '--type', 'colour'], 2, /--type colour: one of text, /],
    [['add', 'field', 'teaching', 'x', '--type', 'choice'], 2, /needs its values/],
    [['add', 'field', 'nope', 'x', '--type', 'text'], 1, /no section called "nope"/],
    [['add', 'field', 'teaching', 'visibility', '--type', 'text'], 1, /every entry has already/],
    [['add', 'field', 'teaching', '2x', '--type', 'text'], 1, /cannot be a field name/],
    [['add', 'field', 'teaching', 'x', '--page', '/cv/'], 2, /--page does not apply to add field/],
  ])('refuses %s', async (args, code, message) => {
    const result = await cli(args, { cwd: await project() })
    expect(result.code).toBe(code)
    expect(result.err).toMatch(message)
  })

  it('points to the shared schema', async () => {
    const root = await project({ 'content/talks-public.yml': '[]\n', 'schemas/talks-public.ts': `export { default } from './talks'\n`, 'schemas/talks.ts': `import { schemas } from '@anja.codes/vitakit'\nexport default schemas.talks\n` })
    const result = await cli(['add', 'field', 'talks-public', 'audience', '--type', 'text', '--yes'], { cwd: root })
    expect(result.err).toMatch(/uses the schema of talks.*add field talks audience/s)
  })
})

describe('add page', () => {
  it('creates the text, the page and a menu entry; sections can then be added', async () => {
    const root = await project()
    const result = await cli(['add', 'page', 'outreach', '--title', 'Outreach & teaching', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(await read(root, 'content/pages/outreach.md')).toMatch(/^---\ntitle: "Outreach & teaching"\n---\n/)
    expect(await read(root, 'app/pages/outreach.vue')).toContain(`const page = usePage('/outreach/')`)
    expect(await read(root, 'content/profile.yml')).toContain('  - { label: "Outreach & teaching", to: /outreach/ }\n')

    expect((await cli(['add', 'section', 'talks', '--page', '/outreach/', '--yes'], { cwd: root })).code).toBe(0)
    const status = await cli(['status'], { cwd: root })
    expect(status.out).toMatch(/talks\s+3 entries\s+\/cv\/ \/ \/outreach\/\s+cv/)
    expect(status.out).toContain('/  /cv/  /outreach/  /publications/  /research/   (all in the menu)')

    const again = await cli(['add', 'page', 'outreach', '--yes'], { cwd: root })
    expect(again.err).toMatch(/\/outreach\/ exists already/)
    expect((await cli(['add', 'page', 'research', '--yes'], { cwd: root })).err).toMatch(/\/research\/ exists already \(content\/pages\/research\.md\)/)
  })

  it('leaves the menu alone with --no-menu', async () => {
    const root = await project()
    const before = await read(root, 'content/profile.yml')
    expect((await cli(['add', 'page', 'notes', '--no-menu', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'content/profile.yml')).toBe(before)
  })
})

describe('customize --schema', () => {
  it('extends a built-in schema, or copies it whole, and never replaces one', async () => {
    const root = await project()
    const result = await cli(['customize', 'teaching', '--schema', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(await read(root, 'schemas/teaching.ts')).toContain('  // Your fields, e.g.\n')
    expect((await cli(['add', 'field', 'teaching', 'evaluation', '--type', 'number', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'schemas/teaching.ts')).toContain('  //   evaluation: z.number().optional(),\n  evaluation: z.number().optional(),\n})')
    expect((await cli(['validate', 'teaching'], { cwd: root })).code).toBe(0)

    expect((await cli(['customize', 'teaching', '--schema'], { cwd: root })).out).toContain('schemas/teaching.ts is yours already')

    expect((await cli(['customize', 'talks', '--schema', '--copy', '--yes'], { cwd: root })).code).toBe(0)
    const copy = await read(root, 'schemas/talks.ts')
    expect(copy).toContain(`from '@anja.codes/vitakit'`)
    expect(copy).toContain(`kind: z.enum(['invited', 'contributed', 'seminar', 'poster', 'outreach']).optional(),`)
    expect((await cli(['validate', 'talks'], { cwd: root })).code).toBe(0)

    expect((await cli(['customize', 'publications', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'schemas/publications.ts')).toContain('publications(')
    expect((await cli(['validate'], { cwd: root })).code).toBe(0)
  })

  it.each([
    [['customize', 'teaching'], 2, /--schema/],
    [['customize', 'teaching', '--copy'], 2, /--copy goes with --schema/],
    [['customize', 'nope', '--schema'], 1, /no section called "nope"/],
  ])('refuses %s', async (args, code, message) => {
    const result = await cli(args, { cwd: await project() })
    expect(result.code).toBe(code)
    expect(result.err).toMatch(message)
  })
})

describe('add section for entries with more fields than their schema', () => {
  it('drafts the missing fields into an extension of a built-in schema', async () => {
    const root = await project({
      'content/teaching.yml': '- { date: 2024, title: Analysis, hours: 2, type: [Lecture] }\n- { date: 2023, title: Algebra, hours: 3, credits: "2 each" }\n',
    })
    const result = await cli(['add', 'section', 'teaching', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('+ schemas/teaching.ts   keeps vitakit\'s teaching fields, adds hours, type, credits from your entries')
    expect(await read(root, 'schemas/teaching.ts')).toContain('export default extendSection(schemas.teaching, {\n  hours: z.number(),\n  type: z.array(text).optional(),\n  credits: text.optional(),\n})')
    expect((await cli(['validate', 'teaching'], { cwd: root })).code).toBe(0)
  })

  it('adds them to a schema of the user\'s', async () => {
    const root = await project({
      'content/grants.yml': '- { date: 2024, title: A, amount: 3 }\n',
      'schemas/grants.ts': `import { section, dateRange, richText } from '@anja.codes/vitakit'\n\nexport default section({\n  date: dateRange,\n  title: richText,\n})\n`,
    })
    expect((await cli(['add', 'section', 'grants', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'schemas/grants.ts')).toBe(`import { section, dateRange, richText, z } from '@anja.codes/vitakit'\n\nexport default section({\n  date: dateRange,\n  title: richText,\n  amount: z.number(),\n})\n`)
  })

  it('shares a built-in schema without a content file of its own', async () => {
    const root = await project({ 'content/talks.yml': null, 'content/talks-public.yml': '- { date: 2024, title: Maths night, kind: outreach }\n' })
    const hint = await cli(['add', 'section', 'talks-public', '--dry-run'], { cwd: root })
    expect(hint.out).toContain('--like talks would share it')
    expect((await cli(['add', 'section', 'talks-public', '--like', 'talks', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'schemas/talks-public.ts')).toContain('export default schemas.talks')
  })
})

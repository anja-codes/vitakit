import { writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as shared from '../src/shared/index'
import { loadContent } from '../src/content'
import { documentSchema } from '../src/tex/documents'
import { renderSection } from '../src/tex/emit'
import { cli } from './cli'
import { exampleProject as project, readProjectFile } from './project'
import { compileVue, renderVue, withAutoImports } from './vue'

const read = readProjectFile

/** A project whose teaching entries have an evaluation, one of them 0. */
async function withEvaluation(): Promise<string> {
  const root = await project()
  expect((await cli(['add', 'field', 'teaching', 'evaluation', '--type', 'number', '--yes'], { cwd: root })).code).toBe(0)
  const teaching = await read(root, 'content/teaching.yml')
  await writeFile(join(root, 'content/teaching.yml'), teaching.replace('  title: Analytic Combinatorics\n', '  title: Analytic Combinatorics\n  evaluation: 0\n'))
  return root
}

/** Render a component the CLI wrote, the way Nuxt would: auto-imports supplied. */
async function renderComponent(root: string, file: string, props: Record<string, unknown>) {
  const content = await loadContent(root, { strict: true })
  const imports = {
    '@anja.codes/vitakit/shared': shared,
    '#imports': { useSection: (id: string) => content.sections[id] ?? [] },
  }
  const component = (name: string) => compileVue(new URL(`../src/runtime/components/${name}.vue`, import.meta.url), imports)
  const source = withAutoImports(await read(root, file), ['useSection'])
  const Generated = compileVue(new URL(`file://${join(root, file)}`), imports, source)
  const html = await renderVue(Generated, props, { VitaSection: component('VitaSection'), VitaEntry: component('VitaEntry'), VitaDate: component('VitaDate') })
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

describe('customize --web', () => {
  it('wraps VitaSection with a note line per field, and uses it wherever the section is shown', async () => {
    const root = await withEvaluation()
    const result = await cli(['customize', 'teaching', '--web', '--field', 'evaluation', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(await read(root, 'app/pages/cv.vue')).toContain('<TeachingSection id="teaching" title="Teaching" />')
    const component = await read(root, 'app/components/TeachingSection.vue')
    expect(component).toContain(`<p v-if="typeof entry.evaluation === 'number'" class="vita-entry__note">Evaluation: {{ entry.evaluation }}</p>`)

    // Zero is a value worth showing; the default note stays.
    const html = await renderComponent(root, 'app/components/TeachingSection.vue', { id: 'teaching', title: 'Teaching' })
    expect(html).toContain('<section id="teaching" class="vita-section-group"><h2 class="vita-section-group__title">Teaching</h2>')
    expect(html).toContain('<p class="vita-entry__note">Evaluation: 0</p>')
    expect((html.match(/vita-entry__note/g) ?? []).length).toBe(1)

    expect((await cli(['status'], { cwd: root })).out).toMatch(/teaching\s+3 entries\s+\/cv\/\s+cv/)
    expect((await cli(['validate'], { cwd: root })).code).toBe(0)
  })

  it('writes a list of its own with --list, showing every field once', async () => {
    const root = await project()
    const result = await cli(['customize', 'talks', '--web', '--list', '--component', 'TalkList', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain(`app/pages/index.vue:10 uses useSection('talks') in code; that is left as it is.`)
    expect(await read(root, 'app/pages/cv.vue')).toContain('<TalkList id="talks" title="Talks" />')
    const html = await renderComponent(root, 'app/components/TalkList.vue', { id: 'talks', title: 'Talks', where: { kind: 'invited' } })
    expect(html).toMatch(/^<section id="talks" class="vita-section-group"><h2 class="vita-section-group__title">Talks<\/h2><ul class="vita-section"><li class="vita-entry">/)
    expect(html).toContain('Kind: invited')
    expect(html).not.toContain('Kind: contributed')
  })

  it('reuses a component for another section, and replaces one only with --force', async () => {
    const root = await project({ 'content/talks-public.yml': '- { date: 2024, title: Maths night, kind: outreach }\n' })
    expect((await cli(['add', 'section', 'talks-public', '--like', 'talks', '--page', '/cv/', '--yes'], { cwd: root })).code).toBe(0)
    expect((await cli(['customize', 'talks', '--web', '--list', '--component', 'TalkList', '--yes'], { cwd: root })).code).toBe(0)

    const again = await cli(['customize', 'talks-public', '--web', '--component', 'TalkList', '--yes'], { cwd: root })
    expect(again.code).toBe(1)
    expect(again.err).toMatch(/app\/components\/TalkList\.vue exists\. `--use TalkList` shows talks-public with it; --force replaces it/)

    expect((await cli(['customize', 'talks-public', '--web', '--use', 'TalkList', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'app/pages/cv.vue')).toContain('<TalkList id="talks-public" title="Talks public" />')

    await writeFile(join(root, 'app/components/TalkList.vue'), (await read(root, 'app/components/TalkList.vue')).replace('vita-section-group', 'mine'))
    expect((await cli(['customize', 'talks', '--web', '--list', '--component', 'TalkList', '--force', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'app/components/TalkList.vue.backup')).toContain('class="mine"')
    expect(await read(root, 'app/components/TalkList.vue')).not.toContain('class="mine"')
  })

  it('leaves an element with slots of its own alone and says why', async () => {
    const root = await project()
    const page = await read(root, 'app/pages/cv.vue')
    await writeFile(join(root, 'app/pages/cv.vue'), page.replace(
      '<VitaSection id="talks" title="Talks" />',
      '<VitaSection id="talks" title="Talks">\n      <template #note="{ entry }">{{ entry.kind }}</template>\n    </VitaSection>',
    ))
    const result = await cli(['customize', 'talks', '--web', '--yes'], { cwd: root })
    expect(result.out).toMatch(/\? app\/pages\/cv\.vue {3}cannot be changed safely \(line \d+ has content of its own, such as slots/)
    expect(result.out).toContain('    <TalksSection id="talks" />')
    expect(existsSync(join(root, 'app/components/TalksSection.vue'))).toBe(true)
  })

  it('places a section that is on no page yet', async () => {
    const root = await project({ 'content/grants.yml': '- { date: 2024, title: A grant }\n', 'schemas/grants.ts': `import { section, dateRange, richText } from '@anja.codes/vitakit'\nexport default section({ date: dateRange, title: richText })\n` })
    const result = await cli(['customize', 'grants', '--web', '--page', '/cv/', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    expect(await read(root, 'app/pages/cv.vue')).toContain('    <GrantsSection id="grants" title="Grants" />\n  </article>')
  })

  it.each([
    [['customize', 'talks', '--web', '--component', 'VitaTalks'], 1, /would replace vitakit's own component/],
    [['customize', 'talks', '--web', '--component', 'talk-list'], 1, /PascalCase/],
    [['customize', 'talks', '--web', '--use', 'Nope'], 1, /no app\/components\/Nope\.vue/],
    [['customize', 'talks', '--web', '--field', 'nope'], 1, /talks has no field nope/],
    [['customize', 'talks', '--web', '--region', 'title'], 2, /--region note or --region meta/],
    [['customize', 'talks', '--list'], 2, /--list goes with --web/],
    [['customize', 'talks', '--from', 'x'], 2, /--from goes with --pdf/],
    [['customize', 'talks'], 2, /--web, --pdf or --schema/],
    [['customize', 'publications', '--web'], 1, /eject VitaPublication/],
    [['customize', 'nope', '--web'], 1, /no section called "nope"/],
  ])('refuses %s', async (args, code, message) => {
    const result = await cli([...args, '--yes'], { cwd: await project() })
    expect(result.code).toBe(code)
    expect(result.err).toMatch(message)
  })
})

describe('customize --pdf', () => {
  it('copies the template in use with a note line per field', async () => {
    const root = await withEvaluation()
    const result = await cli(['customize', 'teaching', '--pdf', '--field', 'evaluation', '--yes'], { cwd: root })
    expect(result.code, result.err).toBe(0)
    const template = await read(root, 'cv-tex/templates/teaching.eta')
    expect(template).toContain('<%~ it.vita.note(item.note) %>\n<%~ it.vita.note`Evaluation: ${item.evaluation}` %>\n<% } %>')

    const content = await loadContent(root, { strict: true, maxVisibility: 'private', target: 'pdf' })
    const tex = await renderSection('teaching', content.sections.teaching!, documentSchema.parse({}), join(root, 'cv-tex/templates'))
    expect(tex).toContain('\\vitanote{Evaluation: 0}')

    const again = await cli(['customize', 'teaching', '--pdf', '--field', 'evaluation', '--yes'], { cwd: root })
    expect(again.out).toContain('= cv-tex/templates/teaching.eta   shows evaluation already')
    expect((await cli(['customize', 'teaching', '--pdf', '--field', 'role', '--yes'], { cwd: root })).out)
      .toContain('<%~ it.vita.note`Role: ${item.role}` %>')
    expect((await cli(['customize', 'teaching', '--pdf', '--force', '--yes'], { cwd: root })).code).toBe(0)
    expect(await read(root, 'cv-tex/templates/teaching.eta.backup')).toContain('Evaluation')
    expect(await read(root, 'cv-tex/templates/teaching.eta')).not.toContain('Evaluation')
  })

  it('starts a custom section from the generic template, or from another section\'s', async () => {
    const root = await project({ 'content/talks-public.yml': '- { date: 2024, title: Maths night }\n' })
    expect((await cli(['add', 'section', 'talks-public', '--like', 'talks', '--document', 'cv', '--yes'], { cwd: root })).code).toBe(0)
    expect((await cli(['customize', 'talks', '--pdf', '--yes'], { cwd: root })).out).toContain('a copy of vitakit\'s talks.eta')
    const copy = await cli(['customize', 'talks-public', '--pdf', '--from', 'talks', '--yes'], { cwd: root })
    expect(copy.code, copy.err).toBe(0)
    expect(await read(root, 'cv-tex/templates/talks-public.eta')).toMatch(/^<%\/\* A copy of talks\.eta/)
    expect((await cli(['validate'], { cwd: root })).code).toBe(0)

    const generic = await project({ 'content/grants.yml': '- { date: 2024, title: A grant }\n', 'schemas/grants.ts': `import { section, dateRange, richText } from '@anja.codes/vitakit'\nexport default section({ date: dateRange, title: richText })\n` })
    expect((await cli(['customize', 'grants', '--pdf', '--yes'], { cwd: generic })).out).toContain('a copy of vitakit\'s generic template')
    expect((await cli(['customize', 'grants', '--pdf', '--dry-run'], { cwd: generic })).out).toContain('is yours already')
  })

  it('asks, when nothing says what to change', async () => {
    const root = await withEvaluation()
    // both · each entry · fields: evaluation · name (Enter) · write
    const result = await cli(['customize', 'teaching'], { cwd: root, answers: ['3', '1', 'evaluation', '', ''] })
    expect(result.code, result.err).toBe(0)
    expect(result.out).toContain('Not shown by the standard layout: evaluation')
    expect(existsSync(join(root, 'app/components/TeachingSection.vue'))).toBe(true)
    expect(await read(root, 'cv-tex/templates/teaching.eta')).toContain('Evaluation')
  })
})

describe('explain --field', () => {
  it('shows lines for VitaSection and vitakit\'s template, then for the files that are yours', async () => {
    const root = await withEvaluation()
    const before = await cli(['explain', 'teaching', '--field', 'evaluation'], { cwd: root })
    expect(before.out).toContain('`pnpm vitakit customize teaching --web --field evaluation`')
    expect(before.out).toContain(`        <p v-if="typeof entry.evaluation === 'number'" class="vita-entry__note">Evaluation: {{ entry.evaluation }}</p>`)
    expect(before.out).toContain('    <%~ it.vita.note`Evaluation: ${item.evaluation}` %>')

    expect((await cli(['customize', 'teaching', '--web', '--pdf', '--yes'], { cwd: root })).code).toBe(0)
    const after = await cli(['explain', 'teaching', '--field', 'evaluation'], { cwd: root })
    expect(after.out).toMatch(/website\s+app\/components\/TeachingSection\.vue: add where the entry's lines are/)
    expect(after.out).toMatch(/pdf\s+cv-tex\/templates\/teaching\.eta \(yours\): add inside its loop/)
    expect((await cli(['explain', 'teaching', '--field', 'nope'], { cwd: root })).err).toMatch(/has no field nope/)
    expect((await cli(['explain', 'cv', '--field', 'x'], { cwd: root })).code).toBe(2)
  })
})

describe('showing one more field later', () => {
  it('gives lines for the component and template that are yours, never rewriting them', async () => {
    const root = await withEvaluation()
    expect((await cli(['customize', 'teaching', '--web', '--pdf', '--field', 'evaluation', '--yes'], { cwd: root })).code).toBe(0)
    const component = await read(root, 'app/components/TeachingSection.vue')
    const result = await cli(['customize', 'teaching', '--web', '--pdf', '--field', 'role', '--yes'], { cwd: root })
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/\? app\/components\/TeachingSection\.vue {3}is yours already; add these lines/)
    expect(result.out).toContain(`<p v-if="typeof entry.role === 'string'" class="vita-entry__note">Role: {{ entry.role }}</p>`)
    expect(result.out).toMatch(/\? cv-tex\/templates\/teaching\.eta {3}is yours already/)
    expect(result.out).toContain('Nothing to write.')
    expect(await read(root, 'app/components/TeachingSection.vue')).toBe(component)
    expect((await cli(['customize', 'teaching', '--web', '--field', 'evaluation', '--yes'], { cwd: root })).out)
      .toContain('= app/components/TeachingSection.vue   shows evaluation already')
  })
})

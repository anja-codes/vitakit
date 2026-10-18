import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { parse as parseYaml } from 'yaml'
import { afterEach, describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'

const creator = fileURLToPath(new URL('../create/index.mjs', import.meta.url))
const scaffoldUrl = new URL('../create/scaffold.mjs', import.meta.url).href
const defaults = {
  name: 'Your Name',
  title: 'Postdoctoral Researcher',
  affiliation: 'Department of Mathematics, University of Graz',
  email: 'you@example.org',
  slug: 'my-site',
  deployment: 'github-pages',
}
const temporary: string[] = []

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-create-'))
  temporary.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

// Run the creator's import-safe implementation in native Node, just as the
// published CLI does, without a bundler transforming it or an interactive TTY.
function scaffold(root: string, answers = defaults) {
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import { scaffold } from ${JSON.stringify(scaffoldUrl)}
    await scaffold(process.argv[1], JSON.parse(process.argv[2]))
  `, root, JSON.stringify(answers)])
}

describe('published creator personalisation', () => {
  it.each([
    'Research Fellow: Mathematics',
    'Researcher #1',
    'Dr "Zoë" O\'Connor \\ Universität 東京 🧮',
    'First line\nsecond: line # not a comment\r\nlast line\twith a tab',
    '---\nname: not an injected field\n---',
    'null',
    'true',
    '123',
    '[a, b]',
    '&anchor *alias',
    '',
    '  leading and trailing spaces  ',
    '$& $` $\' __TITLE__ __YAML_EMAIL__',
  ])('round-trips YAML scalars and front matter: %j', async (value) => {
    const root = await project()
    const answers = { ...defaults, name: value, title: value, affiliation: value, email: value }
    scaffold(root, answers)

    const profile = parseYaml(await readFile(join(root, 'content/profile.yml'), 'utf8'))
    expect(profile.name).toBe(value)
    expect(profile.title).toBe(value)
    expect(profile.affiliation).toEqual({ name: value })
    expect(profile.email).toBe(value)
    expect(profile.summary).toBe(`${value} at ${value}, working on your research area.`)

    // The actual content loader uses gray-matter for Markdown front matter,
    // not the YAML parser used for standalone .yml files.
    const home = matter(await readFile(join(root, 'content/pages/index.md'), 'utf8'))
    expect(home.data).toEqual({ title: value, order: 0 })
    expect(home.content).toContain('Replace this page with a few sentences about yourself:')
  })

  it('keeps ordinary Markdown and TeX substitutions raw and literal', async () => {
    const root = await project()
    const answers = {
      ...defaults,
      name: 'Zoë "A" \\ $& $` $\' __TITLE__',
      title: 'Researcher #1: Mathematics',
      affiliation: 'A\nB __YAML_NAME__',
    }
    // Additional files exercise the same recursive substitution pass as the
    // copied template. A global YAML-quoting fix must not quote prose/TeX.
    for (const file of ['letter.md', 'letter.tex']) {
      await writeFile(join(root, file), '__NAME__\n__TITLE__\n__AFFILIATION__\n__EMAIL__\n__SLUG__\n')
    }
    scaffold(root, answers)
    for (const file of ['letter.md', 'letter.tex']) {
      expect(await readFile(join(root, file), 'utf8')).toBe(
        `${answers.name}\n${answers.title}\n${answers.affiliation}\n${answers.email}\n${answers.slug}\n`,
      )
    }
  })

  it('loads a personalised scaffold through the real content pipeline', async () => {
    const root = await project()
    const answers = {
      ...defaults,
      name: 'Dr Zoë: Researcher #1',
      title: 'Research Fellow: Mathematics',
      affiliation: 'University #1: Department of Mathematics',
    }
    scaffold(root, answers)
    const content = await loadContent(root, { strict: true })
    expect(content.issues).toEqual([])
    expect(content.profile.name).toBe(answers.name)
    expect(content.profile.title).toBe(answers.title)
    expect(content.profile.affiliation).toEqual({ name: answers.affiliation })
    expect(content.profile.email).toBe(answers.email)
    expect(content.profile.summary).toBe(`${answers.title} at ${answers.affiliation}, working on your research area.`)
    expect(content.pages.find(page => page.route === '/')?.title).toBe(answers.name)
  })

  it('still scaffolds defaults through the CLI entry point', async () => {
    const root = await project()
    const target = join(root, 'my-site')
    const output = execFileSync(process.execPath, [creator, target], {
      encoding: 'utf8',
      env: { ...process.env, VITAKIT_CREATE_DEFAULTS: '1' },
    })
    expect(output).toContain(`Created ${target}`)
    const profile = parseYaml(await readFile(join(target, 'content/profile.yml'), 'utf8'))
    expect(profile.name).toBe(defaults.name)
    expect(profile.title).toBe(defaults.title)
    expect(JSON.parse(await readFile(join(target, 'package.json'), 'utf8')).name).toBe('my-site')
    expect(await readFile(join(target, '.gitignore'), 'utf8')).toContain('node_modules')
    expect(await readFile(join(target, '.github/workflows/deploy.yml'), 'utf8')).toContain('GitHub Pages')
  })
})

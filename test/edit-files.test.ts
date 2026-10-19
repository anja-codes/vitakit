import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addSectionToDocument } from '../src/edit/tex'
import { addSectionToPage, sectionElements } from '../src/edit/vue'
import { addNavItem, yamlScalar } from '../src/edit/yaml'

const value = <T>(result: { ok: true, value: T } | { ok: false, reason: string }): T => {
  if (!result.ok) throw new Error(result.reason)
  return result.value
}
const template = (path: string) => readFile(join(process.cwd(), 'create/template', path), 'utf8')

describe('adding a section to a PDF document', () => {
  it('goes after the named section, indented like it, with the heading escaped', async () => {
    const source = await template('cv-tex/cv.tex')
    const { source: after } = value(addSectionToDocument(source, { id: 'grants', heading: 'Grants & funding', after: 'education' }))
    expect(after).toBe(source.replace('\\vitasection[Education]{education}\n', '\\vitasection[Education]{education}\n\\vitasection[Grants \\& funding]{grants}\n'))
  })

  it('goes after the last section by default, also after a \\section{…}\\vitainput line', () => {
    const source = '\\begin{document}\n  \\vitasection{talks}\n  \\section{Publications}\\vitainput{publications}\n\\end{document}\n'
    expect(value(addSectionToDocument(source, { id: 'grants' })).source)
      .toBe('\\begin{document}\n  \\vitasection{talks}\n  \\section{Publications}\\vitainput{publications}\n  \\vitasection{grants}\n\\end{document}\n')
  })

  it('goes before \\end{document} in an empty document, and never twice', () => {
    const source = '\\begin{document}\n\\vitaheader\n\\end{document}\n'
    const { source: added } = value(addSectionToDocument(source, { id: 'grants', heading: 'Grants' }))
    expect(added).toBe('\\begin{document}\n\\vitaheader\n\\vitasection[Grants]{grants}\n\n\\end{document}\n')
    expect(addSectionToDocument(added, { id: 'grants' })).toEqual({ ok: false, reason: 'it already includes grants' })
  })
})

describe('adding a section to a Vue page', () => {
  it('goes after the named section of the scaffold\'s CV page', async () => {
    const source = await template('app/pages/cv.vue')
    const { source: after } = value(addSectionToPage(source, { id: 'grants', title: 'Grants & "funding"', after: 'education' }))
    expect(after).toBe(source.replace(
      '    <VitaSection id="education" title="Education" />\n',
      '    <VitaSection id="education" title="Education" />\n    <VitaSection id="grants" title="Grants &amp; &quot;funding&quot;" />\n',
    ))
    expect(value(sectionElements(after)).elements.map(element => element.id))
      .toEqual(['employment', 'education', 'grants', 'teaching', 'supervision', 'talks'])
  })

  it('goes after a multi-line element and recognizes local components', () => {
    const source = '<template>\n  <main>\n    <TalkList\n      id="talks"\n    />\n  </main>\n</template>\n'
    expect(value(addSectionToPage(source, { id: 'grants' }, ['TalkList'])).source)
      .toBe('<template>\n  <main>\n    <TalkList\n      id="talks"\n    />\n    <VitaSection id="grants" />\n  </main>\n</template>\n')
  })

  it('goes at the end of the root element when there is no section yet', () => {
    const source = '<script setup>\nconst a = 1\n</script>\n\n<template>\n  <article>\n    <h1>Talks</h1>\n  </article>\n</template>\n'
    expect(value(addSectionToPage(source, { id: 'talks', title: 'Talks' })).source)
      .toBe('<script setup>\nconst a = 1\n</script>\n\n<template>\n  <article>\n    <h1>Talks</h1>\n\n    <VitaSection id="talks" title="Talks" />\n  </article>\n</template>\n')
  })

  it.each([
    ['several root elements', '<template>\n  <h1>x</h1>\n  <p>y</p>\n</template>\n'],
    ['a one-line root', '<template><main><h1>x</h1></main></template>\n'],
    ['no template', '<script setup>\n</script>\n'],
  ])('prints instead for %s', (_label, source) => {
    expect(addSectionToPage(source, { id: 'talks' }).ok).toBe(false)
  })
})

describe('adding a menu entry', () => {
  it('appends to the scaffold\'s nav, keeping comments and style', async () => {
    const source = await template('content/profile.yml')
    const after = value(addNavItem(source, { label: 'Talks', to: '/talks/' }))
    expect(after).toBe(source.replace('  - { label: CV, to: /cv/ }\n', '  - { label: CV, to: /cv/ }\n  - { label: Talks, to: /talks/ }\n'))
    expect(addNavItem(after, { label: 'Again', to: '/talks/' })).toEqual({ ok: false, reason: 'its menu already links /talks/' })
  })

  it('creates the nav when there is none, and quotes what needs it', () => {
    expect(value(addNavItem('name: Jane\n', { label: 'Talks: all', to: '/talks/' })))
      .toBe('name: Jane\n\nnav:\n  - { label: "Talks: all", to: /talks/ }\n')
    expect(yamlScalar('Research & teaching')).toBe('"Research & teaching"')
    expect(yamlScalar('Publications')).toBe('Publications')
  })

  it('refuses a flow-style nav', () => {
    expect(addNavItem('nav: [{ label: A, to: / }]\n', { label: 'B', to: '/b/' }).ok).toBe(false)
  })
})

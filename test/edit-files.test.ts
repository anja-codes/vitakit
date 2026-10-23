import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addPublicationsToDocument, addSectionToDocument } from '../src/edit/tex'
import { addPublicationsToPage, addSectionToPage, publicationsElements, sectionElements } from '../src/edit/vue'
import { addNavItem, addPublicationList, yamlScalar } from '../src/edit/yaml'
import { renamePublicationsSettings } from '../src/edit/typescript'

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
    ['an anchor shown conditionally', '<template>\n  <main>\n    <VitaSection v-if="a" id="talks" />\n    <p v-else>None</p>\n  </main>\n</template>\n'],
    ['an anchor sharing its line', '<template>\n  <main>\n    <VitaSection id="talks" /><hr>\n  </main>\n</template>\n'],
  ])('prints instead for %s', (_label, source) => {
    expect(addSectionToPage(source, { id: 'grants' }).ok).toBe(false)
  })
})

describe('adding a publication list to a page or a PDF', () => {
  it('to a page: after a named section or list, and never twice', async () => {
    const source = await template('app/pages/cv.vue')
    const { source: after } = value(addPublicationsToPage(source, { list: 'recent', title: 'Recent papers', after: 'education' }))
    expect(after).toContain('    <VitaSection id="education" title="Education" />\n    <VitaPublications list="recent" title="Recent papers" />\n')
    expect(value(addPublicationsToPage(after, { list: 'preprints', after: 'recent' })).source)
      .toContain('<VitaPublications list="recent" title="Recent papers" />\n    <VitaPublications list="preprints" />\n')
    expect(addPublicationsToPage(after, { list: 'recent' })).toEqual({ ok: false, reason: 'it already shows the list recent' })
  })

  it('to a page: after the whole block a list is in, such as the landing page\'s recent publications', async () => {
    const source = await template('app/pages/index.vue')
    const { source: after } = value(addPublicationsToPage(source, { list: 'selected', title: 'Selected' }))
    expect(after).toContain('          All publications →\n        </NuxtLink>\n      </p>\n    </section>\n    <VitaPublications list="selected" title="Selected" />\n')
  })

  it('to a PDF document: after a named section, and never twice', async () => {
    const source = await template('cv-tex/cv.tex')
    const { source: after } = value(addPublicationsToDocument(source, { id: 'recent', heading: 'Recent & selected', after: 'education' }))
    expect(after).toContain('\\vitasection[Education]{education}\n\\vitapublications[Recent \\& selected]{recent}\n')
    expect(addPublicationsToDocument(after, { id: 'recent' })).toEqual({ ok: false, reason: 'it already includes the list recent' })
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

describe('declaring a publication list', () => {
  it('goes at the end of content/publication-lists.yml, one setting per line', async () => {
    const source = await template('content/publication-lists.yml')
    const after = value(addPublicationList(source, 'preprints', { where: { status: ['preprint', 'accepted'] }, limit: 5, sort: undefined }))
    expect(after).toBe(`${source}\npreprints:\n  where: { status: [preprint, accepted] }\n  limit: 5\n`)
    expect(value(addPublicationList('', 'all', {}))).toBe('all: {}\n')
    expect(addPublicationList(after, 'recent', {})).toEqual({ ok: false, reason: `it has a list "recent" already, on line ${source.split('\n').indexOf('recent:') + 1}` })
    expect(addPublicationList('{ all: {} }\n', 'recent', {}).ok).toBe(false)
  })
})

describe('migrating publications', () => {
  it('finds VitaPublications elements with their props, for migrating them', () => {
    const source = '<template>\n  <main>\n    <VitaPublications :groups="[\'a\']" headings class="x" />\n  </main>\n</template>\n'
    const [element] = value(publicationsElements(source))
    expect(element!.props.map(prop => [prop.name, prop.expression ?? prop.value ?? true, source.slice(prop.start, prop.end)])).toEqual([
      ['groups', '[\'a\']', ':groups="[\'a\']"'],
      ['headings', true, 'headings'],
      ['class', 'x', 'class="x"'],
    ])
  })

  it('renames keys of publications({...}), keeping values and comments', () => {
    const source = "import { publications } from '@anja.codes/vitakit'\n\nexport default publications({\n  // mine\n  groups: [{ id: 'a', label: 'A' }],\n  'defaultGroup': 'a',\n})\n"
    expect(value(renamePublicationsSettings(source, { groups: 'statuses', defaultGroup: 'defaultStatus' })))
      .toBe("import { publications } from '@anja.codes/vitakit'\n\nexport default publications({\n  // mine\n  statuses: [{ id: 'a', label: 'A' }],\n  defaultStatus: 'a',\n})\n")
    expect(renamePublicationsSettings('export default {}\n', { groups: 'statuses' }).ok).toBe(false)
  })
})

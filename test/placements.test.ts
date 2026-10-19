import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { componentName, documentDirective, findPdfPlacements, findWebPlacements, pageRoute } from '../src/placements'

async function fixture(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-placements-'))
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true })
    await writeFile(join(root, path), contents)
  }
  return root
}

describe('names and routes', () => {
  it('names components like Nuxt', () => {
    expect(componentName('TalkList.vue')).toBe('TalkList')
    expect(componentName('sections/Talks.vue')).toBe('SectionsTalks')
    expect(componentName('sections/SectionsTalks.vue')).toBe('SectionsTalks')
    expect(componentName('talk-list.vue')).toBe('TalkList')
  })

  it('derives routes with a trailing slash', () => {
    expect(pageRoute('index.vue')).toBe('/')
    expect(pageRoute('cv.vue')).toBe('/cv/')
    expect(pageRoute('teaching/index.vue')).toBe('/teaching/')
    expect(pageRoute('teaching/courses.vue')).toBe('/teaching/courses/')
  })
})

describe('website placements', () => {
  it('finds the scaffold\'s sections, including the landing page\'s code usage', async () => {
    const { placements, dynamic } = await findWebPlacements(join(process.cwd(), 'create/template'))
    const cv = placements.filter(placement => placement.file === 'app/pages/cv.vue')
    expect(cv.map(placement => [placement.section, placement.title])).toEqual([
      ['employment', 'Employment'],
      ['education', 'Education'],
      ['teaching', 'Teaching'],
      ['supervision', 'Supervised theses'],
      ['talks', 'Talks'],
    ])
    expect(cv[0]).toMatchObject({ route: '/cv/', component: 'VitaSection' })
    expect(placements.find(placement => placement.file === 'app/pages/index.vue'))
      .toMatchObject({ section: 'talks', component: 'code', route: '/' })
    expect(dynamic).toEqual([])
  })

  it('recognizes local components, kebab-case tags, literal bindings, where and limit', async () => {
    const root = await fixture({
      'app/components/TalkList.vue': '<script setup>\nconst props = defineProps(["id"])\nconst entries = useSection(props.id)\n</script>\n<template><ol /></template>\n',
      'app/pages/talks.vue': [
        '<template>',
        '  <div>',
        '    <TalkList id="talks" :where="{ kind: \'science\' }" />',
        '    <talk-list :id="\'talks\'" :limit="3" />',
        '    <section id="talks"><h2>Not a section usage</h2></section>',
        '    <VitaSection v-for="s in list" :id="s.id" />',
        '  </div>',
        '</template>',
      ].join('\n'),
    })
    const { placements, dynamic, components } = await findWebPlacements(root)
    expect(components.get('TalkList')).toBe('app/components/TalkList.vue')
    expect(placements).toEqual([
      { section: 'talks', file: 'app/pages/talks.vue', route: '/talks/', line: 3, component: 'TalkList', where: '{ kind: \'science\' }' },
      { section: 'talks', file: 'app/pages/talks.vue', route: '/talks/', line: 4, component: 'TalkList', limit: '3' },
    ])
    // The component's own useSection(props.id) is how components work, not an unknown usage.
    expect(dynamic).toEqual([{ file: 'app/pages/talks.vue', line: 6, usage: '<VitaSection :id="s.id">' }])
  })
})

describe('PDF placements', () => {
  it('reads \\vitasection and \\vitainput in the document body only, ignoring comments', () => {
    const source = [
      '\\documentclass{vitakit-cv}',
      '\\vitadocument{cv}',
      '\\vitainput{profile}',
      '\\begin{document}',
      '% \\vitasection{commented}',
      '\\vitasection[Employment \\& roles]{employment}',
      '\\section{Publications}\\vitainput{publications}',
      '\\vitasection{talks} % 50\\% invited',
      '\\end{document}',
    ].join('\n')
    expect(findPdfPlacements('cv', 'cv-tex/cv.tex', source)).toEqual([
      { section: 'employment', document: 'cv', file: 'cv-tex/cv.tex', line: 6, macro: 'vitasection', heading: 'Employment \\& roles' },
      { section: 'publications', document: 'cv', file: 'cv-tex/cv.tex', line: 7, macro: 'vitainput' },
      { section: 'talks', document: 'cv', file: 'cv-tex/cv.tex', line: 8, macro: 'vitasection' },
    ])
    expect(documentDirective(source)).toEqual({ name: 'cv', line: 2 })
  })
})

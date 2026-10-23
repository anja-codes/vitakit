/**
 * `content/publication-lists.yml`: which publications a list shows, in what
 * order and in which groups. Formatting is `bibliography.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/content'
import { describeList, resolveList } from '../src/publication-lists'
import { defaultPublications } from '../src/bibliography'
import { project } from './support/project'

const BIB = [
  '@article{zeta, author = {Doe, Jane}, title = {Zeta}, journal = {J}, year = {2022}, month = {3}, keywords = {selected, trees}, rank = {10}}',
  '@article{alpha, author = {Doe, Jane}, title = {{Alpha} trees}, journal = {J}, year = {2020}, project = {Trees}, rank = {9}}',
  '@misc{mid, author = {Roe, Rick}, title = {Mid}, year = {2024}, status = {Preprint}, keywords = {selected}, project = {Urns}}',
  '@misc{late, author = {Roe, Rick}, title = {Late}, year = {2022}, month = {11}, status = {software}}',
  '@misc{undated, author = {Doe, Jane}, title = {Beta}}',
].join('\n')

/** Each list as `[group label, citation keys]`. */
async function lists(yaml: string, bib = BIB) {
  const root = await project({ 'content/profile.yml': 'name: Jane Doe\n', 'content/publications.bib': bib, 'content/publication-lists.yml': yaml })
  const { publications } = await loadContent(root)
  return Object.fromEntries(Object.entries(publications).map(([name, list]) =>
    [name, list.groups.map(group => [group.label, group.entries.map(entry => entry.key)])]))
}
const keys = async (settings: string) => (await lists(`list: ${settings}\n`)).list!.flatMap(([, entries]) => entries)

describe('selecting', () => {
  it('shows every publication, newest first by month where there is one, undated last', async () => {
    expect(await keys('{}')).toEqual(['mid', 'late', 'zeta', 'alpha', 'undated'])
  })

  it.each([
    ['{ where: { status: preprint } }', ['mid']],
    ['{ where: { status: [published, software] } }', ['late', 'zeta', 'alpha', 'undated']],
    ['{ where: { project: Trees } }', ['alpha']],
    ['{ where: { keywords: selected } }', ['mid', 'zeta']],
    ['{ where: { keywords: trees, year: 2022 } }', ['zeta']],
    ['{ where: { key: [alpha, mid] } }', ['mid', 'alpha']],
    ['{ since: 2022 }', ['mid', 'late', 'zeta']],
    ['{ since: 2021, until: 2022 }', ['late', 'zeta']],
    ['{ limit: 2 }', ['mid', 'late']],
  ])('%s', async (settings, expected) => {
    expect(await keys(settings)).toEqual(expected)
  })

  it('shows exactly the keys given, in their order', async () => {
    expect(await keys('{ keys: [alpha, undated, mid] }')).toEqual(['alpha', 'undated', 'mid'])
    expect(await keys('{ keys: [alpha, undated, mid], where: { status: published }, limit: 1 }')).toEqual(['alpha'])
  })
})

describe('sorting', () => {
  it.each([
    ['{ order: asc }', ['alpha', 'zeta', 'late', 'mid', 'undated']],
    ['{ sort: year }', ['mid', 'zeta', 'late', 'alpha', 'undated']],
    ['{ sort: title }', ['alpha', 'undated', 'late', 'mid', 'zeta']],
    ['{ sort: title, order: desc }', ['zeta', 'mid', 'late', 'undated', 'alpha']],
    ['{ sort: source }', ['zeta', 'alpha', 'mid', 'late', 'undated']],
    // Numbers in a field compare as numbers; entries without it go last.
    ['{ sort: rank }', ['alpha', 'zeta', 'mid', 'late', 'undated']],
    ['{ sort: rank, order: desc }', ['zeta', 'alpha', 'mid', 'late', 'undated']],
  ])('%s', async (settings, expected) => {
    expect(await keys(settings)).toEqual(expected)
  })
})

describe('grouping', () => {
  it('by status, in the order of the statuses, with their labels', async () => {
    expect((await lists('all: { groupBy: status }\n')).all).toEqual([
      ['Published', ['zeta', 'alpha', 'undated']],
      ['Preprints', ['mid']],
      ['Software', ['late']],
    ])
  })

  it('by year, newest first, the undated last under Other', async () => {
    expect((await lists('years: { groupBy: year, sort: title }\n')).years).toEqual([
      ['2024', ['mid']],
      ['2022', ['late', 'zeta']],
      ['2020', ['alpha']],
      ['Other', ['undated']],
    ])
  })

  it('by a field, A to Z, with a heading of your own for the entries without it', async () => {
    expect((await lists('projects: { groupBy: project, otherLabel: Elsewhere }\n')).projects).toEqual([
      ['Trees', ['alpha']],
      ['Urns', ['mid']],
      ['Elsewhere', ['late', 'zeta', 'undated']],
    ])
  })

  it('after the limit, and without empty groups', async () => {
    expect((await lists('recent: { limit: 2, groupBy: status }\n')).recent).toEqual([['Preprints', ['mid']], ['Software', ['late']]])
  })

  it('not at all: one group without a heading', async () => {
    expect((await lists('flat: {}\nnone: { where: { status: accepted } }\n'))).toEqual({
      flat: [[undefined, ['mid', 'late', 'zeta', 'alpha', 'undated']]],
      none: [],
    })
  })
})

describe('content/publication-lists.yml', () => {
  it('may be missing, or a .bib file may: no lists, or empty ones', async () => {
    const root = await project({ 'content/profile.yml': 'name: Jane Doe\n', 'content/publication-lists.yml': 'all: {}\n' })
    expect((await loadContent(root)).publications).toEqual({ all: { count: 0, groups: [] } })
    expect((await loadContent(await project({ 'content/profile.yml': 'name: Jane Doe\n' }))).publications).toEqual({})
  })

  it.each([
    ['Recent: {}', /content\/publication-lists\.yml: Recent: a list name is lowercase kebab-case/],
    ['- all', /expected one list per name/],
    ['all: { limt: 3 }', /all: invalid\n.*Unrecognized key: "limt"/],
    ['all: { limit: 0 }', /all: invalid\n.*limit/],
    ['all: { where: { status: draft } }', /all\.where\.status: no status "draft"; the statuses are published, accepted, preprint, software, other \(schemas\/publications\.ts\)/],
    ['all: { keys: [a], sort: title }', /all\.sort: a list of keys is shown in the order of its keys/],
    ['all: { sort: source, order: asc }', /all\.order: only applies when sorting by a field/],
    ['all: { groupBy: keywords }', /all\.groupBy: an entry can have several keywords/],
    ['all: { otherLabel: Misc }', /all\.otherLabel: only applies when grouping by year or by a field/],
    ['all: { where: { projct: Trees } }', /content\/publication-lists\.yml: all: no publication has a field "projct"/],
    ['all: { sort: rnak }', /all: no publication has a field "rnak"/],
    ['all: { keys: [zeta, nope] }', /all\.keys: no publication nope in content\/publications\.bib/],
  ])('rejects %j, naming the file', async (yaml, message) => {
    await expect(lists(`${yaml}\n`)).rejects.toThrow(message)
  })

  it('empties only the list with a mistake in development, reporting it', async () => {
    const root = await project({ 'content/profile.yml': 'name: Jane Doe\n', 'content/publications.bib': BIB, 'content/publication-lists.yml': 'good: { limit: 1 }\ntypo: { where: { projct: Trees } }\n' })
    const content = await loadContent(root, { strict: false })
    expect([content.publications.good!.count, content.publications.typo!.count]).toEqual([1, 0])
    expect(content.issues).toEqual([{ where: 'content/publication-lists.yml', message: 'typo: no publication has a field "projct"' }])
  })

  it('empties its lists while the .bib file is broken in development, rather than dropping them', async () => {
    const root = await project({ 'content/profile.yml': 'name: Jane Doe\n', 'content/publications.bib': '@misc{a, status = {nope}}\n', 'content/publication-lists.yml': 'all: {}\n' })
    const content = await loadContent(root, { strict: false })
    expect(content.publications).toEqual({ all: { count: 0, groups: [] } })
    expect(content.issues).toEqual([expect.objectContaining({ where: 'content/publications.bib' })])
  })
})

it('says in words what a list shows', () => {
  const describe = (value: unknown) => describeList(resolveList('list', value, defaultPublications))
  expect(describe({})).toBe('newest first')
  expect(describe({ where: { status: ['preprint', 'accepted'] }, since: 2020, limit: 3, groupBy: 'year' }))
    .toBe('status preprint or accepted · since 2020 · newest first · at most 3 · grouped by year')
  expect(describe({ keys: ['a', 'b'] })).toBe('2 chosen by key')
  expect(describe({ sort: 'title' })).toBe('by title')
  expect(describe({ sort: 'source' })).toBe('in .bib order')
})

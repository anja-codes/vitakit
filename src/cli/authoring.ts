/**
 * The operations behind `add` and `customize --schema`. Each records what it
 * would write in a `Workspace`; commands compose them into one plan.
 */
import { parse as parseYaml } from 'yaml'
import type { z } from 'zod'
import type { FieldDescription, FieldType } from '../fields'
import type { Inventory, SectionInventory } from '../inventory'
import { addSchemaField, ensurePackageImports, propertyKey } from '../edit/typescript'
import { addSectionToDocument } from '../edit/tex'
import { addSectionToPage, sectionElementSource } from '../edit/vue'
import { addNavItem, yamlScalar } from '../edit/yaml'
import { vitasectionLine } from '../edit/tex'
import { CommandError } from './command'
import type { Workspace } from './plan'

// Data ----------------------------------------------------------------------

/** A new custom section's file: one example entry, valid for the starter schema. */
export function dataStarter(id: string): string {
  return [
    `# ${id}: one entry per item. vitakit sorts them by date, newest first.`,
    `# Which fields an entry may have is decided in schemas/${id}.ts.`,
    `- date: 2025-03-14`,
    `  title: An example entry`,
    `  note: Replace this with something real.`,
    '',
  ].join('\n')
}

export const STARTER_ENTRIES = [{ date: '2025-03-14', title: 'An example entry', note: 'Replace this with something real.' }]

const EXAMPLES: Record<FieldType, string> = {
  'text': 'Some text',
  'formatted-text': 'Text with *emphasis* and $k$-ary trees',
  'number': '4.5',
  'yes-no': 'true',
  'date': '2025-03',
  'web-address': 'https://example.org',
  'link': '{ name: University of Graz, url: https://uni-graz.at }',
  'choice': '',
  'group': '',
  'custom': '',
}

/** An example YAML value for a field. */
export function exampleValue(field: Pick<FieldDescription, 'type' | 'choices' | 'several'>): string {
  const single = field.type === 'choice' ? (field.choices?.[0] ?? '…') : EXAMPLES[field.type] || '…'
  return field.several ? `[${single}]` : single
}

/**
 * A built-in section's new file: nothing but comments, so that it is empty
 * until the first entry is written, with that entry shown as an example.
 */
export function dataExample(id: string, fields: FieldDescription[]): string {
  const required = fields.filter(field => !field.optional)
  const optional = fields.filter(field => field.optional).map(field => field.path)
  const lines = required.map((field, index) => `#${index === 0 ? ' -' : '  '} ${field.path}: ${exampleValue(field)}`)
  return [
    `# ${id}: one entry per item; vitakit sorts them by date, newest first.`,
    `# An entry looks like this (remove the # to use it):`,
    `#`,
    ...lines,
    ...(optional.length ? [`#`, `# Optional: ${optional.join(', ')}.`] : []),
    '',
  ].join('\n')
}

/** The entries of a section's file, as YAML says, for drafting. */
export function rawEntries(source: string): unknown[] {
  const data = parseYaml(source) as unknown
  if (data === null || data === undefined) return []
  if (!Array.isArray(data)) throw new CommandError('expected a list of entries (lines starting with "- ")')
  return data
}

/** Sections whose schema accepts these entries as they are. */
export async function matchingSchemas(rootDir: string, inv: Inventory, id: string, entries: unknown[]): Promise<string[]> {
  if (!entries.length) return []
  const { findSectionFiles, resolveSectionSchema } = await import('../sections')
  const { files } = await findSectionFiles(rootDir).catch(() => ({ files: [] }))
  const keys = new Set(entries.flatMap(entry => typeof entry === 'object' && entry ? Object.keys(entry) : []))
  const matches: string[] = []
  for (const section of inv.sections) {
    if (section.id === id || section.schema.origin === 'none' || section.schema.sharedWith) continue
    const file = files.find(candidate => candidate.id === section.id)
    if (!file) continue
    let schema: z.ZodType
    try {
      schema = (await resolveSectionSchema(rootDir, file)).schema
    } catch {
      continue
    }
    // Same fields in use, and every entry valid as it is.
    const fields = new Set(section.fields?.map(field => field.path) ?? [])
    if ([...keys].every(key => key === 'visibility' || fields.has(key)) && schema.safeParse(entries).success) matches.push(section.id)
  }
  return matches
}

/** A schema module that is another section's schema. */
export function sharedSchemaModule(id: string, other: SectionInventory): string {
  const body = other.schema.origin === 'built-in'
    ? [`import { schemas } from '@anja.codes/vitakit'`, '', `export default schemas.${other.id.replace(/-(\w)/g, (_match, char: string) => char.toUpperCase())}`]
    : [`export { default } from './${other.id}'`]
  return [
    '/**',
    ` * content/${id}.yml has the same fields as content/${other.id}.yml. A field`,
    ` * added to ${other.id} is accepted here too; to give ${id} fields of its own,`,
    ` * replace this file with its own schema.`,
    ' */',
    ...body,
    '',
  ].join('\n')
}

// Fields --------------------------------------------------------------------

export const FIELD_TYPES: { type: FieldType, label: string }[] = [
  { type: 'text', label: 'text' },
  { type: 'formatted-text', label: 'formatted text (Markdown, $math$)' },
  { type: 'number', label: 'number' },
  { type: 'yes-no', label: 'yes/no' },
  { type: 'date', label: 'date' },
  { type: 'web-address', label: 'web address' },
  { type: 'link', label: 'link (a name, optionally with a web address)' },
  { type: 'choice', label: 'one of a fixed list' },
]

const CODE: Partial<Record<FieldType, { code: string, imports: string[] }>> = {
  'text': { code: 'text', imports: ['text'] },
  'formatted-text': { code: 'richText', imports: ['richText'] },
  'number': { code: 'z.number()', imports: ['z'] },
  'yes-no': { code: 'z.boolean()', imports: ['z'] },
  'date': { code: 'dateRange', imports: ['dateRange'] },
  'web-address': { code: 'url', imports: ['url'] },
  'link': { code: 'linked', imports: ['linked'] },
}

export interface FieldSpec {
  type: FieldType
  several: boolean
  required: boolean
  choices: string[]
}

/** A field's schema code and the names it imports. */
export function fieldCode(spec: FieldSpec): { code: string, imports: string[] } {
  let base = CODE[spec.type]
  if (spec.type === 'choice') {
    if (!spec.choices.length) throw new CommandError('a field of type choice needs its values: --choice <value>, once per value')
    base = { code: `z.enum([${spec.choices.map(choice => `'${choice.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`).join(', ')}])`, imports: ['z'] }
  }
  if (!base) throw new CommandError(`unknown type ${spec.type}`)
  const code = spec.several ? `z.array(${base.code})` : base.code
  return {
    code: `${code}${spec.required ? '' : '.optional()'}`,
    imports: [...new Set([...base.imports, ...(spec.several ? ['z'] : [])])],
  }
}

/** `schemas/<id>.ts` that keeps a built-in section's fields and adds some. */
export function extensionModule(id: string, fields: { name: string, code: string }[], imports: string[]): string {
  const names = [...new Set(['extendSection', 'schemas', ...imports])].sort()
  const builtin = id.replace(/-(\w)/g, (_match, char: string) => char.toUpperCase())
  return [
    '/**',
    ` * The ${id} section: vitakit's built-in fields, and yours below. A field`,
    ` * here is accepted in content/${id}.yml; showing it on the website or in`,
    ` * the PDF is a separate step (\`vitakit customize ${id}\`). A built-in field`,
    ` * listed here replaces vitakit's rule for it.`,
    ' */',
    `import { ${names.join(', ')} } from '@anja.codes/vitakit'`,
    '',
    `export default extendSection(schemas.${builtin}, {`,
    ...(fields.length
      ? fields.map(field => `  ${propertyKey(field.name)}: ${field.code},`)
      : ['  // Your fields, e.g.', '  //   evaluation: z.number().optional(),']),
    '})',
    '',
  ].join('\n')
}

/**
 * Add a field to a section's schema: a new extension module for a built-in
 * section, an edit of a recognized local module, or a snippet to paste.
 */
export async function planAddField(ws: Workspace, section: SectionInventory, name: string, spec: FieldSpec): Promise<'created' | 'edited' | 'pasted'> {
  const { code, imports } = fieldCode(spec)
  const path = `schemas/${section.id}.ts`
  if (section.schema.origin === 'built-in') {
    ws.create(path, extensionModule(section.id, [{ name, code }], imports), `keeps vitakit's ${section.id} fields, adds ${name}`, { show: true })
    return 'created'
  }
  const source = await ws.read(path)
  if (source === undefined) throw new CommandError(`${section.id} has no schema yet; \`vitakit add section ${section.id}\` drafts one`)
  const added = addSchemaField(source, name, code)
  const imported = added.ok ? ensurePackageImports(added.value, imports) : added
  if (imported.ok) {
    await ws.edit(path, imported.value, `adds ${name}`)
    return 'edited'
  }
  ws.paste(path, `${propertyKey(name)}: ${code},`, `cannot be changed safely (${imported.reason}); add this line among the fields, and import ${imports.join(', ')} from '@anja.codes/vitakit'`)
  return 'pasted'
}

// Placement -----------------------------------------------------------------

export interface Placement {
  id: string
  title?: string
  after?: string
}

/** Show a section on a page. Returns where it went, for the summary. */
export async function planPlaceOnPage(ws: Workspace, inv: Inventory, path: string, placement: Placement): Promise<string> {
  const source = await ws.read(path)
  if (source === undefined) throw new CommandError(`${path} does not exist`)
  const result = addSectionToPage(source, placement, inv.web.components.keys())
  if (result.ok) {
    await ws.edit(path, result.value.source, `shows ${placement.id}${result.value.afterSection ? ` after ${result.value.afterSection}` : ''}`)
    return path
  }
  if (result.reason.startsWith('it already shows')) {
    ws.keep(path, `already shows ${placement.id}`)
    return path
  }
  ws.paste(path, sectionElementSource(placement), `cannot be changed safely (${result.reason}); add this line where the section should appear`)
  return path
}

/** Include a section in a PDF document. */
export async function planPlaceInDocument(ws: Workspace, document: string, placement: Placement): Promise<void> {
  const path = `cv-tex/${document}.tex`
  const source = await ws.read(path)
  if (source === undefined) throw new CommandError(`${path} does not exist`)
  const result = addSectionToDocument(source, { id: placement.id, ...(placement.title ? { heading: placement.title } : {}), ...(placement.after ? { after: placement.after } : {}) })
  if (result.ok) {
    await ws.edit(path, result.value.source, `includes ${placement.id}${result.value.afterSection ? ` after ${result.value.afterSection}` : ''}`)
  } else if (result.reason.startsWith('it already includes')) {
    ws.keep(path, `already includes ${placement.id}`)
  } else {
    ws.paste(path, vitasectionLine(placement.id, placement.title), `cannot be changed safely (${result.reason}); add this line where the section should appear`)
  }
}

// Pages ---------------------------------------------------------------------

function pageModule(route: string, name: string, title: string): string {
  return `<script setup lang="ts">
/**
 * The ${title} page: the text from content/pages/${name}.md, then sections.
 *
 * One line per section, in the order they appear; \`vitakit add section\`
 * adds more. A section without entries is not shown, heading included.
 */
const profile = useProfile()
const page = usePage('${route}')

if (!page) {
  throw createError({ statusCode: 404, statusMessage: 'No page for ${route} (expected content/pages/${name}.md)', fatal: true })
}

useHead({
  title: \`\${page.title} – \${profile.name}\`,
  meta: [{ name: 'description', content: page.description ?? profile.summary }],
})
</script>

<template>
  <article>
    <h1 class="text-3xl font-semibold" v-html="page.titleHtml" />
    <VitaMarkdown class="mt-6" :html="page.bodyHtml" />
  </article>
</template>
`
}

function pageText(name: string, title: string): string {
  return `---
title: ${yamlScalar(title)}
---

An introduction to this page, in Markdown. The sections below it are listed
in app/pages/${name}.vue.
`
}

/** A page that can hold sections: Markdown for its text, a Vue page for its sections. */
export async function planCreatePage(ws: Workspace, inv: Inventory, name: string, { title, menu }: { title: string, menu: boolean }): Promise<string> {
  const { sectionNameProblem } = await import('../sections')
  const problem = sectionNameProblem(name)
  if (problem && !problem.includes('reserved')) throw new CommandError(problem.replace('research-stays', 'research-interests'))
  const route = `/${name}/`
  const existing = inv.pages.find(page => page.route === route)
  if (existing) throw new CommandError(`${route} exists already (${[existing.markdown, existing.vue].filter(Boolean).join(', ')})`)
  const vue = `app/pages/${name}.vue`
  ws.create(`content/pages/${name}.md`, pageText(name, title), 'the page\'s title and text')
  ws.create(vue, pageModule(route, name, title), 'the page, with its sections')
  if (menu) {
    const profile = await ws.read('content/profile.yml')
    const result = profile === undefined ? { ok: false as const, reason: 'it does not exist' } : addNavItem(profile, { label: title, to: route })
    if (result.ok) await ws.edit('content/profile.yml', result.value, `adds ${title} to the menu`)
    else ws.paste('content/profile.yml', `- { label: ${yamlScalar(title)}, to: ${route} }`, `cannot be changed safely (${result.reason}); add this to nav`)
  }
  return vue
}

/** Fields the generic layout shows: the rest is accepted but not displayed. */
export function fieldsNotShown(fields: FieldDescription[] | undefined): string[] {
  const shown = new Set(['date', 'title', 'position', 'degree', 'role', 'student', 'event', 'term', 'institution', 'issuer', 'organisation', 'location', 'note', 'url', 'slides', 'ongoing'])
  return (fields ?? []).map(field => field.path).filter(path => !shown.has(path))
}

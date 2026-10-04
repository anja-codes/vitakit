/**
 * `vitakit add <name>` — set up a new section.
 *
 * A section needs a YAML file and a schema, and usually wants a component.
 * Writing all three by hand is the one place in vitakit where copying from the
 * documentation is genuinely worse than a command: the schema has to be valid
 * TypeScript before anything renders at all.
 *
 * The command does not own anything afterwards. It writes ordinary files, and
 * re-running it never overwrites what you have edited.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { schemas } from './schemas'

export interface AddOptions {
  /**
   * Also scaffold `app/components/<Name>Section.vue`. On by default: a section
   * without a component renders through the generic one, which is a fallback
   * rather than a design.
   */
  component?: boolean
}

export interface WrittenFile {
  path: string
  /** Why it was written, for the command's output. */
  note: string
}

const DATE_LIKE = /^\d{4}(-\d{2}){0,2}$/

/** Turn `research-stays` into `ResearchStays`. */
function pascalCase(id: string): string {
  return id.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

/**
 * Guess a field's schema from a sample of values.
 *
 * Deliberately conservative: everything is a string unless the values say
 * otherwise, and anything absent from some entries becomes optional. The result
 * is a starting point to edit, and says so in a comment.
 */
function inferField(values: unknown[], present: number, total: number): string {
  const optional = present < total ? '.optional()' : ''
  const sample = values[0]

  if (typeof sample === 'boolean') return `z.boolean().default(false)`
  if (typeof sample === 'number' && !DATE_LIKE.test(String(sample))) return `z.number()${optional}`

  if (values.every(value => DATE_LIKE.test(String(value)))) return `dateRange${optional}`
  if (typeof sample === 'object' && sample !== null && 'from' in (sample as object)) return `dateRange${optional}`

  if (typeof sample === 'string' && /^https?:\/\//.test(sample)) return `url${optional}`

  // A short field repeated across entries looks like a category.
  const strings = values.filter((value): value is string => typeof value === 'string')
  const unique = [...new Set(strings)]
  if (strings.length === values.length && unique.length > 1 && unique.length <= Math.max(2, values.length / 2)
    && unique.every(value => /^[a-z][\w-]*$/.test(value))) {
    return `z.enum([${unique.map(value => `'${value}'`).join(', ')}])${optional}`
  }

  if (typeof sample === 'string') return `text${optional}`
  return `z.unknown()${optional}`
}

function inferSchema(entries: Record<string, unknown>[]): { body: string, imports: string[] } {
  const fields = new Map<string, unknown[]>()
  for (const entry of entries) {
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'visibility') continue
      if (!fields.has(key)) fields.set(key, [])
      if (value !== undefined && value !== null) fields.get(key)!.push(value)
    }
  }

  const used = new Set<string>(['section'])
  const lines: string[] = []
  for (const [key, values] of fields) {
    const present = entries.filter(entry => entry[key] !== undefined).length
    let type = inferField(values, present, entries.length)
    // Titles are the usual home of mathematics.
    if (/^(title|headline)$/.test(key) && type.startsWith('text')) type = type.replace('text', 'richText')
    // Word boundaries matter: `richText` contains `text`, and importing an
    // unused primitive would leave the drafted file with a dead import.
    for (const primitive of ['dateRange', 'richText', 'text', 'url', 'z']) {
      if (new RegExp(`\\b${primitive}\\b`).test(type)) used.add(primitive)
    }
    lines.push(`  ${key}: ${type},`)
  }

  return { body: lines.join('\n'), imports: [...used].sort() }
}

const SAMPLE_YAML = (id: string) => `# ${id}: one entry per item, newest first is not required --
# vitakit sorts by date for you. Edit the fields, then edit schemas/${id}.ts
# to match.
- date: 2025-03-14
  title: An example entry
  note: Replace this with something real.
`

function schemaModule(id: string, body: string, imports: string[], inferred: boolean): string {
  return [
    `/**`,
    ` * Shape of content/${id}.yml.`,
    ` *`,
    inferred
      ? ` * Drafted from the existing file: check the types, especially which fields`
        + `\n * are optional and whether any should be an enum.`
      : ` * Edit freely: this file defines what content/${id}.yml may contain.`,
    ` *`,
    ` * \`section()\` adds \`visibility\` and validates a list of entries.`,
    ` */`,
    `import { ${imports.join(', ')} } from '@anja.codes/vitakit'`,
    ``,
    `export default section({`,
    body || `  date: dateRange,\n  title: richText,`,
    `})`,
    ``,
  ].join('\n')
}

function componentModule(id: string): string {
  const name = `${pascalCase(id)}Section`
  return `<script setup lang="ts">
/**
 * How ${id} entries look. Yours to change: props in, markup out.
 *
 * \`useSection('${id}')\` returns validated, sorted entries; \`VitaEntry\`,
 * \`VitaDate\` and \`richHtml\` come from vitakit.
 */
import { richHtml, type Entry } from '@anja.codes/vitakit/shared'

const props = defineProps<{ entries?: Entry[], limit?: number }>()

const items = computed(() => {
  const source = props.entries ?? useSection('${id}')
  return props.limit ? source.slice(0, props.limit) : source
})
</script>

<template>
  <ul v-if="items.length" class="vita-section">
    <VitaEntry v-for="item in items" :key="item.id" :date="item.date as never">
      <p class="vita-entry__title" v-html="richHtml(item.title)" />
      <p v-if="typeof item.note === 'string'" class="vita-entry__note">
        {{ item.note }}
      </p>
    </VitaEntry>
  </ul>
</template>
`
}

/**
 * Create what is missing for a section: the YAML file, the schema, optionally
 * a component. Existing files are never touched.
 */
export async function addSection(id: string, rootDir: string, options: AddOptions = {}): Promise<WrittenFile[]> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`"${id}" must be lowercase kebab-case, e.g. research-stays`)
  }
  if (id in schemas) {
    throw new Error(
      `"${id}" is a built-in section: create content/${id}.yml and it works.\n`
      + `  To change which fields it may contain, copy its schema into your project:\n`
      + `      pnpm vitakit eject ${id}\n`
      + `  and edit schemas/${id}.ts.`,
    )
  }

  const written: WrittenFile[] = []
  const yamlPath = join(rootDir, 'content', `${id}.yml`)
  const schemaPath = join(rootDir, 'schemas', `${id}.ts`)

  let entries: Record<string, unknown>[] = []
  let inferred = false

  if (existsSync(yamlPath)) {
    const parsed = parseYaml(await readFile(yamlPath, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error(`content/${id}.yml must contain a list of entries`)
    entries = parsed.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    if (!entries.length) throw new Error(`content/${id}.yml has no entries to infer a schema from`)
    inferred = true
  } else {
    await mkdir(join(yamlPath, '..'), { recursive: true })
    await writeFile(yamlPath, SAMPLE_YAML(id))
    written.push({ path: yamlPath, note: 'your data — edit this first' })
    entries = [{ date: '2025-03-14', title: 'An example entry', note: 'Replace this.' }]
  }

  if (existsSync(schemaPath)) {
    throw new Error(`schemas/${id}.ts already exists; delete it first to regenerate`)
  }

  const { body, imports } = inferSchema(entries)
  await mkdir(join(schemaPath, '..'), { recursive: true })
  await writeFile(schemaPath, schemaModule(id, body, imports, inferred))
  written.push({ path: schemaPath, note: inferred ? `drafted from content/${id}.yml` : 'the shape of an entry' })

  if (options.component !== false) {
    const componentPath = join(rootDir, 'app', 'components', `${pascalCase(id)}Section.vue`)
    if (!existsSync(componentPath)) {
      await mkdir(join(componentPath, '..'), { recursive: true })
      await writeFile(componentPath, componentModule(id))
      written.push({ path: componentPath, note: 'how the entries look' })
    }
  }

  return written.map(file => ({ ...file, path: relative(rootDir, file.path) }))
}

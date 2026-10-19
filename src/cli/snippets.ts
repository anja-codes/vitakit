/**
 * Code that shows a field: on the website (Vue) and in the PDF (Eta).
 *
 * Generated from the field's plain type, so each kind of value gets markup
 * that suits it: zero is a number worth showing, a link links, formatted text
 * is rendered HTML, and a group of fields is left to the user with a comment
 * rather than printed as an object.
 */
import type { FieldDescription } from '../fields'
import { escapeTex } from '../tex/escape'

/** `evaluationScore` → `Evaluation score` */
export function fieldLabel(name: string): string {
  if (name === 'url') return 'Link'
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/
const access = (object: string, name: string) => IDENTIFIER.test(name) ? `${object}.${name}` : `${object}['${name}']`

export interface WebSnippet {
  /** One element, or a comment when the value has no obvious markup. */
  markup: string
  /** Names to import from `@anja.codes/vitakit/shared`. */
  imports: string[]
}

/**
 * One line of markup showing `field` of `entry`, with the given class;
 * rendered only when the entry has a value.
 */
export function webFieldSnippet(field: FieldDescription, className = 'vita-entry__note', entry = 'entry'): WebSnippet {
  const value = access(entry, field.path)
  const label = fieldLabel(field.path)
  const line = (condition: string, content: string) => `<p v-if="${condition}" class="${className}">${content}</p>`

  if (field.type === 'link') {
    return {
      markup: line(`asLinkedList(${value}).length`, `${label}: <template v-for="(link, index) in asLinkedList(${value})" :key="index"><template v-if="index">, </template><a v-if="link.url" :href="link.url">{{ link.label }}</a><template v-else>{{ link.label }}</template></template>`),
      imports: ['asLinkedList'],
    }
  }
  if (field.several && ['text', 'choice', 'number'].includes(field.type)) {
    return { markup: line(`Array.isArray(${value}) && ${value}.length`, `${label}: {{ (${value} as unknown[]).join(', ') }}`), imports: [] }
  }
  if (!field.several) {
    switch (field.type) {
      case 'text':
      case 'choice':
        return { markup: line(`typeof ${value} === 'string'`, `${label}: {{ ${value} }}`), imports: [] }
      case 'number':
        return { markup: line(`typeof ${value} === 'number'`, `${label}: {{ ${value} }}`), imports: [] }
      case 'yes-no':
        return { markup: line(`${value} === true`, label), imports: [] }
      case 'formatted-text':
        return { markup: line(`richHtml(${value})`, `${label}: <span v-html="richHtml(${value})" />`), imports: ['richHtml'] }
      case 'date':
        return { markup: line(`${value}`, `${label}: <VitaDate :value="${value} as DateRange" />`), imports: ['type DateRange'] }
      case 'web-address':
        return { markup: line(`typeof ${value} === 'string'`, `<a :href="${value}">${label}</a>`), imports: [] }
    }
  }
  return {
    markup: `<!-- ${field.path}: ${field.type === 'group' ? 'a group of fields' : 'a value of its own kind'}; show its parts, e.g. ${field.fields?.[0] ? `{{ ${value}.${field.fields[0].path.split('.').pop()} }}` : `{{ ${value} }}`} -->`,
    imports: [],
  }
}

/** One Eta line adding `field` of `item` to the current entry as a note. */
export function etaFieldSnippet(field: FieldDescription, item = 'item'): string {
  const value = access(item, field.path)
  const label = escapeTex(fieldLabel(field.path))
  if (field.type === 'link') {
    return field.several
      ? `<%~ it.vita.note\`${label}: \${it.join((${value} ?? []).map(value => it.linked(value)))}\` %>`
      : `<%~ it.vita.note\`${label}: \${it.linked(${value})}\` %>`
  }
  if (field.several && ['text', 'choice', 'number'].includes(field.type)) {
    return `<%~ it.vita.note\`${label}: \${it.join(${value} ?? [])}\` %>`
  }
  if (!field.several) {
    switch (field.type) {
      case 'text':
      case 'choice':
      case 'number':
      case 'formatted-text':
        return `<%~ it.vita.note\`${label}: \${${value}}\` %>`
      case 'yes-no':
        return `<% if (${value} === true) { %><%~ it.vita.note('${label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}') %><% } %>`
      case 'date':
        return `<%~ it.vita.note\`${label}: \${it.date(${value})}\` %>`
      case 'web-address':
        return `<% if (${value}) { %><%~ it.vita.note(it.linked('${label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}', ${value})) %><% } %>`
    }
  }
  return `<%/* ${field.path}: ${field.type === 'group' ? 'a group of fields' : 'a value of its own kind'}; e.g. it.text(${value}${field.fields?.[0] ? `.${field.fields[0].path.split('.').pop()}` : ''}) */%>`
}

function sharedImport(imports: string[]): string[] {
  const names = [...new Set(imports)].sort((a, b) => a.replace('type ', '').localeCompare(b.replace('type ', '')))
  if (!names.length) return []
  return names.every(name => name.startsWith('type '))
    ? [`import type { ${names.map(name => name.slice(5)).join(', ')} } from '@anja.codes/vitakit/shared'`]
    : [`import { ${names.join(', ')} } from '@anja.codes/vitakit/shared'`]
}

const indent = (lines: string[], by: string) => lines.map(line => line ? by + line : line)

/**
 * A component around `VitaSection` that changes one region of every entry:
 * vitakit keeps the list, sorting, dates and default styling.
 */
export function entryComponent(id: string, name: string, fields: FieldDescription[], region: 'note' | 'meta'): string {
  const snippets = fields.map(field => webFieldSnippet(field, region === 'note' ? 'vita-entry__note' : 'vita-entry__meta'))
  const imports = sharedImport(['type Entry', 'type Where', ...snippets.flatMap(snippet => snippet.imports)])
  const keep = region === 'note'
    ? ['<p v-if="display.note !== undefined" class="vita-entry__note">{{ display.note }}</p>']
    : [
        '<p v-if="display.meta.length" class="vita-entry__meta">',
        '  <template v-for="(part, index) in display.meta" :key="index">',
        '    <template v-if="index"> · </template>',
        '    <template v-if="part.kind === \'linked\'">',
        '      <a v-if="part.linked.url" :href="part.linked.url">{{ part.linked.label }}</a>',
        '      <template v-else>{{ part.linked.label }}</template>',
        '    </template>',
        '    <template v-else>{{ part.text }}</template>',
        '  </template>',
        '</p>',
      ]
  const body = fields.length
    ? [...keep, ...snippets.map(snippet => snippet.markup)]
    : [...keep, `<!-- Add your own lines here, e.g. -->`, `<!-- <p v-if="typeof entry.audience === 'string'" class="vita-entry__${region}">Audience: {{ entry.audience }}</p> -->`]
  return [
    '<script setup lang="ts">',
    '/**',
    ` * How ${id} entries look on the website: vitakit's list, with your own`,
    ` * ${region === 'note' ? 'note' : 'secondary'} line. Use it like VitaSection, on any page:`,
    ` *   <${name} id="${id}" title="…" />`,
    ' *',
    ` * The #${region} slot below replaces that region of each entry. Delete it to get`,
    ' * vitakit\'s version back; the other slots are #title, #meta, #note and the',
    ' * default slot (the whole entry). `entry` has every field of the entry,',
    ' * `display` what vitakit would show.',
    ' */',
    ...imports,
    '',
    'const props = defineProps<{ id?: string, entries?: Entry[], title?: string, where?: Where, limit?: number }>()',
    '</script>',
    '',
    '<template>',
    '  <VitaSection v-bind="props">',
    `    <template #${region}="{ ${region === 'note' ? 'entry, display' : 'entry, display'} }">`,
    ...indent(body, '      '),
    '    </template>',
    '  </VitaSection>',
    '</template>',
    '',
  ].join('\n')
}

/**
 * A component with its own list markup, for grouping, numbering or a
 * different layout; vitakit still selects and sorts the entries.
 */
export function listComponent(id: string, name: string, fields: FieldDescription[], groupBy?: string): string {
  const titleField = fields.find(field => ['title', 'position', 'degree', 'role', 'student', 'name'].includes(field.path))
  const rest = fields.filter(field => field !== titleField && field.path !== 'date' && field.path !== groupBy)
  const snippets = rest.map(field => webFieldSnippet(field))
  const titleLine = titleField
    ? titleField.type === 'formatted-text'
      ? `<p class="vita-entry__title" v-html="richHtml(${access('entry', titleField.path)})" />`
      : `<p class="vita-entry__title">{{ ${access('entry', titleField.path)} }}</p>`
    : '<!-- <p class="vita-entry__title">{{ entry.title }}</p> -->'
  const imports = sharedImport([
    'filterWhere', 'type Entry', 'type Where',
    ...(fields.some(field => field.path === 'date') ? ['type DateRange'] : []),
    ...(titleField?.type === 'formatted-text' ? ['richHtml'] : []),
    ...snippets.flatMap(snippet => snippet.imports),
  ])
  const hasDate = fields.some(field => field.path === 'date')
  const row = [
    `<VitaEntry v-for="entry in ${groupBy ? 'group.entries' : 'entries'}" :key="entry.id"${hasDate ? ' :date="entry.date as DateRange"' : ''}>`,
    ...indent([titleLine, ...snippets.map(snippet => snippet.markup)], '  '),
    '</VitaEntry>',
  ]
  const grouping = groupBy
    ? [
        '',
        `// Entries in a row with the same ${groupBy} form a group, in the order`,
        '// vitakit sorted them (newest first).',
        'const groups = computed(() => {',
        '  const result: { label: string, entries: Entry[] }[] = []',
        '  for (const entry of entries.value) {',
        `    const label = String(${access('entry', groupBy)} ?? '')`,
        '    const last = result[result.length - 1]',
        '    if (last?.label === label) last.entries.push(entry)',
        '    else result.push({ label, entries: [entry] })',
        '  }',
        '  return result',
        '})',
      ]
    : []
  const list = groupBy
    ? [
        '<template v-for="group in groups" :key="group.label">',
        '  <h3 class="vita-section-group__subtitle">',
        '    {{ group.label }}',
        '  </h3>',
        '  <ul class="vita-section">',
        ...indent(row, '    '),
        '  </ul>',
        '</template>',
      ]
    : ['<ul class="vita-section">', ...indent(row, '  '), '</ul>']
  return [
    '<script setup lang="ts">',
    '/**',
    ` * How the ${id} section looks on the website, list and all. vitakit selects and sorts`,
    ' * the entries (newest first, `where`, `limit`); the markup below is yours:',
    ' * group them, number them, change what each one shows. Use it like',
    ` * VitaSection, on any page: <${name} id="${id}" title="…" />`,
    ' *',
    ' * Each field of the entries has a line below; delete the ones you do not',
    ' * want. The classes are styled in app/assets/css/main.css.',
    ' */',
    `import { computed } from 'vue'`,
    ...imports,
    '',
    'const props = defineProps<{ id: string, title?: string, where?: Where, limit?: number }>()',
    '',
    'const entries = computed<Entry[]>(() => {',
    '  const selected = filterWhere(useSection(props.id), props.where)',
    '  return props.limit ? selected.slice(0, props.limit) : selected',
    '})',
    ...grouping,
    '</script>',
    '',
    '<template>',
    '  <section v-if="entries.length" :id="id" class="vita-section-group">',
    '    <h2 v-if="title" class="vita-section-group__title">',
    '      {{ title }}',
    '    </h2>',
    ...indent(list, '    '),
    '  </section>',
    '</template>',
    '',
  ].join('\n')
}

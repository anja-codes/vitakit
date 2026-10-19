import { join } from 'node:path'
import type { Inventory, SectionInventory, DocumentInventory, PageInventory } from '../../inventory'
import { CommandError, UsageError, type CommandSpec, type CommandContext } from '../command'
import { block } from '../io'
import { countsText, problemLines, webPlacementsOf } from '../describe'

const STARTER = (id: string) => [
  `import { section, dateRange, richText, text } from '@anja.codes/vitakit'`,
  ``,
  `export default section({`,
  `  date: dateRange,`,
  `  title: richText,`,
  `  note: text.optional(),`,
  `})`,
].map(line => `    ${line}`).join('\n').replace(/^/, `  schemas/${id}.ts, for example:\n\n`)

function schemaText(section: SectionInventory): string {
  const { schema } = section
  if (schema.origin === 'none') return 'none yet'
  if (schema.origin === 'built-in') return 'built-in'
  if (schema.sharedWith) return `${schema.file}, the same as ${schema.sharedWith}`
  return schema.extendsBuiltIn ? `built-in, extended in ${schema.file}` : `${schema.file} (yours)`
}

/** Lines to add for showing fields, where this section's files are. */
async function fieldSnippets(context: CommandContext, inv: Inventory, section: SectionInventory, names: string[]): Promise<string[]> {
  const { style, run, root } = context
  const { webFieldSnippet, etaFieldSnippet } = await import('../snippets')
  const { existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const id = section.id
  const unknown = names.filter(name => !section.fields?.some(field => field.path === name))
  if (unknown.length) {
    throw new CommandError(`${id} has no field ${unknown.join(', ')}; its fields are ${section.fields?.map(field => field.path).join(', ') || '(unknown)'}`)
  }
  const fields = names.map(name => section.fields!.find(field => field.path === name)!)
  const web = fields.map(field => webFieldSnippet(field))
  const imports = [...new Set(web.flatMap(snippet => snippet.imports))]
  const lines: string[] = ['', style.bold(`Showing ${names.join(', ')}`), '']

  const components = [...new Set(webPlacementsOf(inv, id)
    .filter(placement => placement.component !== 'code' && placement.component !== 'VitaSection')
    .map(placement => placement.component))]
  const indented = (snippets: string[]) => snippets.map(snippet => `    ${snippet}`)
  if (components.length) {
    for (const component of components) {
      lines.push(block('website', [[`${inv.web.components.get(component)}: add where the entry's lines are, e.g. in its #note slot`]]))
    }
  } else {
    lines.push(block('website', [[`${id} is shown by VitaSection. \`${run.bin('vitakit', `customize ${id} --web --field ${names.join(' --field ')}`)}\``]]))
    lines.push(block('', [['creates a component that shows them; or, on the page, give VitaSection a slot:']]))
    lines.push('', `    <VitaSection id="${id}">`, '      <template #note="{ entry, display }">',
      '        <p v-if="display.note !== undefined" class="vita-entry__note">{{ display.note }}</p>')
    lines.push(...web.map(snippet => `        ${snippet.markup}`), '      </template>', '    </VitaSection>')
  }
  if (components.length) lines.push('', ...indented(web.map(snippet => snippet.markup)))
  if (imports.length) lines.push('', `    import { ${imports.join(', ')} } from '@anja.codes/vitakit/shared'`)

  lines.push('')
  if (existsSync(join(root, 'cv-tex', 'templates', `${id}.eta`))) {
    lines.push(block('pdf', [[`cv-tex/templates/${id}.eta (yours): add inside its loop over the entries, after the notes`]]))
  } else if (inv.documents.length) {
    lines.push(block('pdf', [[`vitakit's template. \`${run.bin('vitakit', `customize ${id} --pdf --field ${names.join(' --field ')}`)}\` copies it with these lines:`]]))
  }
  if (inv.documents.length) lines.push('', ...indented(fields.map(field => etaFieldSnippet(field))))
  return lines
}

async function explainSection(context: CommandContext, inv: Inventory, section: SectionInventory, fields: string[] = []): Promise<string[]> {
  const { style, run } = context
  const lines = [style.bold(section.id), '']
  lines.push(block('data', [[`${section.where}${countsText(section) ? ` · ${countsText(section)}` : ''}`]]))
  lines.push(block('schema', [[schemaText(section)]]))

  if (section.fields) {
    const { fieldSummary } = await import('../../fields')
    lines.push(block('', section.fields.flatMap(field => [
      [`  ${field.path}`, fieldSummary(field)],
      ...(field.fields ?? []).map(child => [`    ${child.path}`, fieldSummary(child)]),
    ])))
  } else if (section.schema.origin === 'none') {
    lines.push('', `  There is no built-in schema for "${section.id}". \`${context.run.bin('vitakit', `add section ${section.id}`)}\``, '  drafts one from its entries; or write', STARTER(section.id))
  }
  lines.push('')

  // Website
  const web = webPlacementsOf(inv, section.id)
  if (web.length) {
    lines.push(block('website', web.map(placement => [
      placement.route ?? '',
      `${placement.file}:${placement.line}`,
      placement.component === 'code'
        ? 'useSection, in code'
        : `<${placement.component}${placement.title !== undefined ? ` title="${placement.title}"` : ''}${placement.where ? ` :where="${placement.where}"` : ''}${placement.limit ? ` limit ${placement.limit}` : ''}>`,
    ])))
  } else {
    lines.push(block('website', [[inv.web.dynamic.length ? 'not found on any page; some pages choose sections in code (see status)' : 'not on any page']]))
  }

  // PDF
  if (inv.documents.length) {
    const { explainSelection } = await import('../../tex/documents')
    const { resolveTemplate } = await import('../../tex/emit')
    const template = section.problems.length ? undefined : await resolveTemplate(section.id, join(inv.root, 'cv-tex', 'templates'))
    const templateText = template
      ? template.origin === 'local'
        ? `cv-tex/templates/${template.generic ? '_generic' : section.id}.eta (yours)`
        : template.generic ? `vitakit's generic template (there is no ${section.id}.eta)` : `vitakit's ${section.id}.eta`
      : undefined
    const rows: string[][] = []
    for (const document of inv.documents) {
      const placements = document.placements.filter(placement => placement.section === section.id)
      if (!placements.length) {
        rows.push([document.name, 'not included'])
        continue
      }
      for (const placement of placements) {
        rows.push([document.name, `${placement.file}:${placement.line}  \\vitasection${placement.heading !== undefined ? `[${placement.heading}]` : ''}{${section.id}}`])
      }
      if (templateText) rows.push(['', `template: ${templateText}`])
      const entries = inv.content.sections[section.id]
      if (entries && !section.problems.length) {
        const { total, steps } = explainSelection(entries, document.options, section.id)
        const kept = steps[steps.length - 1]?.kept ?? total
        const removed = steps.filter(step => step.removed > 0).map(step => `${step.rule} −${step.removed}`)
        rows.push(['', `${kept} of ${total} entries${removed.length ? ` (${removed.join(', ')})` : ''}`])
      }
    }
    lines.push('', block('pdf', rows))
  } else {
    lines.push('', block('pdf', [['no documents in cv-tex/']]))
  }

  if (fields.length) lines.push(...await fieldSnippets(context, inv, section, fields))

  // The missing schema was explained above.
  const problems = section.problems.filter(problem => !(section.schema.origin === 'none' && problem.message.startsWith('no schema')))
  if (problems.length) lines.push('', style.bold('Problems'), ...problemLines(problems))
  lines.push('', `Check it: \`${run.bin('vitakit', `validate ${section.id}`)}\``)
  return lines
}

async function explainDocument(context: CommandContext, inv: Inventory, document: DocumentInventory): Promise<string[]> {
  const { style, run } = context
  const { explainSelection } = await import('../../tex/documents')
  const lines = [style.bold(`${document.name}`), '']
  lines.push(block('source', [[document.tex]]))
  lines.push(block('settings', [[document.yml ? `${document.yml} · visibility: ${document.options.visibility}` : `none (no cv-tex/${document.name}.yml) · visibility: ${document.options.visibility}`]]), '')

  if (document.placements.length) {
    lines.push(block('includes', document.placements.map((placement) => {
      const section = inv.sections.find(candidate => candidate.id === placement.section)
      let detail = ''
      if (placement.section === 'publications') {
        detail = inv.publications ? `${inv.publications.entries} entries in ${inv.publications.groups} groups` : 'no content/publications.bib'
      } else if (section?.problems.length) {
        detail = style.red('has problems')
      } else if (section) {
        const { total, steps } = explainSelection(inv.content.sections[section.id] ?? [], document.options, section.id)
        detail = `${steps[steps.length - 1]?.kept ?? total} of ${total} entries`
      } else {
        detail = style.red('no such section')
      }
      return [
        `line ${placement.line}`,
        placement.section,
        placement.heading ?? '',
        detail,
      ]
    })))
  } else {
    lines.push(block('includes', [['no \\vitasection or \\vitainput lines found']]))
  }

  const pdf = document.pdf
    ? `${document.pdf.file}${document.pdf.mtimeMs < inv.sourcesMtimeMs ? ', older than its sources' : ''}`
    : 'not built yet'
  lines.push('', block('pdf', [[pdf]]))
  if (document.problems.length) lines.push('', style.bold('Problems'), ...problemLines(document.problems))
  lines.push('', `Build it: \`${run.bin('vitakit', `pdf ${document.name}`)}\`; per section: \`${run.bin('vitakit', 'explain <section>')}\``)
  return lines
}

function explainRoute(context: CommandContext, inv: Inventory, page: PageInventory | undefined, route: string): string[] {
  const { style } = context
  const lines = [style.bold(route), '']
  const rows: string[][] = []
  if (page?.markdown) rows.push(['text', `${page.markdown}${page.title ? ` · "${page.title}"` : ''}`])
  if (page?.vue) rows.push(['page', page.vue])
  else if (page?.markdown && inv.catchAll) rows.push(['page', `${inv.catchAll} (shows Markdown pages)`])
  if (!page) rows.push(['page', 'no Markdown or Vue page has this route'])
  else rows.push(['menu', page.inMenu ? 'in the menu (content/profile.yml)' : 'not in the menu (content/profile.yml, nav)'])
  lines.push(...rows.map(([label, text]) => block(label!, [[text!]])))

  const placements = inv.web.placements.filter(placement => placement.route === route)
  if (placements.length) {
    lines.push('', block('sections', placements.map(placement => [
      placement.section,
      `line ${placement.line}`,
      placement.component === 'code' ? 'useSection, in code' : `<${placement.component}${placement.title !== undefined ? ` title="${placement.title}"` : ''}>`,
    ])))
  }
  const dynamic = inv.web.dynamic.filter(usage => usage.file === page?.vue)
  if (dynamic.length) {
    lines.push('', 'Chosen in code, so not listed:', ...dynamic.map(usage => `  line ${usage.line}  ${usage.usage}`))
  }
  return lines
}

export const explain: CommandSpec = {
  name: 'explain',
  summary: 'where a section, PDF document or page comes from, and where it goes',
  positionals: [{ name: 'name', required: true }],
  options: {
    section: { type: 'boolean', description: 'the name is a section (when a document has the same name)' },
    document: { type: 'boolean', description: 'the name is a PDF document (when a section has the same name)' },
    field: { type: 'string', multiple: true, value: '<name>', description: 'a section: lines that show this field, on the website and in the PDF' },
  },
  project: true,
  help: run => `
  ${run.bin('vitakit', 'explain talks')}       a section: its file, fields, pages and PDFs
  ${run.bin('vitakit', 'explain cv')}          a PDF document: what it includes, from where
  ${run.bin('vitakit', 'explain /cv/')}        a website page: its files and sections
  ${run.bin('vitakit', 'explain teaching --field evaluation')}   lines that show a field

For a section it shows which entries each PDF document selects, and which
setting removed the others -- the answer to "why is this not in my PDF?".
Never prints entry contents, only counts.`,

  async run(context, { positionals, values }) {
    const { inventory } = await import('../../inventory')
    const inv = await inventory(context.root)
    const name = positionals[0]!

    let lines: string[]
    if (name.startsWith('/')) {
      const route = name.endsWith('/') ? name : `${name}/`
      lines = explainRoute(context, inv, inv.pages.find(page => page.route === route), route)
    } else {
      const section = inv.sections.find(candidate => candidate.id === name)
      const document = inv.documents.find(candidate => candidate.name === name)
      if (values.section && values.document) throw new UsageError('use --section or --document, not both', 'explain')
      if (section && document && !values.section && !values.document) {
        throw new UsageError(`"${name}" is both a section and a PDF document; add --section or --document`, 'explain')
      }
      const fields = (values.field as string[] | undefined) ?? []
      if (fields.length && !(section && !values.document)) throw new UsageError('--field goes with a section', 'explain')
      if (section && !values.document) lines = await explainSection(context, inv, section, fields)
      else if (document && !values.section) lines = await explainDocument(context, inv, document)
      else {
        const known = [
          inv.sections.length ? `sections: ${inv.sections.map(candidate => candidate.id).join(', ')}` : '',
          inv.documents.length ? `documents: ${inv.documents.map(candidate => candidate.name).join(', ')}` : '',
        ].filter(Boolean).join('; ')
        throw new CommandError(`nothing called "${name}"${known ? `; ${known}` : ''}. A page is explained by its route, e.g. /cv/.`)
      }
    }
    context.io.out(`${lines.join('\n')}\n`)
    return 0
  },
}

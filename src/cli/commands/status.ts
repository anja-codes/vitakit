import type { CommandSpec } from '../command'
import { table } from '../io'
import { countsText, firstLine, pdfCell, pdfPlacementsOf, webCell, webPlacementsOf } from '../describe'

export const status: CommandSpec = {
  name: 'status',
  summary: 'what is in this project, what is broken, where sections appear',
  positionals: [],
  options: {},
  json: true,
  project: true,
  help: run => `
Lists your sections and where each one appears: on which website pages, and in
which PDF documents. A section that appears nowhere is fine -- that is your
choice -- and is shown as "–". Problems are things a build would fail on.

Reads your files only: no website build, no LaTeX. Entry contents are never
printed, only how many there are.

Next: \`${run.bin('vitakit', 'explain <section>')}\` for the details of one section,
\`${run.bin('vitakit', 'validate')}\` to check everything before building.`,

  async run({ io, style, run, root, json }) {
    const { inventory } = await import('../../inventory')
    const inv = await inventory(root)

    if (json) {
      io.out(`${JSON.stringify({
        root,
        sections: inv.sections.map(section => ({
          id: section.id,
          where: section.where,
          schema: section.schema,
          entries: section.entries,
          counts: section.counts,
          website: webPlacementsOf(inv, section.id),
          pdf: pdfPlacementsOf(inv, section.id),
          problems: section.problems,
        })),
        unknownWebsiteUsages: inv.web.dynamic,
        publications: inv.publications ?? null,
        pages: inv.pages,
        documents: inv.documents.map(document => ({
          name: document.name,
          tex: document.tex,
          yml: document.yml ?? null,
          pdf: document.pdf ? { file: document.pdf.file, upToDate: document.pdf.mtimeMs >= inv.sourcesMtimeMs } : null,
          problems: document.problems,
        })),
        problems: inv.problems,
      }, null, 2)}\n`)
      return 0
    }

    const lines: string[] = []
    if (inv.sections.length) {
      const rows = [[style.bold('Sections'), '', style.bold('website'), style.bold('pdf')]]
      for (const section of inv.sections) {
        const mark = section.schema.origin === 'none' ? style.yellow('?') : section.problems.length ? style.red('✖') : ' '
        const state = section.schema.origin === 'none'
          ? style.yellow('no schema yet')
          : section.problems.length ? style.red(`${countsText(section) || 'unreadable'}, has problems`) : countsText(section)
        rows.push([`${mark} ${section.id}`, state, webCell(inv, section.id), pdfCell(inv, section.id)])
      }
      lines.push(table(rows, ''), '')
    } else {
      lines.push(`${style.bold('Sections')}  none yet: a section is a file content/<name>.yml`, '')
    }

    const facts: string[][] = []
    if (inv.publications) {
      facts.push([style.bold('Publications'), `${inv.publications.file} · ${inv.publications.entries} entries in ${inv.publications.groups} groups`])
    }
    const pages = inv.pages.filter(page => page.markdown || page.vue)
    if (pages.length) {
      const outside = pages.filter(page => !page.inMenu).map(page => page.route)
      facts.push([style.bold('Pages'), `${pages.map(page => page.route).join('  ')}${
        outside.length === 0 ? '   (all in the menu)' : `   (not in the menu: ${outside.join(' ')})`}`])
    }
    for (const [index, document] of inv.documents.entries()) {
      const pdf = document.pdf
        ? `${document.name}.pdf${document.pdf.mtimeMs < inv.sourcesMtimeMs ? ' (older than its sources)' : ''}`
        : 'not built yet'
      facts.push([index === 0 ? style.bold('PDF') : '', `${document.tex} → ${pdf}`])
    }
    if (!inv.documents.length) facts.push([style.bold('PDF'), 'no documents in cv-tex/'])
    lines.push(table(facts, ''), '')

    if (inv.web.dynamic.length) {
      lines.push(`Not resolvable without running the site, so "unknown" above:`)
      lines.push(...inv.web.dynamic.map(usage => `  ${usage.file}:${usage.line}  ${usage.usage}`), '')
    }

    const missingSchemas = inv.sections.filter(section => section.schema.origin === 'none')
    const count = inv.problems.length
    if (count) {
      lines.push(style.bold('Problems'))
      lines.push(...inv.problems.map(problem => `  ${style.red('✖')} ${problem.where}: ${firstLine(problem.message)}`), '')
    }
    if (count) {
      lines.push(`${count} ${count === 1 ? 'problem' : 'problems'}. Details: \`${run.bin('vitakit', 'validate')}\`${
        missingSchemas.length ? `; for a section without schema: \`${run.bin('vitakit', `explain ${missingSchemas[0]!.id}`)}\`` : ''}`)
    } else {
      lines.push(style.green('No problems.'))
    }
    io.out(`${lines.join('\n')}\n`)
    return 0
  },
}

import { CommandError, type CommandSpec } from '../command'
import { problemLines } from '../describe'

export const validate: CommandSpec = {
  name: 'validate',
  summary: 'check content, schemas, pages and PDF settings; no build, no LaTeX',
  positionals: [{ name: 'section', variadic: true }],
  options: {},
  json: true,
  project: true,
  help: run => `
Checks everything a build would check, without building: every file in
content/, the schemas, page settings, which sections pages and PDF documents
include, cv-tex/<document>.yml, and every PDF template, rendered in memory.
Reports all problems at once and exits with 1 if there is any.

  ${run.bin('vitakit', 'validate')}              everything
  ${run.bin('vitakit', 'validate talks')}        only what concerns talks

Not a replacement for \`${run.script('check')}\`, which builds the website and checks
what was built, or for building the PDF, which runs LaTeX.`,

  async run({ io, style, root, json }, { positionals }) {
    const { validateProject } = await import('../../validate')
    const { problems, inventory: inv } = await validateProject(root, { sections: positionals })
    const unknown = positionals.filter(id => !inv.sections.some(section => section.id === id))
    if (unknown.length) {
      throw new CommandError(`no section called ${unknown.join(', ')}; the sections are ${inv.sections.map(section => section.id).join(', ') || '(none)'}`)
    }

    if (json) {
      io.out(`${JSON.stringify({ ok: problems.length === 0, problems }, null, 2)}\n`)
      return problems.length ? 1 : 0
    }

    if (!problems.length) {
      const checked = positionals.length ? positionals : inv.sections.map(section => section.id)
      const parts = [
        `${checked.length} ${checked.length === 1 ? 'section' : 'sections'}`,
        ...(!positionals.length && inv.publications ? [`${inv.publications.entries} publications`] : []),
        ...(!positionals.length ? [`${inv.pages.filter(page => page.markdown || page.vue).length} pages`] : []),
        `${inv.documents.length} PDF ${inv.documents.length === 1 ? 'document' : 'documents'}`,
      ]
      io.out(`${style.green('✓')} ${parts.join(', ')}: no problems\n`)
      return 0
    }

    const lines = problemLines(problems).map(line => line.startsWith('    ') ? line : `${style.red('✖')}${line.slice(1)}`)
    io.out(`${lines.join('\n')}\n\n${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}\n`)
    return 1
  },
}

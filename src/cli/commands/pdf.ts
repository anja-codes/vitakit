import { relative } from 'node:path'
import { CommandError, type CommandSpec } from '../command'

export const pdf: CommandSpec = {
  name: 'pdf',
  summary: 'build the PDF documents in cv-tex/',
  positionals: [{ name: 'document', variadic: true }],
  options: {
    'tex-only': { type: 'boolean', description: 'write the .tex files but do not run LaTeX; needs no TeX installation' },
    'verbose': { type: 'boolean', description: 'show LaTeX\'s full output while it runs' },
  },
  project: true,
  help: run => `
Renders content/ into cv-tex/generated/<document>/, one .tex file per section,
then runs latexmk. The finished PDF is written next to its source, as
cv-tex/<document>.pdf; everything else stays in the generated directory, which
is vitakit's -- do not edit anything there.

  ${run.bin('vitakit', 'pdf')}                    every document in cv-tex/
  ${run.bin('vitakit', 'pdf cv')}                 just cv.tex
  ${run.bin('vitakit', 'pdf cv application')}     several
  ${run.bin('vitakit', 'pdf --tex-only')}         only the .tex files

A document is a .tex file you own; a copy of cv.tex is a new document. What it
contains is decided by an optional cv-tex/<document>.yml. Needs latexmk and
biber, from any current TeX distribution.`,

  async run({ io, style, run, root }, { positionals, values }) {
    const { buildCv, MissingToolError } = await import('../../tex/build')
    const texOnly = values['tex-only'] === true
    const local = (path: string) => relative(root, path)
    try {
      await buildCv({
        rootDir: root,
        only: positionals,
        noPdf: texOnly,
        latexOutput: values.verbose ? 'inherit' : 'capture',
        onProgress(event) {
          if (event.step === 'tex') io.out(`${event.document}: wrote ${local(event.dir)}/ (${event.files} files)${texOnly ? '' : ', running latexmk…'}\n`)
          else io.out(`${event.document}: ${style.green('✓')} ${local(event.file)}\n`)
        },
      })
    } catch (error) {
      if (error instanceof MissingToolError) {
        throw new CommandError(`${error.message}.\n  Without one, \`${run.bin('vitakit', 'pdf --tex-only')}\` writes the .tex files, e.g. for Overleaf or CI.`)
      }
      // Paths in the project, as the user sees them.
      if (error instanceof Error) error.message = error.message.replaceAll(`${root}/`, '')
      throw error
    }
    return 0
  },
}

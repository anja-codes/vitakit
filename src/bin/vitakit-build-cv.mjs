#!/usr/bin/env node
/**
 * Render content/ into cv-tex/generated/ and typeset it.
 */
import process from 'node:process'
import { buildCv } from '../../dist/tex.mjs'

const HELP = `vitakit-build-cv — build the PDF documents in cv-tex/

Usage
  pnpm build:cv [document...] [options]

Renders content/ into cv-tex/generated/<document>/, one .tex file per section,
then runs latexmk. The finished PDF is written next to its source, as
cv-tex/<document>.pdf; everything else stays in the generated directory.

  pnpm build:cv                  every document in cv-tex/
  pnpm build:cv cv               just cv.tex
  pnpm build:cv cv application   several

Options
  --no-pdf     write the .tex files but do not run latexmk. Useful without a
               TeX installation, and to inspect what was generated.
  --help       this text

A document is a .tex file you own; a copy of cv.tex is a new document. What it
contains is decided by an optional cv-tex/<document>.yml (visibility, which
entries, how many). See docs/cv-documents.md.

Requires latexmk and biber, from any current TeX distribution.`

const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(HELP)
  process.exit(0)
}

const noPdf = args.includes('--no-pdf')
const only = args.filter(argument => !argument.startsWith('-'))

try {
  const outputs = await buildCv({ rootDir: process.cwd(), only, noPdf })
  console.log(noPdf
    ? `vitakit: generated .tex for ${only.length ? only.join(', ') : 'all documents'}`
    : `vitakit: built ${outputs.join(', ')}`)
} catch (error) {
  console.error(`\nvitakit: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}

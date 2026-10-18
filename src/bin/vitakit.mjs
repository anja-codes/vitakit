#!/usr/bin/env node
/**
 * The vitakit command. Three subcommands, each of which only writes files you
 * could have written yourself — see docs/cli.md for why there are not more.
 */
import process from 'node:process'
import { relative } from 'node:path'
import { addSection, eject, listEjectable } from '../../dist/cli.mjs'

const USAGE = `vitakit — files for a vitakit project

Usage
  pnpm vitakit <command> [options]

Commands
  add <name>        set up a new section: content file, schema, component
  list              show everything that can be ejected
  eject <name>      copy a package default into your project

Run a command with --help for details and examples.

Related commands, from the same package:
  pnpm build:cv     render content/ into cv-tex/ and run latexmk
  pnpm check        typecheck, generate the site, and verify the output
`

const HELP = {
  add: `vitakit add <name> — set up a new section

A section is a file in content/, a schema describing what it may contain, and
usually a component deciding how it looks. This writes whichever of those are
missing; it never overwrites a file you have.

  pnpm vitakit add outreach

  content/outreach.yml                 your data — edit this first
  schemas/outreach.ts                  the shape of an entry
  app/components/OutreachSection.vue   how the entries look

If content/<name>.yml already exists, the schema is drafted from it: field
types are guessed from your data — dates, URLs, enums, and which fields are
optional — so you correct a draft instead of writing one.

  pnpm vitakit add outreach            # after writing content/outreach.yml

Options
  --no-component    do not write a component; the section then renders through
                    <VitaSection>, which is a fallback rather than a design

Notes
  The name becomes a file name: lowercase, kebab-case (research-stays).
  For a built-in section (education, employment, teaching, talks,
  supervision) you do not need this: create content/<name>.yml and it works.
  To change what a built-in section may contain, use \`vitakit eject <name>\`.

Afterwards
  Show it on a page with <OutreachSection /> in app/pages/, or put
  \\vitasection{outreach} in cv-tex/cv.tex to add it to the PDF.`,

  list: `vitakit list — show everything that can be ejected

Prints each item, what kind of thing it is, and where a copy would land:

  VitaSection       component  -> app/components/VitaSection.vue
  talks.eta         template   -> cv-tex/templates/talks.eta
  teaching          schema     -> schemas/teaching.ts
  publications      schema     -> schemas/publications.ts
  publications.csl  style      -> content/publications.csl
  vitakit-cv.cls    class      -> cv-tex/vitakit-cv.cls

  component   how a section looks on the website
  schema      what a section may contain; for publications, the groups,
              the links after each reference and the fields passed on
  template    how a section is written into the PDF
  style       how publications.bib is formatted on the website (CSL)
  class       the LaTeX document class: fonts, spacing, the entry macros`,

  eject: `vitakit eject <name> — copy a package default into your project

The copy wins from then on: vitakit always prefers a file in your project over
its own. This is the only command that exists purely for convenience — the
files live inside node_modules/.pnpm/…, at a path that changes with every
update, so copying them by hand is impractical.

  pnpm vitakit eject VitaSection       # restyle how sections look
  pnpm vitakit eject teaching          # add or remove fields of a section
  pnpm vitakit eject talks.eta         # change how talks appear in the PDF
  pnpm vitakit eject publications.csl  # change the citation style of the website
  pnpm vitakit eject vitakit-cv.cls    # take over the LaTeX document class

Use \`vitakit list\` to see the names.

Options
  --force           overwrite an existing file

Trade-off
  An ejected file is yours forever: later improvements to it in vitakit will
  not reach you. Everything that can carry a bug — validation, rendering,
  sorting, escaping — stays in the package, so this is usually the right
  trade, but eject deliberately rather than by default.

Before ejecting a component, check whether CSS is enough: the classes
(vita-entry, vita-entry__date, …) are styled in app/assets/css/main.css.`,
}

const [command, ...rest] = process.argv.slice(2)
const wantsHelp = rest.includes('--help') || rest.includes('-h')
const root = process.cwd()
const pascal = name => name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('')

try {
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE)
    process.exit(command ? 0 : 1)
  }

  if (!HELP[command]) {
    throw new Error(`unknown command "${command}".\n\n${USAGE}`)
  }

  if (wantsHelp) {
    console.log(HELP[command])
    process.exit(0)
  }

  if (command === 'add') {
    const name = rest.find(argument => !argument.startsWith('-'))
    if (!name) throw new Error(`missing name.\n\n${HELP.add}`)
    const written = await addSection(name, root, { component: !rest.includes('--no-component') })
    for (const file of written) console.log(`  ${file.path.padEnd(34)} ${file.note}`)
    const component = rest.includes('--no-component') ? `VitaSection id="${name}"` : `${pascal(name)}Section`
    console.log(`\nShow it with <${component} /> on a page,`)
    console.log(`or add \\vitasection{${name}} to cv-tex/cv.tex for the PDF.`)
  } else if (command === 'list') {
    const items = await listEjectable()
    const width = Math.max(...items.map(item => item.name.length))
    for (const item of items) {
      console.log(`${item.name.padEnd(width)}  ${item.kind.padEnd(9)}  -> ${item.target}`)
    }
    console.log('\nCopy one with `pnpm vitakit eject <name>`; see --help for what each kind does.')
  } else if (command === 'eject') {
    const name = rest.find(argument => !argument.startsWith('-'))
    if (!name) throw new Error(`missing name. Run \`pnpm vitakit list\` to see the options.`)
    const { item, path } = await eject(name, root, { force: rest.includes('--force') })
    console.log(`vitakit: wrote ${relative(root, path)}`)
    const hints = {
      publications: '  Edit it to change the publication groups, badges or fields; the website,\n'
        + '  vitakit-check and the PDF all read it from now on.',
      schema: '  Edit it to change what this section may contain; it now defines the section.',
      style: '  Edit it, or replace it with any CSL style (e.g. from zotero.org/styles);\n'
        + '  it formats content/publications.bib on the website from now on.',
    }
    const hint = item.kind === 'schema' && item.name === 'publications' ? hints.publications : hints[item.kind]
    console.log(hint ?? '  It takes precedence over the package copy from now on.')
  }
} catch (error) {
  console.error(`\nvitakit: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}

# @anja.codes/vitakit

Structured CV data in, academic website and LaTeX CV out.

```bash
pnpm create @anja.codes/vitakit my-site
cd my-site && pnpm install
pnpm dev            # the website
pnpm build:cv       # cv-tex/cv.pdf, from the same data
```

To add it to an existing Nuxt project instead:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@anja.codes/vitakit/nuxt'],
})
```

## Documentation

[Getting started](./docs/getting-started.md) ·
[Content reference](./docs/content-reference.md) ·
[Commands](./docs/cli.md) ·
[Customising](./docs/customising.md) ·
[CV documents](./docs/cv-documents.md) ·
[Privacy](./docs/privacy.md) ·
[Troubleshooting](./docs/troubleshooting.md)

## What it does

`content/` is compiled at build time into a typed module. Markdown and TeX are
rendered with remark and KaTeX, BibTeX with citation-js, and every file is
validated with Zod. Nothing content-related reaches the browser: no Markdown
parser, no content database, no KaTeX runtime.

```
content/
  profile.yml           name, affiliation, links, navigation, footer
  <section>.yml         education, employment, teaching, talks, …
  publications.bib      grouped, linked reference list
  publications.csl      optional: its citation style on the website
  pages/*.md            prose pages, math and images included
schemas/<section>.ts    optional: change a built-in schema, or add your own
schemas/publications.ts optional: publication groups, badges, fields
```

## Composables

| | |
|---|---|
| `useSection(id)` | validated, sorted, visibility-filtered entries |
| `usePublications()` | reference groups; each entry has its formatted `html` and its `badges` as data |
| `usePage(route)`, `usePages()` | compiled Markdown pages |
| `useProfile()` | everything in `profile.yml`, including `nav` |
| `useVitakit()` | everything, including `issues` |

## Components

`VitaSection`, `VitaEntry`, `VitaDate`, `VitaLinks`, `VitaPublications`,
`VitaPublication`, `VitaMarkdown`, `VitaIssues`. All are thin: they take props and emit markup, so
ejecting one into your own repo leaves nothing behind that can silently break.

## Sections

A file `content/<name>.yml` is a section. Its schema is found by convention:
`schemas/<name>.ts` in your repo wins, otherwise the built-in schema for
`<name>` is used, otherwise the build fails with a starter snippet.

```ts
// schemas/outreach.ts
import { section, dateRange, richText, institution } from '@anja.codes/vitakit'

export default section({
  date: dateRange,
  title: richText,          // Markdown and $math$ allowed
  venue: institution.optional(),
})
```

Every entry gets `visibility: public | cv | private`. The website loader is
hard-wired to `public`, so a phone number, an address or a referee marked `cv`
cannot reach the site; the other levels exist for the LaTeX side. Assume the
repository itself is private, and let `vitakit-check` verify the build output.

PDFs are never part of the website build: `build:cv` writes to `cv-tex/`, and
the website renders CV information directly from the same data.

## Strict builds, forgiving development

A broken file fails `nuxt generate`, naming the file, the entry and the field.
The same problem during `nuxt dev` is reported instead of thrown: the page shows
its error, `VitaIssues` lists all of them, and saving a fix recovers in place —
a typo never takes down the dev server.

## Status

Early but complete in both halves: website and PDF are produced from the same
content, with strict builds, forgiving development, output assertions and a
scaffolder whose output is regenerated and tested in CI.

Not yet implemented: cover-letter helpers (`\vitacount`, `\vitafirst`), a
`schema` command to draft a schema from existing YAML, a second theme, and a
Typst target.

MIT

## LaTeX CV

```bash
pnpm build:cv          # every document in cv-tex/
pnpm build:cv cv       # one document
pnpm build:cv --no-pdf # only generate .tex
```

A **document** is a `.tex` file you own. vitakit renders `content/` into
`cv-tex/generated/<document>/`, one file per section, and `latexmk` typesets it.
No `-shell-escape`, no Python.

```tex
\documentclass{vitakit-cv}
\vitadocument{cv}
\addbibresource{../content/publications.bib}
\input{preamble.tex}
\vitainput{profile}

\begin{document}
\vitaheader
\vitasection{employment}     % order lives here: move a line, move a section
\vitasection{education}
\section{Publications}\vitainput{publications}
\end{document}
```

An optional `cv-tex/<name>.yml` decides *what* goes in:

```yaml
visibility: cv        # include public and cv entries, not private
sections:
  talks:
    where: { kind: invited }
    limit: 10
```

Copy `cv.tex` to make a variant; a document is just a file. Generated files use
only the macros in `vitakit-cv.cls` (`\vitaentry`, `\vitanote`, `\vitasection`),
so redefining those in `preamble.tex` restyles everything. Any template can be
overridden by putting a file of the same name in `cv-tex/templates/`.

## Starting a project

```bash
pnpm create @anja.codes/vitakit my-site
```

See [`@anja.codes/create-vitakit`](./create). The scaffolded output is kept in
[`examples/scaffolded`](./examples/scaffolded), regenerated by
`pnpm example` and verified in CI, so it cannot drift from the package.

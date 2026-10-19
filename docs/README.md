# vitakit documentation

| | |
|---|---|
| [Getting started](./getting-started.md) | scaffold a project, edit it, build both outputs, deploy |
| [Content reference](./content-reference.md) | every file and every field |
| [Commands](./cli.md) | the scripts and the `vitakit` command: status, adding and customizing sections, PDFs, checks |
| [Customising](./customising.md) | design, page structure, your own sections, ejecting |
| [CV documents](./cv-documents.md) | the PDF: variants, ordering, cover letters, styling |
| [Privacy](./privacy.md) | what reaches the web, and what cannot |
| [Troubleshooting](./troubleshooting.md) | error messages and what they mean |

## In one paragraph

`content/` holds your CV as YAML, Markdown and BibTeX. It is validated, rendered at
build time (Markdown, KaTeX, citation-js) and compiled into a typed module, from which
a Nuxt site and a LaTeX CV are composed independently. The website ships as static
HTML with no content runtime; the PDF is produced by `latexmk` from generated `.tex`
files. Broken content fails a build and is reported without killing the dev server.

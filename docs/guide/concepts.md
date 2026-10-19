# Concepts

vitakit makes two things from one set of files: an academic **website** and a
typeset **CV**. A handful of ideas explain how.

## Your project

```
content/              what is about you: entries, prose, publications
schemas/              what your own sections may contain (often none)
app/                  the website: pages, layout, design
cv-tex/               the PDF: documents, styling, templates
```

It is an ordinary repository you own. vitakit is a package it depends on, plus
the `vitakit` command. Nothing is generated into your files except where a
command shows you the change first.

## Sections

A **section** is one list in your CV — education, employment, talks, grants —
and one file: `content/talks.yml`. Each item in the file is an **entry**:

```yaml
- date: 2025-03-14
  title: The shape of large random $k$-ary trees
  event: AofA 2025
  kind: invited
```

Entries are sorted newest first. Five sections are built in (education,
employment, teaching, talks, supervision); any other is yours to add.

## Schemas

A **schema** says what a section's entries may contain: which fields, of which
types, which ones every entry needs. Every file is checked against its schema,
so a typo is an error that names the file, the entry and the field, rather
than a line that silently disappears.

Built-in sections have theirs; a section of your own has `schemas/<name>.ts`,
usually drafted from your entries by `vitakit add section`. A schema decides
what is *accepted* — not what is *shown*.

## Two outputs, composed separately

The **website** is made of **pages**. A page is Markdown in `content/pages/`
for its text and, if it shows sections, a Vue file in `app/pages/` that says
which, in which order, with which headings:

```vue
<VitaSection id="talks" title="Talks" />
```

The **PDF** is made of **documents**. A document is a LaTeX file in `cv-tex/`
that says the same for the PDF, and an optional `.yml` that selects entries:

```tex
\vitasection[Selected talks]{talks}
```

The data is shared; the composition is not. A section can be on the website and
not in the PDF, on two pages, or in three documents with different selections.
Leaving a section out somewhere is a choice, not an error.

## Visibility

Every entry may say who sees it: `public` (the default) everywhere, `cv` only in
the PDF, `private` only in documents that ask for it — an application with
referees, say. The website build only ever reads public entries, and `pnpm
check` verifies that nothing else reached it. See [privacy](./privacy.md).

## What decides what

| You want to change | In |
|---|---|
| your entries, prose, publications | `content/` |
| what entries of a section may contain | `schemas/<section>.ts` |
| which sections a page shows, in which order | `app/pages/<page>.vue` |
| how entries look on the website | CSS, or a component of your own |
| which sections a PDF includes, in which order | `cv-tex/<document>.tex` |
| which entries a PDF includes | `cv-tex/<document>.yml` |
| how entries look in the PDF | `cv-tex/preamble.tex`, or a template of your own |

`vitakit status` shows the whole picture for your project;
`vitakit explain <section>` follows one section through all of it. The
[tutorial](./tutorial/index.md) builds a site step by step.

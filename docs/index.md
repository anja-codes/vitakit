---
layout: home

hero:
  name: vitakit
  text: Your academic website and CV, from one set of files.
  tagline: Write your CV once, as plain data. vitakit makes a website from it, and a typeset LaTeX CV — kept in sync, checked, and yours to change.
  image:
    light: /logo/logo_black.svg
    dark: /logo/logo.svg
    alt: vitakit
  actions:
    - theme: brand
      text: Start the tutorial
      link: /guide/tutorial/
    - theme: alt
      text: Concepts
      link: /guide/concepts
    - theme: alt
      text: How do I …?
      link: /guide/how-do-i

features:
  - title: One source, two outputs
    details: Employment, talks, teaching and publications as YAML and BibTeX. A static website and a LaTeX CV are composed from them independently — a correction is in both at the next build.
  - title: Checked, not guessed
    details: Every file is validated. A typo is an error naming the file, the entry and the field, not a line quietly missing from your CV; the development server keeps running while you fix it.
  - title: Private stays private
    details: Mark an address, referees or a full talk list as CV-only. The website never reads them, and every build verifies that none of them reached it.
  - title: A command that explains and edits
    details: "vitakit status shows what is where; add and customize set up sections, fields and pages — showing every change before making it, and never reformatting your files."
---

## Quick start

::: code-group

```bash [pnpm]
pnpm create @anja.codes/vitakit my-site
cd my-site
pnpm install
pnpm dev            # the website, at http://localhost:3000
pnpm pdf            # cv-tex/cv.pdf, from the same data
```

```bash [npm]
npm create @anja.codes/vitakit my-site
cd my-site
npm install
npm run dev         # the website, at http://localhost:3000
npm run pdf         # cv-tex/cv.pdf, from the same data
```

:::

You need Node.js 22.18 or newer; for the PDF, a TeX distribution with `latexmk`.
No web development experience is needed.

## These docs

| | |
|---|---|
| [**Guide**](/guide/tutorial/) | the [tutorial](/guide/tutorial/), from an empty directory to a published site; [concepts](/guide/concepts); [how do I …?](/guide/how-do-i); [publishing](/guide/publishing), [privacy](/guide/privacy), [troubleshooting](/guide/troubleshooting) |
| [**CLI**](/cli/) | the `vitakit` command: status, adding sections, fields and pages, customizing, building |
| [**Content**](/content/) | what goes into `content/`: field types, built-in sections, publications, schemas |
| [**Website**](/website/) | pages, placing sections, customising entries, styling, components |
| [**PDF**](/pdf/) | documents and selection, variants and prose, templates, styling, building |

## How it works

`content/` holds your CV as YAML, Markdown and BibTeX. It is validated,
rendered at build time — Markdown, mathematics with KaTeX, citations with
citation-js — and compiled into data, from which a Nuxt site and a LaTeX CV are
composed. The website ships as static HTML, with no content runtime in the
browser; the PDF is typeset by `latexmk` from generated `.tex` files. Both are
ordinary files in a repository you own.

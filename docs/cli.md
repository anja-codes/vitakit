# Commands

Two kinds of commands. **Scripts** in your project's `package.json` run the
website and the PDF build:

| Script | Does |
|---|---|
| `dev` | the development server |
| `pdf` | render `content/` into `cv-tex/` and run `latexmk` |
| `check` | typecheck, generate the site, verify the output — what CI runs |

**`vitakit`** answers questions about your project and helps change it:

| Command | Does |
|---|---|
| `vitakit status` | what is in this project, what is broken, where sections appear |
| `vitakit explain <name>` | where a section, PDF document or page comes from, and where it goes |
| `vitakit validate` | check everything a build would check, without building |
| `vitakit add section <name>` | a section: its file, a schema drafted from your entries, its place on a page and in a PDF |
| `vitakit add field <section> <name>` | one more field a section accepts |
| `vitakit add page <name>` | a website page that can show sections, in the menu |
| `vitakit customize <section>` | make one section yours: what its entries may contain |
| `vitakit pdf` | build the PDF documents (what the `pdf` script runs) |
| `vitakit verify` | check the generated website (the last step of `check`) |
| `vitakit eject <file>` | take over a shared vitakit file (advanced) |

> [!TIP]
> With pnpm: `pnpm dev`, `pnpm pdf`, `pnpm vitakit status`. With npm, scripts
> run with `npm run`, and arguments go after `--`: `npm run pdf -- --tex-only`;
> `vitakit` runs with `npx vitakit status`. The examples have a tab for each,
> and every command's `--help` uses the form your project needs.

Every command has `--help`, works from any directory inside your project (or
with `--root <dir>`), and never changes a file without showing you what it will
write and asking first. Mistakes in how a command was called exit with 2,
problems in the project with 1.

---

## `vitakit status`

::: code-group

```bash [pnpm]
pnpm vitakit status
```

```bash [npm]
npx vitakit status
```

:::

```
Sections                                    website   pdf
  education     3 entries                   /cv/      cv
  employment    3 entries: 2 public, 1 cv   /cv/      cv
? grants        no schema yet               –         –
  talks         3 entries                   /cv/ /    cv
✖ teaching      3 entries, has problems     /cv/      cv

Publications   content/publications.bib · 31 entries in 3 groups
Pages          /  /cv/  /publications/  /research/   (all in the menu)
PDF            cv-tex/cv.tex → cv.pdf (older than its sources)

Problems
  ✖ content/grants.yml: no schema for this file; create schemas/grants.ts, for example
  ✖ content/teaching.yml: entry 2, hours: Invalid input: expected number, received string
```

For each section: how many entries, on which website pages it appears, and in
which PDF documents. **A section that appears nowhere is not a problem** — it
may be meant for one application only, or not yet ready — and is shown as `–`.
Problems are only what would make a build fail.

Where a section appears is read from your files: `<VitaSection id="talks">`
and your own components with a literal `id`, `useSection('talks')`, and
`\vitasection{talks}` lines. A page that chooses sections in code
(`:id="section.id"`) cannot be read that way; such pages are listed, and their
sections shown as `unknown` rather than absent.

Entry contents are never printed, only counts. `--json` prints the same as one
JSON object.

## `vitakit explain <name>`

::: code-group

```bash [pnpm]
pnpm vitakit explain talks     # a section
pnpm vitakit explain cv        # a PDF document
pnpm vitakit explain /cv/      # a website page
```

```bash [npm]
npx vitakit explain talks     # a section
npx vitakit explain cv        # a PDF document
npx vitakit explain /cv/      # a website page
```

:::

```
talks

  data      content/talks.yml · 12 entries
  schema    built-in
              date       date, required
              title      formatted text, required
              kind       one of invited, contributed, seminar, poster, outreach, optional
              …

  website   /cv/   app/pages/cv.vue:32      <VitaSection title="Talks">
            /      app/pages/index.vue:10   useSection, in code

  pdf       cv   cv-tex/cv.tex:37  \vitasection[Selected talks]{talks}
                 template: vitakit's talks.eta
                 4 of 12 entries (where kind: invited −8)
```

For a section: its file, the fields its schema accepts, every place it appears,
and for each PDF document the template used and which entries are selected —
with the setting that removed the others. That is the answer to *"why is this
talk not in my PDF?"*. For a document: what it includes, in order, with counts.
For a page: the files behind the route and the sections on it.

## `vitakit validate`

::: code-group

```bash [pnpm]
pnpm vitakit validate          # everything
pnpm vitakit validate talks    # what concerns one section
```

```bash [npm]
npx vitakit validate          # everything
npx vitakit validate talks    # what concerns one section
```

:::

Checks everything a build would, without building and without LaTeX, and
reports all problems at once:

- every file in `content/` against its schema, the profile, page settings
- sections that pages or PDF documents include but that do not exist
- `where` on pages and in `cv-tex/<document>.yml` against the section's fields
- PDF templates: every included section is rendered in memory, so a template
  error shows up here rather than in the middle of a LaTeX run
- templates in `cv-tex/templates/` that no section uses (`talk.eta` for `talks`)

It exits with 1 if anything is wrong. It is not a replacement for `check`,
which builds the website and checks what was built.

## `vitakit add section <name>`

::: code-group

```bash [pnpm]
pnpm vitakit add section grants
```

```bash [npm]
npx vitakit add section grants
```

:::

A section is a file `content/<name>.yml`. `add section` creates whatever is
missing, and asks where the section should appear:

```
Show grants on which page of your website?
  1  /  (app/pages/index.vue)
  2  /cv/  (app/pages/cv.vue)   (Enter)
  3  /publications/  (app/pages/publications.vue)
  4  a new page, /grants/
  5  not on the website, for now
```

then shows everything it is about to do, and asks before writing:

```
= content/grants.yml   2 entries
+ schemas/grants.ts   drafted from the 2 entries in content/grants.yml; check its comments
    import { dateRange, linked, richText, section, text, z } from '@anja.codes/vitakit'

    export default section({
      date: dateRange,
      // Markdown and $math$ allowed
      title: richText,
      // a name, or { name, url }
      funder: linked,
      amount: z.number(),
      role: text,
    })
~ app/pages/cv.vue   shows grants after education
        <VitaSection id="education" title="Education" />
  +     <VitaSection id="grants" title="Grants" />
~ cv-tex/cv.tex   includes grants after education
    \vitasection[Education]{education}
  + \vitasection[Grants]{grants}

Write these changes? [Y/n]
```

**Write your entries first**, and the schema is drafted from them: every value
of every entry is looked at, nothing is restricted on a guess, and what could
reasonably be different is said in a comment above the field — a set of values
that could be a fixed list, a date written in a form vitakit does not read, a
field name that needs quotes. If an entry does not fit the draft (an empty
value, a number in one entry and text in another), you are told which entry
and what to change. Without a file, you get one example entry and a schema with
date, title and note.

A **built-in** section (education, employment, teaching, talks, supervision)
needs no schema; for it, `add section` only creates the file, empty, with an
example entry as a comment. A section whose entries fit another section's
schema can share it: `--like talks`.

Where it appears is one line in each place, after the section you choose —
`<VitaSection id="grants" title="Grants" />` in a page, `\vitasection[Grants]{grants}`
in a PDF document — exactly what you would have written. Running it again only
adds what is missing.

| Option | |
|---|---|
| `--page <route>` | show it on this page, e.g. `/cv/`; a route like `/grants/` that does not exist yet becomes a new page |
| `--document <name>` | include it in this PDF document, e.g. `cv` |
| `--after <section>` | place it after this section, on the page and in the document |
| `--title <text>` | its heading |
| `--like <section>` | use that section's schema |

## `vitakit add field <section> <name>`

::: code-group

```bash [pnpm]
pnpm vitakit add field teaching evaluation --type number
```

```bash [npm]
npx vitakit add field teaching evaluation --type number
```

:::

Lets a section accept one more field. Without `--type`, it asks:

| Type | In YAML |
|---|---|
| `text` | `Analysis 1` |
| `formatted-text` | Markdown and `$math$` |
| `number` | `4.6` |
| `yes-no` | `true` |
| `date` | `2024`, `2024-03`, `{ from: 2019, to: present }` |
| `web-address` | `https://…`, `/slides/talk.pdf` |
| `link` | `University of Graz`, or `{ name: University of Graz, url: https://… }` |
| `choice` | one of the values given with `--choice`, once per value |

`--several` allows a list of them, `--required` makes every entry need it.

For a built-in section, the first field creates `schemas/<section>.ts`, which
keeps all of vitakit's fields and adds yours; later fields are added to that
file, without touching anything else in it. In a schema the command cannot
change safely — one you have rewritten in your own way — it shows the line to
paste instead.

**A field that is accepted is not shown yet.** Showing it on the website or in
the PDF is the next step.

## `vitakit add page <name>`

::: code-group

```bash [pnpm]
pnpm vitakit add page talks --title Talks
```

```bash [npm]
npx vitakit add page talks --title Talks
```

:::

A page at `/talks/` that can show sections: `content/pages/talks.md` for its
title and text, `app/pages/talks.vue` for its sections, and an entry in the menu
in `content/profile.yml` (`--no-menu` leaves the menu alone). A page that is
only text needs no command: it is one Markdown file in `content/pages/`.

## `vitakit customize <section> --schema`

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching --schema          # add fields to a built-in section
pnpm vitakit customize teaching --schema --copy   # take over its whole definition
pnpm vitakit customize publications               # groups, badges and fields
```

```bash [npm]
npx vitakit customize teaching --schema          # add fields to a built-in section
npx vitakit customize teaching --schema --copy   # take over its whole definition
npx vitakit customize publications               # groups, badges and fields
```

:::

Without `--copy`, `schemas/<section>.ts` keeps vitakit's fields — which keep
improving — and adds yours. With `--copy` it is vitakit's complete definition,
to change or remove any rule; later improvements to it will not reach you. An
existing schema is never replaced.

## `pdf`

::: code-group

```bash [pnpm]
pnpm pdf                  # every document in cv-tex/
pnpm pdf cv               # one
pnpm pdf --tex-only       # generate .tex only, no TeX installation needed
```

```bash [npm]
npm run pdf                     # every document in cv-tex/
npm run pdf -- cv               # one
npm run pdf -- --tex-only       # generate .tex only, no TeX installation needed
```

:::

Renders `content/` into `cv-tex/generated/<document>/` and runs `latexmk`. The
PDF is written next to its source; auxiliary files stay in the generated
directory, which vitakit owns — do not edit anything there. LaTeX's output is
only shown when something fails (then its end, and where the full log is), or
with `--verbose`.

Needs `latexmk` and `biber`. See [CV documents](./cv-documents.md).

## `check` and `vitakit verify`

`check` runs `nuxt typecheck` → `nuxt generate` → `vitakit verify`, which
asserts on the built HTML rather than on your content:

```
  ok  4 page(s) generated
  ok  mathematics rendered on 4 page(s)
  ok  base path /
  ok  1 of 1 non-public entr(ies) absent from the site
  ok  assets and links use /
  ok  links into the site lead somewhere
  ok  bibliography on 1 page(s)
```

Two are worth knowing about: **nothing marked `visibility: cv` or `private` may
appear in the site**, and every asset and link — `href`, `src`, `srcset`,
`poster`, … — must use the deployment base path, a check that only bites when
the site is served from a subdirectory, which is exactly when it is hard to
notice by hand. Every such link must also lead somewhere: a Markdown link
`[Slides](/slides/talk.pdf)` fails the check until `public/slides/talk.pdf` exists.
The check inspects links emitted into HTML, not URL fields that a renderer omits.

The checks assume nothing about *what* your site contains: which pages exist
comes from `content/pages/`, and a bibliography is only checked where it is
shown — a `publications.bib` used only by the PDF is fine.

`--out <dir>` points at a different build directory. `--no-leak-check` skips
the privacy check, whose comparison of titles can mistake a title that is
legitimately public elsewhere for a leak. The scaffolded workflows run `check`
before deploying, so a problem fails CI rather than the site.

## `vitakit eject <file>`

::: code-group

```bash [pnpm]
pnpm vitakit eject --list                # what can be taken over
pnpm vitakit eject VitaPublication       # how one reference looks on the website
pnpm vitakit eject publications.csl      # the website's citation style
pnpm vitakit eject vitakit-cv.cls        # the LaTeX class of every PDF
```

```bash [npm]
npx vitakit eject --list                # what can be taken over
npx vitakit eject VitaPublication       # how one reference looks on the website
npx vitakit eject publications.csl      # the website's citation style
npx vitakit eject vitakit-cv.cls        # the LaTeX class of every PDF
```

:::

Copies a file that vitakit shares between all sections or all documents into
your project, where it wins from then on. **An ejected file is yours forever**:
later improvements to it in vitakit will not reach you. Everything that can
carry a bug — validation, rendering, sorting, escaping — stays in the package,
so eject deliberately. Before ejecting a component, check whether CSS is
enough: the classes are styled in `app/assets/css/main.css`
([customising](./customising.md#layer-2--colours-fonts-spacing)).

An existing copy is never replaced, unless you pass `--force`; yours is then
kept next to it as a `.backup`.

## Previewing and confirming changes

Every command that writes files shows first what it will create or change, then
asks. `--dry-run` only shows; `--yes` skips the question. Without a terminal —
in a script or CI — nothing is asked and nothing is written unless `--yes` is
given.

## From vitakit 0.1

| 0.1 | now |
|---|---|
| `build:cv` script, `vitakit-build-cv` | `pdf` script, `vitakit pdf` |
| `--no-pdf` | `--tex-only` |
| `check:static` script, `vitakit-check` | `vitakit verify` |
| `vitakit list` | `vitakit eject --list` |
| `vitakit add <name>` | `vitakit add section <name>` |
| `vitakit eject <section>` (a schema) | `vitakit customize <section> --schema --copy` |
| `vitakit eject publications` | `vitakit customize publications` |

In an existing project, change the scripts in `package.json` to
`"pdf": "vitakit pdf"` and
`"check": "pnpm typecheck && pnpm generate && vitakit verify"` (with npm:
`npm run typecheck && npm run generate && vitakit verify`).

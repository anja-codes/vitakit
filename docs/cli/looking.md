# status, explain, validate

Three commands that only read: they never change a file, and need no website
build and no LaTeX.

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
pnpm vitakit explain talks          # a section
pnpm vitakit explain cv             # a PDF document
pnpm vitakit explain /cv/           # a website page
pnpm vitakit explain recent         # a publication list
pnpm vitakit explain publications   # all publication lists
```

```bash [npm]
npx vitakit explain talks          # a section
npx vitakit explain cv             # a PDF document
npx vitakit explain /cv/           # a website page
npx vitakit explain recent         # a publication list
npx vitakit explain publications   # all publication lists
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

`--field <name>` adds the lines that show a field — for the component and
template the section uses, or for a `VitaSection` slot and vitakit's template.

For a section: its file, the fields its schema accepts, every place it appears,
and for each PDF document the template used and which entries are selected —
with the setting that removed the others. That is the answer to *"why is this
talk not in my PDF?"*. For a document: what it includes, in order, with counts.
For a page: the files behind the route and the sections and publication lists on
it. For `publications`: each [list](../content/publications.md#lists), what it
shows in words (`newest first · at most 3`), how many entries, and where. For one
list, by its name: which setting left out how many publications, and the citation
keys of those it shows.

A name is enough while it is unique. To say what it is, put its kind first, as
`add` does — `section`, `document`, `publication-list` or `page`:

::: code-group

```bash [pnpm]
pnpm vitakit explain section talks
pnpm vitakit explain publication-list talks
pnpm vitakit explain page cv          # the same as /cv/
```

```bash [npm]
npx vitakit explain section talks
npx vitakit explain publication-list talks
npx vitakit explain page cv          # the same as /cv/
```

:::

When a section, a PDF document and a publication list share a name, `explain`
with the name alone lists these commands for each of them, to choose from. In
scripts, the kind makes the command mean the same however the project grows.

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

It exits with 1 if anything is wrong, so it can gate a CI job. It is not a
replacement for [`check`](./building.md#check-and-vitakit-verify), which builds
the website and checks what was built.

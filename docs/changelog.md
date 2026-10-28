# Changelog

What changed in each release of `@anja.codes/vitakit` and
`@anja.codes/create-vitakit`, which are always released together with the
same version. To update a project, see [Updating vitakit](./cli/migrating.md):
`vitakit migrate` makes most of the changes a new version needs. The same
notes are on [GitHub](https://github.com/anja-codes/vitakit/releases).

## 0.4.0 — 2026-10-28

### Typed entries

A section's entries are typed by its schema on the website: in
`useSection('talks')`, in the slots of `<VitaSection id="talks">`, and in
components that `vitakit customize --web` writes. Formatted text is
`{ text, html }`, a link `{ label, url? }`, a group its own fields, so
`entry.thesis.supervisor.url` needs neither checks nor casts, and a typo such as
`entry.titel` is an error in the editor and in `pnpm check`. See
[types](./website/entries.md#types).

- `vitakit customize --web` writes components typed for their section:
  `id: 'teaching'`, with `entries` for teaching entries a page selected itself.
  `--use` adds the section to the component's `id`
  (`id: 'talks' | 'talks-public'`). A group of fields gets one line per part
  instead of a comment.
- `vitakit migrate` types the components `customize` wrote for 0.3, for the
  sections they are shown with; casts of your own keep working, and it says
  where they are no longer needed.
- `extendSection` keeps the types of the section it extends; before, every
  field of an extended schema was `unknown`.
- New types: `SectionEntry<typeof schema>`, `SectionEntries<'talks'>`.

**What may need changing:** code that reads a field the schema does not have
now fails `pnpm check`, where it showed nothing before. That is the point; the
error names the field.

### Updating from 0.3

```bash
pnpm add @anja.codes/vitakit@latest
pnpm vitakit migrate --dry-run   # see what would change
pnpm vitakit migrate             # make the changes
pnpm check
```

Step by step: [Updating vitakit](./cli/migrating.md#from-vitakit-03).

### Fixes

- `vitakit migrate` points out a stylesheet that styles the groups of a
  publication list but not its title (`.vita-publications__title`, new in 0.3),
  with the rules to add. It does not change the stylesheet.
- `vitakit verify` compares the names of files and pages exactly, including
  their case. On macOS and Windows, a link to `/img/photo.jpg` passed when the
  file was `public/img/Photo.jpg`, and then led nowhere on a case-sensitive web
  server or in CI on Linux. Such a link now fails, naming the file as it is.
- Docs: [those rules](./cli/migrating.md#from-vitakit-02) for projects updated
  from 0.2, the class in the [website's styling](./website/styling.md), and
  [the size of a list's group headings](./pdf/styling.md#publication-lists) in
  the PDF.

## 0.3.0 — 2026-10-27

### Publication lists

Which publications are shown, in what order and in which groups is now
declared once per list in `content/publication-lists.yml`. A page or a PDF
only says where a list goes and under which heading, so the same list shows
the same publications on the website and in the PDF:

```yaml
# content/publication-lists.yml
recent:
  limit: 3
```

```vue
<VitaPublications list="recent" title="Recent publications" />
```

```latex
\vitapublications[Recent publications]{recent}
```

- **Select** with `where` (any BibTeX field; `keywords` matches one of an
  entry's keywords), `keys` (exactly these, in this order), `since`/`until`
  and `limit`.
- **Sort** by date (default), year, title, source or any field.
- **Group** by status, year or any field; entries without it go under
  `otherLabel` ("Other").
- `vitakit status`, `vitakit explain publications` and
  `vitakit explain publication-list <name>` say what each list selects, what
  each setting removed, the citation keys left, and where it is shown. A
  misspelt status, field or citation key is an error naming the list.
- New projects declare `all` (grouped by status, on `/publications/` and in
  the PDF) and `recent` (the three newest, on the home page).

See [Publications and lists](./content/publications.md#lists).

### New commands

| | |
|---|---|
| `vitakit add publication-list <name>` | declares a list and shows it on a page or in a PDF, asking what it should select if no options are given; checked against `publications.bib` before anything is written |
| `vitakit migrate` | updates a project written for an earlier vitakit, showing every change and asking before writing; `--dry-run` only shows; safe to run again |

### Updating from 0.2

```bash
pnpm add @anja.codes/vitakit@latest
pnpm vitakit migrate --dry-run   # see what would change
pnpm vitakit migrate             # make the changes
pnpm vitakit validate
```

Step by step, with what may look different afterwards:
[Updating vitakit](./cli/migrating.md).

### Breaking changes

`vitakit migrate` converts all of these, except where noted:

- **`<VitaPublications>`** takes `list` and `title` only. `groups`,
  `headings`, `where`, `limit`, … on the page fail the build; declare a list
  instead.
- **`\vitainput{publications}`** is replaced by
  `\vitapublications[Heading]{list}`, and **`publications.groups`** in a
  document's `.yml` by a list.
- **`schemas/publications.ts`:** `groups`/`defaultGroup` are now
  `statuses`/`defaultStatus`.
- **`usePublications()`** is replaced by `usePublicationList('<list>')`.
  `migrate` points to each use, but you change it by hand.
- **Copies of `VitaPublications.vue` or `publications.eta`** made with
  `vitakit eject`/`customize` need updating by hand; `migrate` lists them.
- **PDF order:** publications in a PDF now follow the list's order, as on the
  website: newest first, then the order in `publications.bib`. Before, biblatex
  sorted them by year and then author. Each group is numbered from 1.
- **`vitakit explain`** takes the kind first when a name is shared, as `add`
  does: `explain section talks`, `explain document cv`,
  `explain publication-list recent`, `explain page cv`. `--section` and
  `--document` are gone. A name alone still works while it is unique.

### Fixes

- A syntax error in a project's TypeScript file (e.g. `schemas/*.ts`) names
  the line, shows the code with a caret, and hints at a missing comma.
- A `schemas/publications.ts` that does not load is reported as such, without
  follow-up errors about statuses.
- The diff of a planned edit shows each change with its own context, instead
  of one block from the first changed line to the last.
- Help text that starts with an example keeps its indentation.
- `create-vitakit`: the SSH/rsync deployment preset uses GitHub Actions
  (`.github/workflows/rsync.yml`) instead of Forgejo Actions.

### Docs

Publications have their own place throughout: a feature on the home page, a
section in the concepts, a "Publications and lists" page, and tutorial
chapter 4 rewritten around lists. "Updating vitakit" walks through updating.
The tutorial's customization chapter and the explanations of schemas and file
paths were made easier to read ([#16](https://github.com/anja-codes/vitakit/pull/16)).

## 0.2.0 — 2026-10-19

### The `vitakit` command

One command answers questions about a project and makes the common changes,
showing every change before it is made:

| | |
|---|---|
| `vitakit status` | every section, where it appears on the website and in the PDF, what is wrong |
| `vitakit explain <section\|document\|/route/>` | where it comes from and where it goes; `--field` prints lines that show a field |
| `vitakit validate` | everything a build checks, without building or LaTeX |
| `vitakit add section <name>` | the file, a schema drafted from its entries, one line on a page and in a PDF |
| `vitakit add field <section> <name>` | one more field a section accepts |
| `vitakit add page <name>` | a page that can show sections, in the menu |
| `vitakit customize <section>` | a component, a PDF template or a schema of your own |
| `vitakit pdf` | build the PDFs (concise output; TeX's own error on failure) |
| `vitakit verify` | check the generated website |
| `vitakit eject <file>` | take over a shared component, the citation style or the LaTeX class |

### Breaking changes

- **Scripts.** `build:cv` is now `pdf`, `check:static` is gone. In an existing
  project's `package.json`:
  ```json
  "pdf": "vitakit pdf",
  "check": "pnpm typecheck && pnpm generate && vitakit verify"
  ```
  (npm: `npm run typecheck && npm run generate && vitakit verify`.)
- **Binaries.** `vitakit-build-cv` and `vitakit-check` are removed; use
  `vitakit pdf` and `vitakit verify`. `--no-pdf` is `--tex-only`.
- **Commands.** `vitakit add <name>` is `vitakit add section <name>`;
  `vitakit list` is `vitakit eject --list`; ejecting a schema is
  `vitakit customize <section> --schema --copy` (publications:
  `vitakit customize publications`); ejecting a template is
  `vitakit customize <section> --pdf`.
- **`linked` replaces `institution` and `link`.** Every "name that may link"
  is `{ label, url? }`. YAML may still write `{ name, url }`; code reading
  `.name` (e.g. `profile.affiliation.name` in a page) must read `.label`.
  Schemas importing `institution` or `link` import `linked` (and
  `requiredLink` for links that need a URL). The context-line part kind is
  `'linked'`, `INSTITUTION_FIELDS` is `LINKED_FIELDS`.

### New

- `VitaSection` takes `where` (like `where` in a PDF document's `.yml`) and
  `title` (heading and anchor, hidden without entries). The scaffold's
  `cv.vue` is one `<VitaSection id title />` line per section, and `cv.tex`
  writes headings inline, `\vitasection[Heading]{id}`.
- `where` values may be numbers; an entry's own `year` field wins over the
  year of its date.
- One broken schema no longer hides the other sections during development.
- The LaTeX class uses T1 font encoding under pdfLaTeX, so „, ł, ő and similar
  characters typeset.
- Shared helper `asLinkedList` for templates.

To update a 0.1 project, see [From vitakit 0.1](./cli/migrating.md#from-vitakit-01).

## 0.1.0 — 2026-10-04

The first release.

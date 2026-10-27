# Publications

Your publications are one BibTeX file, exported from your reference manager.
What the website and the PDF show of it is decided by **lists**: "the three
newest", "all of them, grouped by status", "my selected papers". You declare a
list once and show it wherever you like — on any page, in any PDF — and it shows
the same publications, in the same order, everywhere.

| You want to change | In |
|---|---|
| your publications | `content/publications.bib` |
| which of them a list shows, in what order and in which groups | `content/publication-lists.yml` |
| where a list appears, under which heading | a page: `<VitaPublications list="…" title="…" />`; a PDF: `\vitapublications[…]{…}` |
| the statuses, their headings, the links after each reference | `schemas/publications.ts` |
| how a reference reads on the website | `content/publications.csl` |

## Your BibTeX file

`content/publications.bib` is a single BibTeX file, exported from Zotero, JabRef
or arXiv. The website formats it with citation-js; the PDF typesets it with
biblatex (see [bibliography](../pdf/bibliography.md)).

```bibtex
@article{doe2024,
  author  = {Doe, Jane},
  title   = {The shape of large random $k$-ary trees},
  journal = {Random Structures \& Algorithms},
  year    = {2024},
  doi     = {10.5555/12345678},
  status  = {published},
}
```

| Field                                                             | Effect                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                                                          | `published`, `accepted`, `preprint`, `software`, `other`, in any capitalisation. Defaults to `published`; an unknown value is an error. Lists can select and group by it; the statuses can be changed, see [below](#statuses-badges-and-fields) |
| `doi`, `arxiv`, `mrnumber`, `zbl`                                 | Become links after the reference, and `arxiv` becomes an eprint link in the PDF                                                                                                                                              |
| `eprint` with `eprinttype = {arxiv}` or `archivePrefix = {arXiv}` | The same as `arxiv`, as biblatex, JabRef, Zotero and arXiv's own export write it                                                                                                                                             |
| `url`                                                             | Links the title on the website. A path on the site such as `/papers/doe2024.pdf` (a file in `public/`) gets the deployment base path, and in the PDF becomes a full URL below `url` in `profile.yml`, which it then requires |
| `year`, `month`, `day`                                            | Order in a list: newest first, by month and day where given; an entry with only a year comes after the dated ones of that year                                                                                              |
| `keywords`                                                        | Optional. A list can pick entries by one of their keywords — Zotero exports its tags as keywords                                                                                                                            |

A `doi` may be bare (`10.1000/xyz`), prefixed (`doi:10.1000/xyz`) or a full
`https://doi.org/…` URL; all three link correctly in both outputs. On the website,
`arxiv`, `mrnumber` and `zbl` may also carry the prefix exports write
(`arXiv:2301.00001`, `MR1234567`, `Zbl 1234.56789`), and an arXiv version suffix
(`v2`) is dropped from the link.

Mathematics in titles works in both outputs. The website formats references with a
CSL style (a maths-oriented one by default); the PDF uses biblatex, so the two differ
slightly in style — this is expected.

On the website, each title links to its `url`, else its `doi`, else its `arxiv`
entry, and the fields above become badges after the reference. Those identifiers are
not printed a second time as raw text, whatever the style.

## Lists

Lists are declared in `content/publication-lists.yml`, one per name. A new
project has two:

```yaml
all:
  groupBy: status

recent:
  limit: 3
```

- **`all`** is every publication, grouped by status: first the published ones,
  then the preprints, and so on, each group under its heading. The
  `/publications/` page and the PDF show it.
- **`recent`** is the three newest, of any status, in one list. The home page
  shows it.

Publications are newest first unless a list says otherwise. To show four recent
publications instead of three, change `limit: 3` to `limit: 4`; the home page
follows at once.

### Examples

Each of these is a list you could add to the file; the name before the colon is
yours to choose (lowercase, with `-` between words).

```yaml
# Only the preprints
preprints:
  where: { status: preprint }

# Papers you tagged "selected" in Zotero
selected:
  where: { keywords: selected }

# Published papers since 2020, for a grant application
grant:
  where: { status: published }
  since: 2020

# Exactly these papers, in this order
highlights:
  keys: [berger2024trees, berger2022urns, doe2019]

# Everything, under one heading per year
by-year:
  groupBy: year

# Software, A to Z by title
software:
  where: { status: software }
  sort: title
```

### Settings

All settings are optional; a list without any (`all: {}`) is every publication,
newest first, in one list.

| Setting | What it does | Example |
|---|---|---|
| `where` | only publications with these values. Any BibTeX field works, and `status`, `year` and `key` (the citation key). `[a, b]` means a or b; several fields must all match | `where: { status: [preprint, accepted] }` |
| `keys` | exactly these publications, by citation key, in this order | `keys: [doe2024, doe2021]` |
| `since`, `until` | only publications from these years on, or up to them | `since: 2020` |
| `sort` | the order: `date` (newest first, the default), `year`, `title`, `source` (as in `publications.bib`), or any BibTeX field | `sort: title` |
| `order` | `asc` or `desc`, to turn the order around. Dates and years are newest first, anything else A to Z | `order: asc` |
| `limit` | at most this many | `limit: 5` |
| `groupBy` | groups with a heading each: `status` (in the order and with the headings of the [statuses](#statuses-badges-and-fields)), `year` (newest first), or any BibTeX field (A to Z) | `groupBy: year` |
| `otherLabel` | the heading of the publications that lack the `groupBy` field | `otherLabel: Undated` |

`where` compares whole values, as written in `publications.bib`: `{ project: Trees }`
does not match `project = {Trees and urns}`. `keywords` is the exception: it
matches when any one of an entry's keywords does.

A list is put together in this order: `keys`, `where`, `since` and `until`, then
`sort`, then `limit`, then `groupBy`. So `limit: 3` with `groupBy: status` is the
three newest, grouped — not three of each status.

A list that names a status, a field or a citation key that no publication has is
an error, so that a typo cannot quietly empty it.

### Showing a list

On a website page:

```vue
<VitaPublications list="recent" title="Recent publications" />
```

In a PDF document, in `cv-tex/<document>.tex`:

```tex
\vitapublications[Recent publications]{recent}
```

The heading is optional in both. A list without publications is not shown at
all, heading included. More: [publications on the website](../website/publications.md),
[the bibliography in the PDF](../pdf/bibliography.md).

`vitakit add publication-list` declares a list and shows it on a page or in a PDF
for you, asking what to select ([add publication-list](../cli/add.md#add-publication-list)).
To see what a list contains, and which setting left a publication out:

::: code-group

```bash [pnpm]
pnpm vitakit explain recent         # one list, step by step
pnpm vitakit explain publications   # every list, and where it is shown
```

```bash [npm]
npx vitakit explain recent         # one list, step by step
npx vitakit explain publications   # every list, and where it is shown
```

:::

```
grant

  list      content/publication-lists.yml:12
            status published · since 2020 · newest first
  shows     9 of 31 publications (where status: published −14, since: 2020 −8)
            berger2025shape, berger2024trees, …

  website   not on any page

  pdf       application   cv-tex/application.tex:30   \vitapublications[Publications]{grant}
```

## Statuses, badges and fields

The statuses, the badges after each reference and the fields passed to the website are
set in `schemas/publications.ts`. The website, `vitakit verify` and the PDF all read
it, so they always agree. Start from the defaults:

::: code-group

```bash [pnpm]
pnpm vitakit customize publications   # -> schemas/publications.ts
```

```bash [npm]
npx vitakit customize publications   # -> schemas/publications.ts
```

:::

```ts twoslash
import { badgePresets, publications } from "@anja.codes/vitakit";

export default publications({
  statuses: [
    { id: "published", label: "Articles" },
    { id: "preprint", label: "Preprints" },
    { id: "talk-slides", label: "Talk slides" }, // status = {talk-slides}
  ],
  defaultStatus: "published", // for entries without status
  badges: [
    { ...badgePresets.doi, className: "vita-badge" },
    {
      field: "slides",
      label: "Slides",
      url: "/slides/$1.pdf",
      className: "vita-badge",
    },
  ],
  fields: ["project"], // entry.fields.project
});
```

Every setting is optional; what you leave out keeps its default. Status ids are
lowercase (`talk-slides`); a list grouped by status shows them in the order of
`statuses`, under their labels, on the website and in the PDF.

`fields` are BibTeX fields handed to the website as `entry.fields`, for a copy of
`VitaPublication` that shows them (see [publications on the website](../website/publications.md)).
A list can select, sort and group by any field without it.

## Citation style

To change how references look on the website, put a CSL file at
`content/publications.csl`. It is picked up without configuration — by the dev server
(live), the build and `vitakit verify` alike. Start from the bundled style:

::: code-group

```bash [pnpm]
pnpm vitakit eject publications.csl   # -> content/publications.csl
```

```bash [npm]
npx vitakit eject publications.csl   # -> content/publications.csl
```

:::

or save any style from the [Zotero style repository](https://www.zotero.org/styles)
under that name. Delete the file to return to the default. The PDF is not affected:
it is typeset by biblatex, styled in `cv-tex/`.

---

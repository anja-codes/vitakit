# Content reference

Every file in `content/` is validated before it is used. An unknown key is a build
error naming the file and the field, not a silently missing line on your site.

Shared conventions first, then one section per file.

---

## Shared field types

### Dates

Three precisions, written as you would in a CV:

```yaml
date: 2024                  # a year
date: 2024-03               # a month
date: 2024-03-15            # a day
date: { from: 2019, to: 2023 }
date: { from: 2023, to: present }     # open-ended
```

Precisions mix freely and still sort correctly. `2024-13` or `2023-02-30` are errors,
as is a range that ends before it starts.

Entries are sorted newest first automatically. Formatting follows the precision you
wrote: `2024`, `Mar 2024`, `2019–2023`, `2023–present`.

### Institutions

```yaml
institution: University of Graz
institution: { name: University of Graz, url: https://uni-graz.at }
```

The short form is expanded for you; with a `url`, the name is linked in both outputs.

### Links

```yaml
links:
  - https://example.org/a # label derived from the URL
  - { label: ORCID, url: https://orcid.org/… }
```

### URLs

A field of type **url** takes an `http(s)` or `mailto` URL, or a path on your site
such as `/slides/talk.pdf` — a file in `public/`:

```yaml
url: https://aofa.org/2025
slides: /slides/aofa2025.pdf # public/slides/aofa2025.pdf
```

On the website, a path gets the deployment base path, like paths in Markdown. The
PDF has no site to be relative to, so where it prints such a link it needs your
site's address, `url` in `content/profile.yml`; without it, `build:cv` stops and
says so. Links the PDF does not print, such as `slides` of a talk, need nothing.

### Text with mathematics

Fields marked **rich** below accept Markdown and `$…$` mathematics:

```yaml
title: The shape of large random $k$-ary trees
```

On the website it reads: The shape of large random $k$-ary trees.

Mathematics is typeset by KaTeX for the website and passed through to LaTeX for
the PDF. Write `\$` for a dollar sign that does not start a formula. Other Markdown formatting (emphasis, links, etc.) is currently rendered
only on the website; its source syntax appears literally in the PDF.
Invalid TeX fails the build with the file, the entry index and the field.

### Visibility

Every section entry accepts:

```yaml
visibility: public          # default — website and PDF
visibility: cv              # PDF only: address, phone, referees, full lists
visibility: private         # local builds only
```

The website loader is hard-wired to `public`; `vitakit-check` fails if text from a
non-public entry appears anywhere in the generated site. See [privacy](./privacy.md).

---

## `content/profile.yml`

The only file that is not a CV section: who you are, plus the shape of the site.

| Field         | Type                    | Required | Notes                                                                                                                 |
| ------------- | ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `name`        | text                    | yes      | Site header, page titles and CV header                                                                                |
| `title`       | text                    | no       | e.g. `Postdoctoral Researcher`                                                                                        |
| `affiliation` | institution             | no       |                                                                                                                       |
| `email`       | email                   | no       |                                                                                                                       |
| `links`       | list of links           | no       | ORCID, GitHub, arXiv, …                                                                                               |
| `summary`     | text                    | no       | One or two sentences for metadata; not rendered on the page — prose belongs in `content/pages/index.md`               |
| `url`         | http(s) URL             | no       | Where the site is published, e.g. `https://jane.github.io/site/`. The PDF needs it to link [paths on the site](#urls) |
| `avatar`      | path                    | no       | Below `public/`, e.g. `/img/portrait.jpg`                                                                             |
| `nav`         | list of `{ label, to }` | no       | Navigation; explicit, so wording and order are yours                                                                  |
| `footer`      | text                    | no       | Inline Markdown, shown at the bottom of every page                                                                    |

Navigation is not derived from your pages: adding a page does not change the menu.

## `content/pages/*.md`

The file name is the route: `research.md` → `/research/`, `index.md` → `/`.

```md
---
title: Research
description: Analytic combinatorics.
order: 10
---

Prose, $mathematics$, tables and images.
```

| Front matter  | Type     | Required | Notes                                           |
| ------------- | -------- | -------- | ----------------------------------------------- |
| `title`       | **rich** | yes      |                                                 |
| `description` | text     | no       | Meta description and page lead                  |
| `route`       | path     | no       | Override the file-name route, e.g. `/about/me/` |
| `order`       | integer  | no       | Sort order; defaults to `100`                   |

Body Markdown supports GFM (tables, strikethrough, task lists), `$inline$` and
`$$display$$` mathematics, and images from `public/`. Write paths as if the site
were served from `/`: root-relative links and assets such as `[CV](/cv/)` or
`/img/tree.svg` are rewritten for the deployment base URL, so they work both locally
and under `user.github.io/repo/`. That covers Markdown links and images as well as
raw HTML — `href`, `src`, `srcset`, `poster`, `<object data>` and form actions.
Relative paths (`img/tree.svg`) and full URLs are left alone.

## `content/education.yml`

| Field               | Type         | Required |
| ------------------- | ------------ | -------- |
| `date`              | date         | yes      |
| `degree`            | text         | yes      |
| `institution`       | institution  | yes      |
| `thesis.title`      | **rich**     | —        |
| `thesis.type`       | text         | no       |
| `thesis.supervisor` | text or link | no       |
| `thesis.url`        | url          | no       |
| `note`              | text         | no       |

```yaml
- date: { from: 2016, to: 2020 }
  degree: PhD in Mathematics
  institution: { name: University of Klagenfurt, url: https://www.aau.at }
  thesis:
    title: Cutting down random trees
    type: Doctoral thesis
    supervisor: { label: A. Supervisor, url: https://example.org/s }
```

## `content/employment.yml`

| Field                                            | Type              | Required |
| ------------------------------------------------ | ----------------- | -------- |
| `date`                                           | date              | yes      |
| `position`                                       | text              | yes      |
| `institution`                                    | institution       | yes      |
| `project.title`                                  | **rich**          | —        |
| `project.funder`, `project.grant`, `project.url` | text / text / url | no       |
| `note`                                           | text              | no       |

## `content/teaching.yml`

| Field         | Type        | Required | Notes                                                |
| ------------- | ----------- | -------- | ---------------------------------------------------- |
| `date`        | date        | yes      |                                                      |
| `title`       | **rich**    | yes      |                                                      |
| `role`        | text        | no       | `Lecturer`, `Teaching Assistant`, …                  |
| `institution` | institution | no       |                                                      |
| `term`        | text        | no       | `2024W`, `Winter 2023/24`; shown instead of the date |
| `url`         | url         | no       |                                                      |
| `note`        | text        | no       |                                                      |

## `content/talks.yml`

| Field           | Type     | Required | Notes                                                     |
| --------------- | -------- | -------- | --------------------------------------------------------- |
| `date`          | date     | yes      |                                                           |
| `title`         | **rich** | yes      |                                                           |
| `event`         | text     | no       |                                                           |
| `location`      | text     | no       |                                                           |
| `kind`          | enum     | no       | `invited`, `contributed`, `seminar`, `poster`, `outreach` |
| `url`, `slides` | url      | no       |                                                           |

`kind` is what document selection uses: `where: { kind: invited }`. See
[CV documents](./cv-documents.md#selection-options).

## `content/supervision.yml`

| Field          | Type        | Required |
| -------------- | ----------- | -------- | ---------------------------------------------------------- |
| `date`         | date        | yes      |
| `student`      | text        | yes      |
| `title`        | **rich**    | yes      |
| `ongoing`      | boolean     | no       | `true` for a thesis still in progress; defaults to `false` |
| `degree`       | text        | no       |
| `institution`  | institution | no       |
| `coSupervisor` | text        | no       |

## `content/publications.bib`

A single BibTeX file, exported from Zotero, JabRef or arXiv.

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
| `status`                                                          | Grouping: `published`, `accepted`, `preprint`, `software`, `other`, in any capitalisation. Defaults to `published`; an unknown value is an error. The groups can be changed, see [below](#groups-links-and-fields)           |
| `doi`, `arxiv`, `mrnumber`, `zbl`                                 | Become links after the reference, and `arxiv` becomes an eprint link in the PDF                                                                                                                                              |
| `eprint` with `eprinttype = {arxiv}` or `archivePrefix = {arXiv}` | The same as `arxiv`, as biblatex, JabRef, Zotero and arXiv's own export write it                                                                                                                                             |
| `url`                                                             | Links the title on the website. A path on the site such as `/papers/doe2024.pdf` (a file in `public/`) gets the deployment base path, and in the PDF becomes a full URL below `url` in `profile.yml`, which it then requires |
| `year`, `month`, `day`                                            | Order within a group: newest first, by month and day where given; an entry with only a year comes after the dated ones of that year                                                                                          |

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

### Groups, links and fields

The groups, the badges after each reference and the fields passed to the website are
set in `schemas/publications.ts`. The website, `vitakit-check` and the PDF all read
it, so they always agree. Start from the defaults:

::: code-group

```bash [pnpm]
pnpm vitakit eject publications   # -> schemas/publications.ts
```

```bash [npm]
npx vitakit eject publications   # -> schemas/publications.ts
```

:::

```ts twoslash
import { badgePresets, publications } from "@anja.codes/vitakit";

export default publications({
  groups: [
    { id: "published", label: "Articles" },
    { id: "preprint", label: "Preprints" },
    { id: "talk-slides", label: "Talk slides" }, // status = {talk-slides}
  ],
  defaultGroup: "published", // for entries without status
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

Every setting is optional; what you leave out keeps its default. Group ids are
lowercase (`talk-slides`); the order of `groups` is the order on the page and in the
PDF. A `cv-tex/<document>.yml` selects among them with `publications.groups`, and a
misspelt group there is an error.

`fields` are BibTeX fields handed to the website as `entry.fields`, for a copy of
`VitaPublication` that shows them (see [customising](./customising.md#layer-6--ejecting)).

### Citation style

To change how references look on the website, put a CSL file at
`content/publications.csl`. It is picked up without configuration — by the dev server
(live), the build and `vitakit-check` alike. Start from the bundled style:

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

## Adding your own section

`content/<name>.yml` plus `schemas/<name>.ts`. See
[customising](./customising.md#layer-5--adding-a-section).

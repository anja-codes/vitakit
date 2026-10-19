# Publications

## The BibTeX file

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
| `status`                                                          | Grouping: `published`, `accepted`, `preprint`, `software`, `other`, in any capitalisation. Defaults to `published`; an unknown value is an error. The groups can be changed, see [below](#groups-badges-and-fields)           |
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

## Groups, badges and fields

The groups, the badges after each reference and the fields passed to the website are
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
`VitaPublication` that shows them (see [publications on the website](../website/publications.md)).

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

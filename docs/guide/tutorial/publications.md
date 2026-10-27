# 4. Publications

Publications are not a YAML section but a BibTeX file, because that is what
reference managers export: `content/publications.bib`. What the website and the
PDF show of it is decided by **lists** — "the three newest", "all of them,
grouped", "my selected papers" — written once in
`content/publication-lists.yml`, and shown wherever you like.

## Your BibTeX file

Export your publications from Zotero, JabRef, Google Scholar or arXiv as BibTeX,
and replace the contents of `content/publications.bib` with it.

One field is vitakit's own: **`status`** says what an entry is.

```bibtex
@article{berger2024trees,
  author  = {Berger, Lena and Doe, Jane},
  title   = {The shape of large random $k$-ary trees},
  journal = {Random Structures \& Algorithms},
  year    = {2024},
  doi     = {10.5555/12345678},
  status  = {published},
}

@misc{berger2025ascents,
  author = {Berger, Lena},
  title  = {Sharp bounds for ascent sequences of height $h$},
  year   = {2025},
  arxiv  = {2501.01234},
  status = {preprint},
}
```

The statuses are `published`, `accepted`, `preprint`, `software` and `other`;
an entry without `status` is `published`. Lena's export has no `status` fields,
so everything counts as published. She adds `status = {preprint}` to her two
preprints, and `status = {software}` to the package she wrote. Mathematics in
titles works as everywhere else.

## Where your publications appear

Open `content/publication-lists.yml`. Below a comment explaining every setting,
it has two lists:

```yaml
all:
  groupBy: status

recent:
  limit: 3
```

| List | What it shows | Where it is shown |
|---|---|---|
| `all` | every publication, newest first, grouped by status: Published, then Preprints, … | the `/publications/` page, and the PDF |
| `recent` | the three newest, of any status, in one list | the home page, next to the recent talks |

Where a list is shown is one line in a page or a PDF document, naming it:

```vue
<!-- app/pages/publications.vue -->
<VitaPublications list="all" />
```

```tex
% cv-tex/cv.tex
\vitapublications[Publications]{all}
```

So the list decides *which* publications, in what order and in which groups;
the page or the PDF decides *where*, and under which heading. The same list
shows the same publications everywhere.

Lena would like five recent publications on her home page. She changes `recent`:

```yaml
recent:
  limit: 5
```

and the home page shows five as soon as she saves.

## A list of her own

Lena keeps a tag `selected` in Zotero for the papers she is proudest of, and
Zotero exports tags as `keywords = {selected}`. She wants those on her
publications page, above the full list. `vitakit add publication-list` sets it
up — run without options, it asks:

::: code-group

```bash [pnpm]
pnpm vitakit add publication-list selected --where keywords=selected
```

```bash [npm]
npx vitakit add publication-list selected --where keywords=selected
```

:::

```
Show selected on which page of your website?
  1  /  (app/pages/index.vue)
  2  /cv/  (app/pages/cv.vue)
  3  /publications/  (app/pages/publications.vue)   (Enter)
  4  not on the website, for now
>
Include selected in the PDF cv-tex/cv.tex? [y/N]
Heading [Selected]: Selected publications

~ content/publication-lists.yml   declares the list selected
  + selected:
  +   where: { keywords: selected }
~ app/pages/publications.vue   shows the list selected after all
        <VitaPublications list="all" class="mt-8" />
  +     <VitaPublications list="selected" title="Selected publications" />

Write these changes? [Y/n]
```

Every change is shown before it is made. She wants the selected papers first,
so she moves the new line above `<VitaPublications list="all" … />` in
`app/pages/publications.vue` — the order of the lines is the order on the page.

Without `--where`, the command asks what to select instead: all publications or
only some statuses, how many, in what order, and whether in groups. Lists can do
more than it asks — pick papers by citation key, sort by title, group by year;
every setting, with examples, is in [publications](../../content/publications.md#lists).
They are all a line or two of YAML, like `recent` above.

## Why is a paper not in my list?

One of Lena's selected papers is missing. `vitakit explain` takes a list's name:

::: code-group

```bash [pnpm]
pnpm vitakit explain selected
```

```bash [npm]
npx vitakit explain selected
```

:::

```
selected

  list      content/publication-lists.yml:25
            keywords selected · newest first
  shows     4 of 12 publications (where keywords: selected −8)
            berger2025ascents, berger2024trees, berger2023urns, doe2021

  website   /publications/   app/pages/publications.vue:26   <VitaPublications title="Selected publications">

  pdf       not in any PDF document
```

The citation key she expected is not among the four: in Zotero, that paper has
no `selected` tag yet. `vitakit explain publications` gives the same overview
for all lists at once.

A list naming a field or a status that no publication has is an error rather
than an empty list, so a typo such as `keywords=selcted` is caught, naming the
list.

## Links after each reference

`doi`, `arxiv`, `mrnumber` (MathSciNet) and `zbl` (zbMATH) become small links
after each reference on the website; the title links to the `url`, else the
DOI, else arXiv. Exports write these fields in several ways — `doi:10.…`, a full
`https://doi.org/…`, `eprint` with `eprinttype = {arxiv}` — and all of them
work. In the PDF, the DOI is printed and arXiv becomes an eprint link.

## Your own statuses

Lena wants her talk slides listed too, and calls preprints "Submitted". The
statuses, the headings of their groups and their order, and the links are set
in `schemas/publications.ts`; this writes vitakit's defaults there to start from:

::: code-group

```bash [pnpm]
pnpm vitakit customize publications
```

```bash [npm]
npx vitakit customize publications
```

:::

```ts
export default publications({
  statuses: [
    { id: 'published', label: 'Published' },
    { id: 'preprint', label: 'Submitted' },
    { id: 'software', label: 'Software' },
    { id: 'slides', label: 'Talk slides' },   // status = {slides}
  ],
  defaultStatus: 'published',
  // badges: …, fields: …
})
```

Every list grouped by status now shows these headings, in this order, on the
website and in the PDF. A `status` that is not one of them is an error naming
the entry. See [publications](../../content/publications.md#statuses-badges-and-fields)
for badges of your own and further fields.

## How references read

On the website, references are formatted with a CSL style, the format
reference managers use; the default suits mathematics. Any style from the
[Zotero style repository](https://www.zotero.org/styles) works: save it as
`content/publications.csl`. In the PDF, biblatex typesets them, styled in
`cv-tex/` — so the two look slightly different, which is expected.

Check `http://localhost:3000/publications/`: the selected papers, the groups,
the links, the mathematics.

**Next:** [a section of your own](./own-section.md).

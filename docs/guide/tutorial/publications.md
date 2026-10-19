# 4. Publications

Publications are not a YAML section but a BibTeX file, because that is what
reference managers export: `content/publications.bib`.

## Your BibTeX file

Export your publications from Zotero, JabRef, Google Scholar or arXiv as BibTeX,
and replace the contents of `content/publications.bib` with it. The website's
`/publications/` page and the PDF both read it.

One field is vitakit's own: **`status`** decides the group an entry is listed
under.

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

The groups are `published`, `accepted`, `preprint`, `software` and `other`; an
entry without `status` is `published`. Within a group, the newest come first.

Lena's export has no `status` fields, so everything is listed as published. She
adds `status = {preprint}` to her two preprints, and `status = {software}` to
the package she wrote. Mathematics in titles works as everywhere else.

## Links after each reference

`doi`, `arxiv`, `mrnumber` (MathSciNet) and `zbl` (zbMATH) become small links
after each reference on the website; the title links to the `url`, else the
DOI, else arXiv. Exports write these fields in several ways — `doi:10.…`, a full
`https://doi.org/…`, `eprint` with `eprinttype = {arxiv}` — and all of them
work. In the PDF, the DOI is printed and arXiv becomes an eprint link.

## Your own groups

Lena wants her talk slides listed too, and calls preprints "Submitted". The
groups, their names and order, and the links are set in
`schemas/publications.ts`; this writes vitakit's defaults there to start from:

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
  groups: [
    { id: 'published', label: 'Published' },
    { id: 'preprint', label: 'Submitted' },
    { id: 'software', label: 'Software' },
    { id: 'slides', label: 'Talk slides' },   // status = {slides}
  ],
  defaultGroup: 'published',
  // badges: …, fields: …
})
```

The website and the PDF both read this file, so they always agree on the
groups. A `status` that is not one of them is an error naming the entry. See
[publications](../../content/publications.md) for badges of your own and
further fields.

## How references read

On the website, references are formatted with a CSL style, the format
reference managers use; the default suits mathematics. Any style from the
[Zotero style repository](https://www.zotero.org/styles) works: save it as
`content/publications.csl`. In the PDF, biblatex typesets them, styled in
`cv-tex/` — so the two look slightly different, which is expected.

Check `http://localhost:3000/publications/`: the groups, the links, the
mathematics.

**Next:** [a section of your own](./own-section.md).

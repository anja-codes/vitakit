# Bibliography

The class loads biblatex, and `\vitapublications[Heading]{list}` prints a
[publication list](../content/publications.md#lists) from
`content/publication-lists.yml`: its heading, then its entries, one bibliography per
group. vitakit selects, sorts and groups the list, as on the website, and
`generated/<document>/publications/<list>.tex` cites exactly those entries in that
order, so the PDF and the website always list the same entries. Neither the list nor
its heading is printed when it has no entries. `arxiv` becomes an eprint link.

```tex
\vitapublications[Publications]{all}
\vitapublications[Recent preprints]{preprints}
```

Pass `\documentclass[nobib]{vitakit-cv}` to load biblatex yourself instead.

Building the bibliography needs **biber** (part of every current TeX distribution);
`latexmk` runs it for you.

Which entries a list shows, and the status labels, come from
`content/publication-lists.yml` and `schemas/publications.ts`: see
[publications](../content/publications.md). How each reference is formatted is
biblatex's: set its style in `cv-tex/preamble.tex`. The groups' headings:
[styling](./styling.md#publication-lists).

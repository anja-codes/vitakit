# Bibliography

The class loads biblatex, and `\vitainput{publications}` prints one list per group.
The groups are the website's: vitakit decides which entry belongs where (an entry
without `status` is `published`, and `Published` counts as `published`) and
`generated/<document>/publications.tex` selects each group by citation key, so the
PDF and the website always list the same entries. `arxiv` becomes an eprint link.

For a list of your own, `\printbibliography[keyword=published]` also works: the
`status` field is copied to `keywords`, as written. Pass
`\documentclass[nobib]{vitakit-cv}` to load biblatex yourself instead.

Building the bibliography needs **biber** (part of every current TeX distribution);
`latexmk` runs it for you.

Which entries are in which group, and the group names, come from
`content/publications.bib` and `schemas/publications.ts`: see
[publications](../content/publications.md). A document picks groups with
`publications: { groups: [...] }` in its `.yml` (see [selection
options](./index.md#selection-options)). How each reference is formatted is
biblatex's: set its style in `cv-tex/preamble.tex`.

# 7. The PDF

The same entries make a typeset CV. This chapter builds it, decides what goes
in, and makes a second one for a job application.

## Build it

::: code-group

```bash [pnpm]
pnpm pdf
```

```bash [npm]
npm run pdf
```

:::

```
cv: wrote cv-tex/generated/cv/ (7 files), running latexmk…
cv: ✓ cv-tex/cv.pdf
```

`cv-tex/cv.pdf` is Lena's CV. This needs a TeX distribution with `latexmk` and
`biber`; without one, `pnpm pdf --tex-only` writes the LaTeX files, which any TeX
installation or Overleaf can typeset, and the scaffold's CI workflow builds the
PDF for you (see [building](../../pdf/building.md)). When LaTeX fails, you see
its own error and the line it happened on.

## Order and headings: `cv.tex`

`cv-tex/cv.tex` is a LaTeX document, and it is yours. Its body lists the
sections, in order, with their headings:

```tex
\begin{document}
\vitaheader

\vitasection[Employment]{employment}
\vitasection[Education]{education}
\vitasection[Grants]{grants}
\vitasection[Teaching]{teaching}

\vitapublications[Publications]{all}

\vitasection[Selected talks]{talks}
\end{document}
```

`\vitaheader` is the name, position and contact line from `profile.yml`.
`\vitasection[Heading]{section}` is a heading and the section's entries; a
section without entries in this document is left out, heading included.
`\vitapublications[Heading]{list}` does the same for a [publication
list](./publications.md#where-your-publications-appear). Move a line to move a section. Anything else LaTeX can do goes between them: a
`\newpage`, a paragraph of your own.

Nothing in `cv-tex/generated/` is yours: it is rewritten on every build.

## What goes in: `cv.yml`

`cv-tex/cv.yml` selects entries for this document:

```yaml
visibility: cv        # include entries marked public and cv, not private

sections:
  talks:
    where: { kind: invited }
    limit: 10
```

`visibility: cv` is why the research stay marked `cv` in [chapter
3](./entries.md#not-everything-is-public) is in the PDF and not on the website.
Under `sections`, each section can be narrowed: by its fields (`where`), by year
(`since`, `until`), by number (`limit`). The CV lists invited talks only, the
ten latest.

Lena wonders where her contributed talks went:

::: code-group

```bash [pnpm]
pnpm vitakit explain talks
```

```bash [npm]
npx vitakit explain talks
```

:::

```
  pdf       cv   cv-tex/cv.tex:36  \vitasection[Selected talks]{talks}
                 template: vitakit's talks.eta
                 1 of 3 entries (where kind: invited −2)
```

One of three talks is included; `where kind: invited` removed the other two.
All selection options: [documents](../../pdf/index.md#selection-options).

## A version for one application

ETH Zürich asks for a CV with referees and a cover letter. A document is a
file, so a variant is a copy:

```bash
cp cv-tex/cv.tex cv-tex/application-eth.tex
cp cv-tex/cv.yml cv-tex/application-eth.yml
```

In the copy, change `\vitadocument{cv}` to `\vitadocument{application-eth}` — it
names the document. Forgetting it is a common slip, and `vitakit explain
application-eth` points it out:

```
Problems
  cv-tex/application-eth.tex:13
    \vitadocument{cv} does not match the file name; expected \vitadocument{application-eth}
```

**Referees** are a section of their own, marked `private` so that they only
appear where a document asks for them:

```yaml
# content/referees.yml
- title: Prof. Michael Fuchs
  institution: { name: University of Klagenfurt, url: https://www.aau.at }
  note: michael.fuchs@aau.at
  visibility: private
```

`vitakit add section referees --document application-eth` drafts its schema
and adds it to this document only. In `application-eth.yml`, `visibility:
private` lets it in — and every other private entry; the website and `cv.pdf`
still never include them.

**Publications**: ETH asks for those of the last five years. That is a list of
its own, in `content/publication-lists.yml`:

```yaml
recent-years:
  since: 2021
  groupBy: status
```

and in `application-eth.tex`, she changes `\vitapublications[Publications]{all}`
to `\vitapublications[Publications]{recent-years}`. `cv.pdf` still shows `all`.
(`vitakit add publication-list recent-years --since 2021 --group-by status
--document application-eth` would declare the list and add the line, but she
wants it in place of the other one.)

**The cover letter** is plain LaTeX in `cv-tex/prose/`, a directory the website
never reads:

```tex
% cv-tex/application-eth.tex
\begin{document}
\input{prose/cover-eth.tex}
\newpage
\vitaheader
…
\vitasection[Referees]{referees}
\end{document}
```

Build just this document:

::: code-group

```bash [pnpm]
pnpm pdf application-eth
```

```bash [npm]
npm run pdf -- application-eth
```

:::

Every variant reads the same `content/`: a correction to an entry is in all of
them at the next build. More in [variants and prose](../../pdf/variants.md).

## Styling

The look of every document is in `cv-tex/preamble.tex`, which is yours: fonts,
margins, how a heading or an entry is typeset. See [PDF
styling](../../pdf/styling.md).

**Next:** [check and publish](./publish.md).

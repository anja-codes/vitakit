# Building

::: code-group

```bash [pnpm]
pnpm pdf                  # every document in cv-tex/
pnpm pdf cv               # one
pnpm pdf --tex-only       # only the .tex files, no TeX installation needed
pnpm pdf --verbose        # with LaTeX's full output
```

```bash [npm]
npm run pdf                     # every document in cv-tex/
npm run pdf -- cv               # one
npm run pdf -- --tex-only       # only the .tex files, no TeX installation needed
npm run pdf -- --verbose        # with LaTeX's full output
```

:::

It needs `latexmk` and `biber`, from any current TeX distribution (TeX Live,
MacTeX, MiKTeX). LaTeX's output is shown only when something fails — then TeX's
own error, the line it happened on, and where the full log is.

## What the build writes

```
cv-tex/
  cv.tex, cv.yml, preamble.tex, prose/   your files, never modified
  cv.pdf                                 the result
  generated/cv/                          everything else: section .tex files,
                                         vitakit-cv.cls, and all of latexmk's
                                         auxiliary output
```

Obsolete generated section files are removed on each build, so deleting a data
source cannot silently leave its old entries in the PDF. Remove its
`\vitasection` line too; an input for a missing source is an error, not an empty
selection. Bibliography output is regenerated even when no publications remain.

`cv-tex/generated/` is disposable; latexmk's auxiliary files are kept between
builds, and you can delete the directory for a completely clean build.

## Without a TeX installation

After `pnpm pdf --tex-only`, a plain `latexmk cv.tex` in `cv-tex/` works as well,
from an editor, another machine or a CI action: `cv-tex/latexmkrc` lets LaTeX
find the generated document class. The `CV` workflow included with the GitHub
Pages and Cloudflare presets does exactly this, and attaches the PDF to the run
as an artifact; see [publishing](../guide/publishing.md).

The PDF is never part of the website: see [privacy](../guide/privacy.md#pdfs-are-not-published).

# pdf, check, verify

## `pdf`

::: code-group

```bash [pnpm]
pnpm pdf                  # every document in cv-tex/
pnpm pdf cv               # one
pnpm pdf --tex-only       # generate .tex only, no TeX installation needed
```

```bash [npm]
npm run pdf                     # every document in cv-tex/
npm run pdf -- cv               # one
npm run pdf -- --tex-only       # generate .tex only, no TeX installation needed
```

:::

Renders `content/` into `cv-tex/generated/<document>/` and runs `latexmk`. The
PDF is written next to its source; auxiliary files stay in the generated
directory, which vitakit owns — do not edit anything there. LaTeX's output is
only shown when something fails (then its end, and where the full log is), or
with `--verbose`.

Needs `latexmk` and `biber`. See [building the PDF](../pdf/building.md) for
what it writes, building without a TeX installation, and CI.

## `check` and `vitakit verify`

`check` runs `nuxt typecheck` → `nuxt generate` → `vitakit verify`, which
asserts on the built HTML rather than on your content:

```
  ok  4 page(s) generated
  ok  mathematics rendered on 4 page(s)
  ok  base path /
  ok  1 of 1 non-public entr(ies) absent from the site
  ok  assets and links use /
  ok  links into the site lead somewhere
  ok  bibliography on 1 page(s)
```

Two are worth knowing about: **nothing marked `visibility: cv` or `private` may
appear in the site**, and every asset and link — `href`, `src`, `srcset`,
`poster`, … — must use the deployment base path, a check that only bites when
the site is served from a subdirectory, which is exactly when it is hard to
notice by hand. Every such link must also lead somewhere: a Markdown link
`[Slides](/slides/talk.pdf)` fails the check until `public/slides/talk.pdf` exists.
Names must match exactly, including upper and lower case: `/img/photo.jpg` does
not lead to `public/img/Photo.jpg` on most web servers, even where your computer
finds it, and the check says when only the case differs.
The check inspects links emitted into HTML, not URL fields that a renderer omits.

The checks assume nothing about *what* your site contains: which pages exist
comes from `content/pages/`, and a bibliography is only checked where it is
shown — a `publications.bib` used only by the PDF is fine.

`--out <dir>` points at a different build directory. `--no-leak-check` skips
the privacy check, whose comparison of titles can mistake a title that is
legitimately public elsewhere for a leak. The scaffolded workflows run `check`
before deploying, so a problem fails CI rather than the site.

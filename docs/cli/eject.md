# eject

::: code-group

```bash [pnpm]
pnpm vitakit eject --list                # what can be taken over
pnpm vitakit eject VitaPublication       # how one reference looks on the website
pnpm vitakit eject publications.csl      # the website's citation style
pnpm vitakit eject vitakit-cv.cls        # the LaTeX class of every PDF
```

```bash [npm]
npx vitakit eject --list                # what can be taken over
npx vitakit eject VitaPublication       # how one reference looks on the website
npx vitakit eject publications.csl      # the website's citation style
npx vitakit eject vitakit-cv.cls        # the LaTeX class of every PDF
```

:::

Copies a file that vitakit shares between all sections or all documents into
your project, where it wins from then on. **An ejected file is yours forever**:
later improvements to it in vitakit will not reach you. Everything that can
carry a bug — validation, rendering, sorting, escaping — stays in the package,
so eject deliberately. Before ejecting a component, check whether CSS is
enough: the classes are styled in `app/assets/css/main.css`
([styling](../website/styling.md)).

An existing copy is never replaced, unless you pass `--force`; yours is then
kept next to it as a `.backup`.

| File | Affects |
|---|---|
| `VitaSection`, `VitaEntry`, `VitaDate`, … | every section on every page; for one section, use [`customize --web`](./customize.md) |
| `VitaPublications`, `VitaPublication` | the publication list; see [publications on the website](../website/publications.md) |
| `publications.csl` | how references read on the website, not in the PDF |
| `vitakit-cv.cls` | every PDF document; `cv-tex/preamble.tex` is usually enough, see [PDF styling](../pdf/styling.md) |

A section's schema or PDF template is not ejected but customized:
`vitakit customize <section> --schema` or `--pdf`.

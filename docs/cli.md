# Commands

Five commands, and a deliberate absence of more. Each has `--help`.

| Command | Does |
|---|---|
| `pnpm dev` | the development server |
| `pnpm check` | typecheck, generate the site, verify the output |
| `pnpm build:cv` | render `content/` into `cv-tex/` and run `latexmk` |
| `pnpm vitakit add <name>` | set up a new section |
| `pnpm vitakit eject <name>` | copy a package default into your project |
| `pnpm vitakit list` | show what can be ejected |

Everything else is editing a file. A new page is a Markdown file; a new CV
variant is a copy of `cv.tex`. Commands that generate such things go stale
against what they generate, and hide the fact that these are ordinary files —
so `add` and `eject` exist only because their manual alternative is genuinely
impractical: writing valid TypeScript from nothing, and copying a file out of
`node_modules/.pnpm/…`.

---

## `vitakit add <name>`

Sets up a section: a content file, a schema, and a component.

```bash
pnpm vitakit add outreach
```

```
content/outreach.yml                 your data — edit this first
schemas/outreach.ts                  the shape of an entry
app/components/OutreachSection.vue   how the entries look
```

**With an existing YAML file, the schema is drafted from it.** Write your data
first and the guesswork is done for you:

```yaml
# content/outreach.yml
- { date: 2025-03-14, title: What is a random tree?, venue: BRG Viktring, audience: school }
- { date: 2024-11-02, title: Maths night, audience: public }
```

```ts
// schemas/outreach.ts — drafted
export default section({
  date: dateRange,
  title: richText,                          // titles may contain mathematics
  venue: text.optional(),                   // missing from the second entry
  audience: z.enum(['school', 'public']),   // a small set of short values
})
```

Check what it guessed — especially the enum, which may need more values than
your current entries show.

| Option | |
|---|---|
| `--no-component` | skip the component; the section then renders through `<VitaSection>` |

Existing files are never overwritten. Names become file names, so lowercase
and kebab-case (`research-stays`).

For a **built-in** section — education, employment, teaching, talks,
supervision — you need nothing: create `content/<name>.yml` and it works. To
change what one may contain, eject its schema.

Afterwards, show it with `<OutreachSection />` on a page, or add
`\vitasection{outreach}` to `cv-tex/cv.tex` for the PDF.

## `vitakit eject <name>` and `vitakit list`

Copies a package default into your project, where it takes precedence.

```bash
pnpm vitakit list                    # see the names
pnpm vitakit eject VitaSection       # restyle how sections look
pnpm vitakit eject teaching          # add or remove fields of a section
pnpm vitakit eject publications      # change publication groups, badges, fields
pnpm vitakit eject talks.eta         # change how talks appear in the PDF
pnpm vitakit eject publications.csl  # change the citation style of the website
pnpm vitakit eject vitakit-cv.cls    # take over the LaTeX document class
```

| Kind | What it decides |
|---|---|
| `component` | how a section looks on the website |
| `schema` | what a section may contain; for `publications`, its groups, badges and fields |
| `template` | how a section is written into the PDF |
| `style` | how `publications.bib` is formatted on the website (CSL) |
| `class` | the LaTeX document class: fonts, spacing, entry macros |

`--force` overwrites an existing file.

**An ejected file is yours forever**: later improvements to it in vitakit will
not reach you. Everything that can carry a bug — validation, rendering,
sorting, escaping — stays in the package, so this is usually the right trade.
Eject deliberately rather than by default, and before ejecting a component
check whether CSS is enough: the classes are styled in
`app/assets/css/main.css` ([customising](./customising.md#layer-2--colours-fonts-spacing)).

## `pnpm build:cv`

```bash
pnpm build:cv                  # every document in cv-tex/
pnpm build:cv cv               # one
pnpm build:cv --no-pdf         # generate .tex only, no TeX installation needed
```

Renders `content/` into `cv-tex/generated/<document>/` and runs `latexmk`. The
PDF is written next to its source; auxiliary files stay in the generated
directory, which vitakit owns — do not edit anything there.

Needs `latexmk` and `biber`. See [CV documents](./cv-documents.md).

## `pnpm check`

`nuxt typecheck` → `nuxt generate` → `vitakit-check`, which asserts on the
built HTML rather than on your content:

```
  ok  4 page(s) generated
  ok  mathematics rendered on 4 page(s)
  ok  base path /
  ok  1 non-public entr(ies) absent from the site
  ok  assets and links use /
  ok  links into the site lead somewhere
  ok  bibliography on 1 page(s)
```

Two are worth knowing about: **nothing marked `visibility: cv` or `private` may
appear in the site**, and every asset and link — `href`, `src`, `srcset`,
`poster`, … — must use the deployment base path, a check that only bites when
the site is served from a subdirectory, which is exactly when it is hard to
notice by hand. Every such link must also lead somewhere: `slides: /slides/talk.pdf`
fails the check until `public/slides/talk.pdf` exists.

The checks assume nothing about *what* your site contains: which pages exist
comes from `content/pages/`, and a bibliography is only checked where it is
shown — a `publications.bib` used only by the PDF is fine.

`--out <dir>` points at a different build directory. The scaffolded workflows
run `pnpm check` before deploying, so a problem fails CI rather than the site.

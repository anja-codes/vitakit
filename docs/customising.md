# Customising

vitakit is a normal Nuxt application with a content pipeline you did not have to
write. Customisation comes in layers; most people never leave the first one, and no
layer invalidates the previous one.

| Layer | You edit | Skill needed |
|---|---|---|
| 1 | YAML, Markdown, BibTeX | none |
| 2 | `app/assets/css/main.css` | CSS variables |
| 3 | `app/pages/*.vue` | rearranging markup |
| 4 | `cv-tex/*.tex` | basic LaTeX |
| 5 | `schemas/*.ts` | copying a typed example |
| 6 | ejected components | Vue |

**One rule governs all of it: a file in your repository always wins.** There is no
other override mechanism to learn.

---

## Layer 2 — colours, fonts, spacing

`app/assets/css/main.css` starts with design tokens:

```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Lora", ui-serif, Georgia, serif;
  --color-primary: oklch(48% 0.13 250);
}
```

`--color-primary` changes the links; `--font-sans` changes the default text font.
`--font-serif` only affects elements using `font-serif`; the scaffold does not use
that class by default.

Below that, the same file styles the classes vitakit components emit. They are yours
to restyle; the components only provide structure.

| Class | Element |
|---|---|
| `vita-entry`, `vita-entry__date`, `vita-entry__title`, `vita-entry__meta`, `vita-entry__note` | one row of a section |
| `vita-section` | the list wrapping entries |
| `vita-date`, `vita-links` | a formatted date, a row of links |
| `vita-publications__group`, `vita-publications__heading`, `vita-bib`, `vita-badge` | the publication list |
| `vita-prose` | rendered Markdown |
| `vita-issues` | the development-only problem banner |

Inside the publication list, `VitaPublication` uses the usual CSL class names, and
the reference itself carries the markup of the citation style:

| Class | Element |
|---|---|
| `csl-bib-body` (with `vita-bib`) | the `<ol>` of one group |
| `csl-entry`, with `data-csl-entry-id="<citation key>"` | one reference |
| `vita-bib__text` | the reference as the citation style formats it |
| `bib-links` | the badges after a reference |
| `csl-left-margin`, `csl-right-inline` | the number and the text, in a numbered style such as Vancouver |
| `csl-block`, `csl-indent` | the lines of a style that uses `display="block"` / `"indent"` |

A numbered style brings its own number in `.csl-left-margin`, while `.vita-bib` is
already a numbered list, so the list would read "1. 1.". Keep one of them:

```css
.vita-bib .csl-left-margin { display: none; }
```

or drop `list-decimal` from `.vita-bib` and style the margin instead.

## Layer 3 — page structure

Pages are ordinary files in `app/pages/`, scaffolded into your project and readable:

```vue
<script setup lang="ts">
const profile = useProfile()
const page = usePage('/')
const talks = useSection('talks')
</script>

<template>
  <h1>{{ profile.name }}</h1>
  <VitaMarkdown v-if="page" :html="page.bodyHtml" />
  <VitaSection :entries="talks" :limit="3" />
</template>
```

Nothing is hidden behind configuration: what you see is what renders. Reorder the CV
by moving lines in `app/pages/cv.vue`; change the header or footer in
`app/layouts/default.vue`.

**Sections are renderers, not pages.** A section can appear on any page, several
times, with different filters — combine teaching and talks on one page, or split them
across two, without touching the data.

### Composables

| | |
|---|---|
| `useSection(id)` | entries, validated, visibility-filtered, newest first |
| `usePublications()` | reference groups; each entry has its formatted `html` and its `badges` as data |
| `usePage(route)`, `usePages()` | compiled Markdown pages |
| `useProfile()` | everything in `profile.yml`, including `nav` |
| `useVitakit()` | everything, including `issues` |

### Components

`VitaSection`, `VitaEntry`, `VitaDate`, `VitaLinks`, `VitaPublications`,
`VitaPublication`, `VitaMarkdown`, `VitaIssues`. All take props and emit markup; anything that could be
*wrong* — sorting, date formatting, filtering, citation rendering — lives in the
package, where it can be fixed for everyone.

### A new page

Add `content/pages/outreach.md` and it is live at `/outreach/`. If it needs more than
prose, add `app/pages/outreach.vue`; a concrete route wins over the Markdown
catch-all. `app/pages/publications.vue` is the worked example: prose from Markdown,
then a component.

To remove a page, delete its Markdown file and remove its navigation entry from
`content/profile.yml`. If it also has a concrete route in `app/pages/`, delete that
Vue file too.

## Layer 4 — the PDF

See [CV documents](./cv-documents.md).

## Layer 5 — adding a section

Three files, wired by file name, no configuration:

::: code-group

```bash [pnpm]
pnpm vitakit add outreach
```

```bash [npm]
npx vitakit add outreach
```

:::

writes all three for you: a YAML stub, a schema, and a component. If
`content/outreach.yml` already exists, the schema is **drafted from it** — types
guessed from your data, ready to correct. Nothing is overwritten.

The schema decides which fields are **accepted**, not which are **shown**. The
generated component starts with date, title and note; edit it to display fields
such as venue or audience. Adding a field to a built-in schema likewise does not
change its renderer.

The rest of this section describes what those files are, whether you wrote them
by hand or not.

**1.** `content/outreach.yml`

```yaml
- date: 2025-03-14
  title: What is a random tree?
  venue: BRG Klagenfurt-Viktring
  audience: school
```

**2.** `schemas/outreach.ts` — the shape

```ts twoslash
import { section, dateRange, richText, institution, z } from '@anja.codes/vitakit'

export default section({
  date: dateRange,
  title: richText,                 // Markdown and $math$
  venue: institution.optional(),
  audience: z.enum(['school', 'public', 'press']),
})
```

Build the schema from the vitakit primitives (`dateRange`, `institution`, `link`,
`richText`, `text`, `url`) and your section sorts, filters and formats like a
built-in one. `visibility` is added for you.

**3.** A page, or nothing at all

`useSection('outreach')` is available immediately, and `<VitaSection id="outreach" />`
renders it without a component of your own. The PDF gets it too:
`\vitasection{outreach}` in `cv-tex/cv.tex`.

### Changing a built-in section

Copy its schema into your project and edit it:

::: code-group

```bash [pnpm]
pnpm vitakit eject teaching      # -> schemas/teaching.ts
```

```bash [npm]
npx vitakit eject teaching      # -> schemas/teaching.ts
```

:::

The file is the definition vitakit itself uses, not a paraphrase, so adding a
field is editing a list:

```ts
export default section({
  date: dateRange,
  title: richText,
  evaluationScore: z.number().optional(),   // added
  …
})
```

A schema in your repository always wins for `content/teaching.yml`. If you would
rather extend the built-in than own the whole shape:

```ts twoslash
import { schemas, extendSection, z } from '@anja.codes/vitakit'

export default extendSection(schemas.teaching, {
  evaluationScore: z.number().optional(),
})
```

### Eject or schema?

Two different axes, easily confused:

| You want to change | Do this |
|---|---|
| what a section *contains* (fields) | `vitakit eject <section>`, then edit `schemas/<name>.ts` |
| what a section *looks like* (markup) | `vitakit eject <Component>` |

Adding a field to supervision is a schema change; restyling the list is an
eject. Neither needs the other.

## Layer 6 — ejecting

To change what a built-in component or TeX template *emits*, copy it into your
project, where it then wins:

::: code-group

```bash [pnpm]
pnpm vitakit list                    # what can be copied
pnpm vitakit eject VitaSection       # -> app/components/VitaSection.vue
pnpm vitakit eject talks.eta         # -> cv-tex/templates/talks.eta
pnpm vitakit eject publications      # -> schemas/publications.ts
pnpm vitakit eject publications.csl  # -> content/publications.csl
pnpm vitakit eject vitakit-cv.cls    # -> cv-tex/vitakit-cv.cls
```

```bash [npm]
npx vitakit list                    # what can be copied
npx vitakit eject VitaSection       # -> app/components/VitaSection.vue
npx vitakit eject talks.eta         # -> cv-tex/templates/talks.eta
npx vitakit eject publications      # -> schemas/publications.ts
npx vitakit eject publications.csl  # -> content/publications.csl
npx vitakit eject vitakit-cv.cls    # -> cv-tex/vitakit-cv.cls
```

:::

`publications.csl` is the citation style of the website's publication list; any CSL
style works in its place (see [content reference](./content-reference.md#citation-style)).

The publication list can be changed at three depths. `schemas/publications.ts`
decides the groups, the badges and which further fields reach the website;
`publications.csl` decides how a reference reads. `VitaPublication` decides how one
entry is laid out: it gets the formatted reference (`entry.html`), its badges as
data and the fields you listed (`entry.fields`), so a copy can show the badges as a
row of buttons, or as "arXiv:2301.00001" from `badge.value`, without parsing any
HTML:

```vue
<!-- the template of app/components/VitaPublication.vue, after `vitakit eject VitaPublication` -->
<template>
  <li class="csl-entry">
    <div v-html="entry.html" />
    <div class="flex gap-2">
      <a v-for="badge in entry.badges" :key="badge.url" :href="badge.url" class="vita-badge">
        {{ badge.field === 'arxiv' ? `arXiv:${badge.value}` : badge.label }}
      </a>
    </div>
  </li>
</template>
```

`VitaPublications` decides the groups, headings and list around them; eject it
only to change those.

`eject` saves you finding a package default deep inside `node_modules/`, where
any edit would be lost on the next install.

**An ejected file is yours forever**: improvements to it in later vitakit releases
will not reach you. Everything that can carry a bug stays in the package, so this is
usually the right trade — but eject deliberately, not by default.

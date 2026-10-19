# Customising

vitakit is a normal Nuxt application with a content pipeline you did not have to
write. Customisation comes in layers; most people never leave the first one, and no
layer invalidates the previous one.

| Layer | You edit | Skill needed |
|---|---|---|
| 1 | YAML, Markdown, BibTeX | none |
| 2 | `app/assets/css/main.css` | CSS variables |
| 3 | `app/pages/*.vue`, component slots | rearranging markup |
| 4 | `cv-tex/*.tex` | basic LaTeX |
| 5 | `schemas/*.ts` | copying a typed example |
| 6 | ejected components | Vue |

**One rule governs file overrides: a file in your repository always wins.** For
smaller markup changes, try component slots before copying a whole component.

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

### Customising a section with slots

Use `VitaSection` scoped slots to show an extra research detail or change a row's
markup without ejecting. The component stays in the package, so you keep its
updates. Without slots, rendering is unchanged.

There are exactly four slots:

| Slot | Replaces |
|---|---|
| `title` | the whole title region, including its wrapper, link and ongoing status |
| `meta` | the whole secondary line, including its wrapper |
| `note` | the whole note region, including its wrapper |
| `default` | the entire body, including title, meta, note and links |

All four receive the same typed context: `{ entry, index, display }`.
`entry` is the current processed `Entry`, not raw YAML; custom fields remain
`unknown`, with no schema-specific type generation. Narrow them with checks such
as `typeof`. `index` is zero-based in the displayed list, after `limit`.

`display` contains the values the default web renderer uses:

| Field | Value |
|---|---|
| `titleHtml`, `titleUrl?` | rendered title HTML and optional title link |
| `date?`, `term?` | `DateRange` and optional teaching-term label |
| `meta` | structured `SecondaryPart[]`: `{ kind: 'text', text }` or `{ kind: 'linked', linked }`, retaining link URLs |
| `note?` | plain string |
| `links` | `Link[]`, currently the Slides link |
| `ongoing` | boolean |

For example, supervision already accepts `coSupervisor`. Show it as a note while
keeping the built-in title, metadata and links:

```vue
<VitaSection id="supervision">
  <template #note="{ entry }">
    <p v-if="typeof entry.coSupervisor === 'string'" class="vita-entry__note">
      Co-supervisor: {{ entry.coSupervisor }}
    </p>
  </template>
</VitaSection>
```

Named slots run even when the corresponding default field is absent. A supplied
empty slot, or one whose condition renders nothing, hides that region rather
than falling back. Supply your own wrapper, such as
`<p class="vita-entry__meta">`, to retain the default styling.

To replace the whole body, use `#default` (there is no `#body` alias). For a
software section whose schema accepts `name` and `language`:

```vue
<VitaSection id="software">
  <template #default="{ entry }">
    <p v-if="typeof entry.name === 'string'" class="vita-entry__title">
      {{ entry.name }}
    </p>
    <p v-if="typeof entry.language === 'string'" class="vita-entry__meta">
      Written in {{ entry.language }}
    </p>
  </template>
</VitaSection>
```

The default slot takes precedence over all named slots. It replaces the complete
default body, including links, but keeps the list, each `<li>`, date column and
body wrapper. There is no links slot: put custom links in the body, meta or note.
There is no date slot on `VitaSection`, and these slots cannot change or hide the
date column. For custom date content, use your own loop with `VitaEntry` and its
`date` slot; for a different layout, use your own markup.

For Markdown or math, use compiled, trusted HTML rather than interpolating the
processed rich-text object. A title override can use `display.titleHtml`:

```vue
<VitaSection id="talks">
  <template #title="{ display }">
    <p class="vita-entry__title"><span v-html="display.titleHtml" /></p>
  </template>
</VitaSection>
```

For another compiled `richText` field, `richHtml` from
`@anja.codes/vitakit/shared` reads its rendered HTML. Only pass trusted compiled
HTML to `v-html`, never arbitrary raw YAML strings; use `{{ }}` for plain text.
A title override also owns any title link or ongoing label you want to retain.

Slots change this web rendering only: they do not change schemas, LaTeX output
or your generated custom components.

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
import { section, dateRange, richText, linked, z } from '@anja.codes/vitakit'

export default section({
  date: dateRange,
  title: richText,                 // Markdown and $math$
  venue: linked.optional(),
  audience: z.enum(['school', 'public', 'press']),
})
```

Build the schema from the vitakit primitives (`dateRange`, `linked`,
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
| what a section *looks like* (markup) | `VitaSection` slots first; `vitakit eject <Component>` for deeper changes |

Adding a field to supervision is a schema change; displaying it can be a slot
change. Neither requires owning the whole component.

## Layer 6 — ejecting

When slots are not enough, or to change a TeX template, copy the built-in into
your project, where it then wins:

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

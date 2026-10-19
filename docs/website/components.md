# Components and composables

vitakit's Nuxt module provides components and composables to every page and
component; there is nothing to import. All of them are thin: they take data
and emit markup. What could be *wrong* — validation, sorting, date formatting,
selection, citation rendering — happens in the package, where it is fixed for
everyone.

## Composables

| | |
|---|---|
| `useSection(id)` | a section's entries: validated, public only, newest first; empty for an unknown id |
| `usePublications()` | publication groups; each entry has its formatted `html`, its `badges` as data, and the `fields` listed in `schemas/publications.ts` |
| `usePage(route)`, `usePages()` | the compiled Markdown pages: `title`, `titleHtml`, `description`, `bodyHtml` |
| `useProfile()` | everything in `profile.yml`, including `nav` |
| `useVitakit()` | everything above, and `issues` while developing |

Fields of formatted text arrive as `{ text, html }`: `text` is the source,
`html` is rendered, with mathematics. `richHtml(value)` from
`@anja.codes/vitakit/shared` reads it. Dates arrive as a range, which
`<VitaDate :value="entry.date" />` formats.

## Components

| | |
|---|---|
| `VitaSection` | a section as a list of entries; see [placing sections](./sections.md) and [slots](./entries.md#slots) |
| `VitaEntry` | one row: a date column and its content; `date` prop, `date` slot, default slot |
| `VitaDate` | a date or range, formatted as in the PDF; `value`, optional `locale` and `presentLabel` |
| `VitaLinks` | a row of links, such as `profile.links` |
| `VitaMarkdown` | trusted, compiled HTML of a page, as `html` |
| `VitaPublications`, `VitaPublication` | the publication list and one reference; see [publications](./publications.md) |
| `VitaIssues` | the development banner listing content problems |

## Ejecting a component

To change a component everywhere, copy it into your project, where it then wins:

::: code-group

```bash [pnpm]
pnpm vitakit eject VitaSection   # -> app/components/VitaSection.vue
```

```bash [npm]
npx vitakit eject VitaSection   # -> app/components/VitaSection.vue
```

:::

**An ejected file is yours forever**: improvements to it in later vitakit
releases will not reach you. For one section, a [component of your
own](./entries.md#a-component-of-your-own) is the better trade; for looks,
[CSS](./styling.md). While the development server runs, adding or removing an
ejected component briefly restarts it, so that every page picks up the change.

## Module options

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@anja.codes/vitakit/nuxt'],
  vitakit: {
    rootDir: '.',      // where content/ and schemas/ are; the Nuxt root by default
    katexCss: true,    // load the stylesheet for mathematics; on by default
  },
})
```

Turn `katexCss` off only to load KaTeX's stylesheet yourself, and then from the
same KaTeX version vitakit uses.

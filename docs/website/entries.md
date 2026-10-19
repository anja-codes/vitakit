# Customising entries

How each entry of a section looks on the website, from the smallest change to
the largest:

| Change | How |
|---|---|
| colours, fonts, spacing | CSS: [styling](./styling.md) |
| one field more on each entry | `vitakit customize <section> --web --field <name>` |
| a different list: grouped, numbered | `vitakit customize <section> --web --list` |
| one region of each entry, by hand | `VitaSection` slots, below |
| every section on every page | `vitakit eject VitaSection` ([eject](../cli/eject.md)) |

The fields an entry *may* have are decided by its [schema](../content/schemas.md);
which of them are *shown* is decided here.

## A component of your own

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching --web --field evaluation
```

```bash [npm]
npx vitakit customize teaching --web --field evaluation
```

:::

writes `app/components/TeachingSection.vue` and shows the section with it
wherever it appeared: the page line `<VitaSection id="teaching" … />` becomes
`<TeachingSection id="teaching" … />`. The component wraps `VitaSection`, so the
list, sorting, dates and styling stay vitakit's, and fills one of its
[slots](#slots):

```vue
<script setup lang="ts">
import type { Entry, Where } from '@anja.codes/vitakit/shared'

const props = defineProps<{ id?: string, entries?: Entry[], title?: string, where?: Where, limit?: number }>()
</script>

<template>
  <VitaSection v-bind="props">
    <template #note="{ entry, display }">
      <p v-if="display.note !== undefined" class="vita-entry__note">{{ display.note }}</p>
      <p v-if="typeof entry.evaluation === 'number'" class="vita-entry__note">Evaluation: {{ entry.evaluation }}</p>
    </template>
  </VitaSection>
</template>
```

It is yours: change the wording, the order, the markup. Each field gets markup
that suits its type: a number is shown even when it is `0`, formatted text as
its rendered HTML, a link as a link. `--region meta` uses the secondary line
instead of the note.

**A list of its own.** `--list` writes a component that gets the entries from
vitakit — selected and sorted, honouring `where` and `limit` — and has its own
list markup, with a line for every field to start from: for numbering, badges,
or a layout of your own. `--group-by term` adds a heading for each term:

```vue
<template v-for="group in groups" :key="group.label">
  <h3 class="vita-section-group__subtitle">{{ group.label }}</h3>
  <ul class="vita-section">
    <VitaEntry v-for="entry in group.entries" :key="entry.id" :date="entry.date as DateRange">
      …
    </VitaEntry>
  </ul>
</template>
```

**The same component for another section.** A component works for any section
with the same fields: `vitakit customize talks-public --web --use TalkList`
switches that section's lines to it.

**Later**, `vitakit customize teaching --web --field hours` does not rewrite the
component: it prints the line to add. `vitakit explain teaching --field hours`
prints the same, for any section.

## Slots

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

Slots change the website only: not the schema, not the PDF.

## Fields or looks?

Two different axes, easily confused:

| You want to change | Do this |
|---|---|
| what a section *contains* (fields) | `vitakit add field <section> <name>`, or edit `schemas/<name>.ts` |
| what a section *looks like* (markup) | `vitakit customize <section> --web` for a component of your own, or `VitaSection` slots by hand; `vitakit eject <Component>` changes every section |

Adding a field to supervision is a schema change; displaying it can be a slot
change. Neither requires owning the whole component.

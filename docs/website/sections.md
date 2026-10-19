# Placing sections

A section appears on a page where the page says so, one line each:

```vue
<VitaSection id="teaching" title="Teaching" />
<VitaSection id="talks" title="Invited talks" :where="{ kind: 'invited' }" :limit="10" />
```

`vitakit add section <name> --page /cv/` writes such a line, after the section
you choose; `vitakit status` shows where each section appears.

| Prop | |
|---|---|
| `id` | the section, `content/<id>.yml` |
| `title` | a heading; heading and list then sit in a `<section id="<id>">`, and neither appears when there are no entries |
| `where` | only entries whose fields have these values (below) |
| `limit` | the newest N, after `where` |
| `entries` | entries you selected yourself, instead of `id` |
| `titleFields` | fields to try, in order, for the main line |

Without `title`, `VitaSection` is just the list, and the heading is yours to
write. The heading has the class `vita-section-group__title`; the anchor,
`/cv/#talks`, is the section's id.

## where

`where` keeps the entries whose fields have the given values; a list means any
of them:

```vue
<VitaSection id="talks" title="Invited talks" :where="{ kind: 'invited' }" />
<VitaSection id="talks" title="Outreach" :where="{ kind: ['outreach', 'poster'] }" />
<VitaSection id="teaching" title="Teaching in Graz" :where="{ institution: 'University of Graz' }" />
<VitaSection id="talks" title="Talks this year" :where="{ year: 2025 }" />
```

It compares against the field as written: formatted text by its source, a link
by its label, and `year` by the year of the entry's date. It is exactly the
`where` of a [PDF document](../pdf/index.md#selection-options), so a selection
reads the same in both. `vitakit validate` checks that the fields exist.

## A section in code

For a section that is part of a page's design rather than a list of its own —
the three latest talks on the home page, say — read it in the page's script:

```vue
<script setup lang="ts">
const talks = useSection('talks')
</script>

<template>
  <section v-if="talks.length">
    <h2>Recent talks</h2>
    <VitaSection :entries="talks" :limit="3" />
    <NuxtLink to="/cv/#talks">All talks →</NuxtLink>
  </section>
</template>
```

`useSection` returns the validated, public entries, newest first; see
[components and composables](./components.md).

## Not a VitaSection

Where a section should look different from vitakit's standard rows, it is shown
by a component of your own instead, on the same line:
`<TeachingSection id="teaching" title="Teaching" />`. 
`vitakit customize <section> --web` writes one and switches the lines; see [customising
entries](./entries.md).

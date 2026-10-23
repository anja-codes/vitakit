# Publications on the website

A page shows a [publication list](../content/publications.md#lists) with one
line, naming the list:

```vue
<VitaPublications list="all" />
<VitaPublications list="preprints" title="Preprints" />
```

| Prop | |
|---|---|
| `list` | the name of a list in `content/publication-lists.yml` |
| `title` | a heading above it, as for `VitaSection`; group headings are then one level lower |

Which publications, in what order and in which groups, is set in the list, not
on the page — so a list shows the same publications on every page and in the PDF.
To show other publications, change the list or name another one. Nothing is shown
for a list without publications, heading included. A list name that does not
exist fails the build, naming the page and line.

The scaffold's `/publications/` page shows `all`, below the text of
`content/pages/publications.md`. Its home page shows `recent` the way it shows
the recent talks — a heading, the list, and a link to the rest — only when there
is something to show:

```vue
<script setup lang="ts">
const publications = usePublicationList('recent')
</script>

<template>
  <section v-if="publications.count" class="mt-10">
    <h2 class="text-xl font-semibold">Recent publications</h2>
    <VitaPublications list="recent" class="mt-3" />
    <p class="mt-3 text-sm"><NuxtLink to="/publications/">All publications →</NuxtLink></p>
  </section>
</template>
```

`usePublicationList(name)` returns a list as data — `count`, and its `groups`,
each with an optional `label` and its `entries` — for markup of your own.

The publication list can be changed at three depths. `schemas/publications.ts`
decides the statuses, the badges and which further fields reach the website;
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

`VitaPublications` lays out the headings and the lists around the entries; eject it
only to change those.

What goes into `schemas/publications.ts` and `publications.csl`:
[publications](../content/publications.md).

## Classes

Around the entries, `VitaPublications` uses its own classes; inside, `VitaPublication` uses the usual CSL class names, and
the reference itself carries the markup of the citation style:

| Class | Element |
|---|---|
| `vita-publications__title` | the `title` |
| `vita-publications__heading` | a group's heading |
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

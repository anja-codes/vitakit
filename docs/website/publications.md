# Publications on the website

The scaffold's `/publications/` page shows `content/publications.bib`, grouped,
with the text of `content/pages/publications.md` above it:

```vue
<VitaPublications />
<VitaPublications :groups="['published', 'preprint']" :headings="false" />
```

`groups` shows only those groups, in that order; `headings: false` leaves out
the group headings, for a single list. Which groups exist, and which entry is
in which, is decided by the `status` field of each entry and
`schemas/publications.ts` — the same for the website and the PDF.

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

What goes into `schemas/publications.ts` and `publications.csl`:
[publications](../content/publications.md).

## Classes

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

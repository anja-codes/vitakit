# Pages and routes

The website is an ordinary [Nuxt](https://nuxt.com) application in your project,
scaffolded and readable. vitakit adds the content: compiled at build time into
plain data, so nothing content-related reaches the browser — no Markdown parser,
no content database, no mathematics renderer.

```
app/
  pages/index.vue          /             the home page
  pages/cv.vue             /cv/          the CV: one line per section
  pages/publications.vue   /publications/
  pages/[...slug].vue      every other Markdown page
  layouts/default.vue      header, menu, footer
  assets/css/main.css      the design
content/pages/*.md         the text of the pages
```

## Markdown pages

A Markdown file in `content/pages/` is a page: `research.md` is `/research/`,
`index.md` is `/`. Its title and description are front matter (see [profile and
pages](../content/profile-and-pages.md#contentpagesmd)); its body supports
tables, `$mathematics$` and images from `public/`. Without a Vue page of the
same route, `app/pages/[...slug].vue` shows it.

The menu is not derived from the pages: it is the `nav` list in
`content/profile.yml`, so wording and order are yours.

## Pages that show sections

A page that shows sections is a Vue file in `app/pages/`; a concrete route wins
over the Markdown catch-all. The scaffold's CV page is the pattern — the text
of `content/pages/cv.md`, then one line per section:

```vue
<template>
  <article>
    <h1 v-html="page.titleHtml" />
    <VitaMarkdown :html="page.bodyHtml" />

    <VitaSection id="employment" title="Employment" />
    <VitaSection id="education" title="Education" />
    <VitaSection id="talks" title="Talks" />
  </article>
</template>
```

Move a line to move a section; delete it to leave the section out. Nothing is
hidden behind configuration: what you see is what renders. `vitakit add page`
writes a new one, with its Markdown and a menu entry:

::: code-group

```bash [pnpm]
pnpm vitakit add page outreach --title Outreach
```

```bash [npm]
npx vitakit add page outreach --title Outreach
```

:::

and `vitakit add section <name> --page /outreach/` puts sections on it. See
[placing sections](./sections.md).

**Sections are not pages.** A section can appear on any page, several times,
with different selections: teaching and talks on one page, or talks split into
invited and public ones on two.

To remove a page, delete its Markdown file, its Vue file if it has one, and its
menu entry in `content/profile.yml`.

## Paths in the content

Write paths as if the site were served from `/`: links and images such as
`[CV](/cv/)` or `/img/tree.svg` in Markdown, raw HTML (`href`, `src`, `srcset`,
`poster`, …), `profile.avatar` and web-address fields are rewritten for the
deployment base path, so they work locally and under `user.github.io/repo/`
alike. A path hard-coded in a Vue file is not rewritten: use `<NuxtLink>`, or
prefix it with `useRuntimeConfig().app.baseURL`. `pnpm check` finds the ones
that were missed. See [publishing](../guide/publishing.md).

## While you work

`pnpm dev` serves the site at `http://localhost:3000` and reloads on every
change to `content/`, `schemas/` and `app/`. A problem in the content does not
stop it: the page shows the error, a red banner lists every problem, and saving
a fix recovers in place. The same problem fails a build (see [the content
folder](../content/index.md#validated-strictly)).

## In an existing Nuxt project

vitakit is a Nuxt module; the scaffold is only a starting point:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@anja.codes/vitakit/nuxt'],
})
```

It reads `content/` and `schemas/` next to `nuxt.config.ts`, and provides the
[components and composables](./components.md).

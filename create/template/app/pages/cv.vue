<script setup lang="ts">
/**
 * The CV page: several sections composed in the order you want them.
 *
 * Section order, headings and which sections appear are decided here, not in
 * the data — exactly as `cv-tex/cv.tex` decides them for the PDF. One line per
 * section: move a line to move a section, delete it to leave the section out.
 * A section without entries is not shown, heading included.
 */
const profile = useProfile()
const page = usePage('/cv/')

if (!page) {
  throw createError({ statusCode: 404, statusMessage: 'No page for /cv/ (expected content/pages/cv.md)', fatal: true })
}

useHead({
  title: `${page.title} – ${profile.name}`,
  meta: [{ name: 'description', content: page.description ?? profile.summary }],
})
</script>

<template>
  <article>
    <h1 class="text-3xl font-semibold" v-html="page.titleHtml" />
    <VitaMarkdown class="mt-6" :html="page.bodyHtml" />

    <VitaSection id="employment" title="Employment" />
    <VitaSection id="education" title="Education" />
    <VitaSection id="teaching" title="Teaching" />
    <VitaSection id="supervision" title="Supervised theses" />
    <VitaSection id="talks" title="Talks" />
  </article>
</template>

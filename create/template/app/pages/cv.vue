<script setup lang="ts">
/**
 * The CV page: several sections composed in the order you want them.
 *
 * Section order, headings and which sections appear are decided here, not in
 * the data — exactly as `cv.tex` decides them for the PDF.
 */
const profile = useProfile()
const page = usePage('/cv/')

if (!page) {
  throw createError({ statusCode: 404, statusMessage: 'No page for /cv/ (expected content/pages/cv.md)', fatal: true })
}

const sections = [
  { id: 'employment', label: 'Employment' },
  { id: 'education', label: 'Education' },
  { id: 'teaching', label: 'Teaching' },
  { id: 'supervision', label: 'Supervised theses' },
  { id: 'talks', label: 'Talks' },
].filter(section => useSection(section.id).length)

useHead({
  title: `${page.title} – ${profile.name}`,
  meta: [{ name: 'description', content: page.description ?? profile.summary }],
})
</script>

<template>
  <article>
    <h1 class="text-3xl font-semibold" v-html="page.titleHtml" />
    <VitaMarkdown class="mt-6" :html="page.bodyHtml" />

    <section v-for="section in sections" :id="section.id" :key="section.id" class="mt-10">
      <h2 class="text-xl font-semibold">
        {{ section.label }}
      </h2>
      <VitaSection :id="section.id" class="mt-3" />
    </section>
  </article>
</template>

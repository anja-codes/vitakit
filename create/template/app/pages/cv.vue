<script setup lang="ts">
/**
 * The CV page: several sections composed in the order you want them.
 *
 * Section order, headings and which sections appear are decided here, not in
 * the data — exactly as `cv.tex` decides them for the PDF.
 */
const profile = useProfile()
const page = usePage('/cv/')!

const sections = [
  { id: 'employment', label: 'Employment' },
  { id: 'education', label: 'Education' },
  { id: 'teaching', label: 'Teaching' },
  { id: 'supervision', label: 'Supervised theses' },
  { id: 'talks', label: 'Talks' },
]

useHead({
  title: `${page.title} – ${profile.name}`,
  meta: [{ name: 'description', content: page.description ?? profile.summary }],
})
</script>

<template>
  <article>
    <h1 class="text-3xl font-semibold">
      {{ page.title }}
    </h1>
    <VitaMarkdown class="mt-6" :html="page.bodyHtml" />

    <section v-for="section in sections" :key="section.id" class="mt-10">
      <h2 class="text-xl font-semibold">
        {{ section.label }}
      </h2>
      <VitaSection :id="section.id" class="mt-3" />
    </section>
  </article>
</template>

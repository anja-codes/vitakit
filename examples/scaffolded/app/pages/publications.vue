<script setup lang="ts">
/**
 * Prose from `content/pages/publications.md`, then the generated list.
 *
 * This page shadows the Markdown catch-all for `/publications/` — the general
 * escape hatch when a page needs prose *and* components.
 */
const profile = useProfile()
const page = usePage('/publications/')!

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
    <VitaPublications class="mt-8" />
  </article>
</template>

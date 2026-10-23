<script setup lang="ts">
/**
 * Prose from `content/pages/publications.md`, then the generated list.
 *
 * This page shadows the Markdown catch-all for `/publications/` — the general
 * escape hatch when a page needs prose *and* components.
 */
const profile = useProfile()
const page = usePage('/publications/')

if (!page) {
  throw createError({ statusCode: 404, statusMessage: 'No page for /publications/ (expected content/pages/publications.md)', fatal: true })
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
    <VitaPublications list="all" class="mt-8" />
  </article>
</template>

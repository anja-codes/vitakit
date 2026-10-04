<script setup lang="ts">
/**
 * Renders every Markdown page in `content/pages/`.
 *
 * Adding a page means adding a file. When a page needs more than prose, create
 * `app/pages/<name>.vue`: a concrete route always wins over this catch-all.
 */
const profile = useProfile()
const route = useRoute()
const page = usePage(route.path)

if (!page) {
  throw createError({ statusCode: 404, statusMessage: `No page for ${route.path}`, fatal: true })
}

useHead({
  title: page.route === '/' ? profile.name : `${page.title} – ${profile.name}`,
  meta: [{ name: 'description', content: page.description ?? profile.summary }],
})
</script>

<template>
  <article>
    <h1 class="text-3xl font-semibold" v-html="page!.titleHtml" />
    <p v-if="page!.description" class="mt-2 text-neutral-600">
      {{ page!.description }}
    </p>
    <VitaMarkdown class="mt-6" :html="page!.bodyHtml" />
  </article>
</template>

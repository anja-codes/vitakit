<script setup lang="ts">
/**
 * The landing page: who you are, then the prose from
 * `content/pages/index.md`, then a few recent items.
 *
 * This file is yours — reorder it, delete parts, add your own markup.
 */
const profile = useProfile()
const page = usePage('/')
const talks = useSection('talks')

useHead({
  title: profile.name,
  meta: [{ name: 'description', content: profile.summary }],
})
</script>

<template>
  <div>
    <header class="flex flex-wrap items-start gap-6 sm:flex-nowrap">
      <img
        v-if="profile.avatar"
        :src="profile.avatar"
        alt=""
        width="128"
        height="128"
        class="size-32 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
      >
      <div>
        <h1 class="text-3xl font-semibold">
          {{ profile.name }}
        </h1>
        <p v-if="profile.title || profile.affiliation" class="text-neutral-600">
          {{ profile.title }}
          <template v-if="profile.title && profile.affiliation"> · </template>
          <template v-if="profile.affiliation">
            <a v-if="profile.affiliation.url" :href="profile.affiliation.url">{{ profile.affiliation.label }}</a>
            <template v-else>{{ profile.affiliation.label }}</template>
          </template>
        </p>
        <p v-if="profile.email" class="mt-1 text-sm">
          <a :href="`mailto:${profile.email}`">{{ profile.email }}</a>
        </p>
        <VitaLinks :links="profile.links" class="mt-2 text-sm" />
      </div>
    </header>

    <VitaMarkdown v-if="page" class="mt-8" :html="page.bodyHtml" />

    <section v-if="talks.length" class="mt-10">
      <h2 class="text-xl font-semibold">
        Recent talks
      </h2>
      <VitaSection :entries="talks" :limit="3" class="mt-3" />
      <p class="mt-3 text-sm">
        <NuxtLink to="/cv/#talks">
          All talks →
        </NuxtLink>
      </p>
    </section>
  </div>
</template>

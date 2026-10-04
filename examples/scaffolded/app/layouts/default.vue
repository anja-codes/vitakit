<script setup lang="ts">
const profile = useProfile()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Shows content problems while developing; a build fails on them instead. -->
    <VitaIssues />

    <header class="border-b border-neutral-200">
      <div class="mx-auto flex max-w-3xl flex-wrap items-baseline gap-x-6 gap-y-2 px-4 py-6">
        <NuxtLink to="/" class="text-lg font-semibold no-underline">
          {{ profile.name }}
        </NuxtLink>
        <nav class="ml-auto flex gap-4 text-sm">
          <NuxtLink
            v-for="item in profile.nav"
            :key="item.url"
            :to="item.url"
            class="no-underline hover:underline"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <slot />
    </main>

    <footer class="border-t border-neutral-200">
      <div class="mx-auto flex max-w-3xl flex-wrap items-baseline gap-2 px-4 py-6 text-sm text-neutral-600">
        <p>&copy; {{ new Date().getFullYear() }} {{ profile.name }}</p>
        <VitaMarkdown class="ml-auto text-xs text-neutral-400" :html="profile.footerHtml" />
      </div>
    </footer>
  </div>
</template>

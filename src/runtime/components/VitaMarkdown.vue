<script setup lang="ts">
/**
 * Renders build-time Markdown output.
 *
 * The HTML is produced by the vitakit build and is trusted, which is why
 * `v-html` is acceptable here and would not be for user input.
 */
defineProps<{ html?: string }>()
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- build-time rendered Markdown -->
  <div v-if="html" class="vita-prose" v-html="html" />
</template>

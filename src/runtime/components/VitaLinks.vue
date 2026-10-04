<script setup lang="ts">
/** A row of links; external ones get the usual safety attributes. */
import type { Link } from '@anja.codes/vitakit/shared'

defineProps<{ links?: Link[] }>()

const isExternal = (url: string) => /^https?:\/\//.test(url)
</script>

<template>
  <ul v-if="links?.length" class="vita-links">
    <li v-for="item in links" :key="item.url">
      <a
        :href="item.url"
        v-bind="isExternal(item.url) ? { target: '_blank', rel: 'noopener noreferrer' } : {}"
      >{{ item.label }}</a>
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * One reference in a publication list: the reference as the citation style
 * formats it, then its badges.
 *
 * `entry.html` is formatted at build time (title linked, formulas typeset);
 * the badges are data, so a copy of this component can put them anywhere -- a
 * row of buttons, icons, "arXiv:2301.00001" from `badge.value` -- without
 * parsing HTML. `VitaPublications` renders one of these per entry, so ejecting
 * this component alone changes every entry and keeps the grouping.
 */
import type { Publication } from '@anja.codes/vitakit/shared'

defineProps<{ entry: Publication }>()
</script>

<template>
  <li class="csl-entry" :data-csl-entry-id="entry.key">
    <!-- eslint-disable-next-line vue/no-v-html -- build-time formatted, sanitized citation -->
    <span class="vita-bib__text" v-html="entry.html" />
    <!-- Spaces are explicit: the template compiler drops whitespace between lines. -->
    <template v-if="entry.badges.length">
      {{ ' ' }}<span class="bib-links">
        <template v-for="(badge, index) in entry.badges" :key="badge.url">
          {{ index ? ' ' : '' }}<a :class="badge.className" :href="badge.url">{{ badge.label }}</a>
        </template>
      </span>
    </template>
  </li>
</template>

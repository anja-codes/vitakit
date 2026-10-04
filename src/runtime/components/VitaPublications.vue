<script setup lang="ts">
/**
 * Publication groups formatted from `content/publications.bib` at build time.
 *
 * This component lays out the groups; each entry is a `VitaPublication`, which
 * can be ejected on its own to change how a reference looks. Grouping, style
 * and badge fields are configured in `nuxt.config.ts` and
 * `content/publications.csl`.
 */
import { computed } from 'vue'
import { usePublications } from '#imports'

// `withDefaults` is required for the boolean: Vue casts an absent Boolean prop
// to `false`, so `headings` would silently default to off.
const props = withDefaults(defineProps<{
  /** Restrict to these group ids, in this order. */
  groups?: string[]
  /** Show the group label above each list. */
  headings?: boolean
}>(), { groups: undefined, headings: true })

const all = usePublications()
const shown = computed(() => props.groups
  ? props.groups.map(id => all.find(group => group.id === id)).filter(group => group !== undefined)
  : all)
</script>

<template>
  <div class="vita-publications">
    <section v-for="group in shown" :key="group.id" class="vita-publications__group">
      <h2 v-if="headings" class="vita-publications__heading">
        {{ group.label }}
      </h2>
      <ol class="vita-bib csl-bib-body">
        <VitaPublication v-for="entry in group.entries" :key="entry.key" :entry="entry" />
      </ol>
    </section>
  </div>
</template>

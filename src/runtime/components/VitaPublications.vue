<script setup lang="ts">
/**
 * A publication list from `content/publication-lists.yml`, formatted from
 * `content/publications.bib` at build time.
 *
 * Which publications, in what order and in which groups is the list's
 * business; this component decides where it appears and under which heading.
 * Each entry is a `VitaPublication`, which can be ejected on its own to change
 * how a reference looks. Nothing is shown for an empty list, heading included.
 */
import { computed } from 'vue'
import { usePublicationList } from '#imports'

const props = defineProps<{
  /** The list's name in `content/publication-lists.yml`. */
  list: string
  /** A heading above the list. */
  title?: string
}>()

const publications = computed(() => usePublicationList(props.list))
</script>

<template>
  <div v-if="publications.count" class="vita-publications">
    <h2 v-if="title !== undefined" class="vita-publications__title">
      {{ title }}
    </h2>
    <section v-for="group in publications.groups" :key="group.id" class="vita-publications__group">
      <component :is="title !== undefined ? 'h3' : 'h2'" v-if="group.label !== undefined" class="vita-publications__heading">
        {{ group.label }}
      </component>
      <ol class="vita-bib csl-bib-body">
        <VitaPublication v-for="entry in group.entries" :key="entry.key" :entry="entry" />
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * Renders any section without a dedicated component.
 *
 * It shows the fields a vitakit schema is built from -- a date, something
 * title-like, an institution, a note, a link -- and ignores what it does not
 * understand. That is enough to make a newly added `content/<name>.yml` visible
 * immediately; write your own component (or eject one) when you want control.
 */
import { computed } from 'vue'
import { useSection } from '#imports'
import { entrySecondaryParts, entryTitleField, richHtml, type Entry } from '@anja.codes/vitakit/shared'

const props = defineProps<{
  /** Section id; ignored when `entries` is given. */
  id?: string
  entries?: Entry[]
  /** Fields to try, in order, for the main line. */
  titleFields?: string[]
  limit?: number
}>()

const items = computed(() => {
  const source = props.entries ?? (props.id ? useSection(props.id) : [])
  return props.limit ? source.slice(0, props.limit) : source
})

// Which fields are the headline and the context line is decided in
// `@anja.codes/vitakit/shared`, the same code the LaTeX emitter uses; only the
// separator and the markup are decided here.
const titleFieldOf = (entry: Entry): string | undefined =>
  entryTitleField(entry, props.titleFields)

const titleOf = (entry: Entry): string => {
  const field = titleFieldOf(entry)
  return (field && richHtml(entry[field])) || ''
}

const secondaryOf = (entry: Entry): string =>
  entrySecondaryParts(entry, titleFieldOf(entry))
    .map(part => (part.kind === 'institution' ? part.institution.name : part.text))
    .join(' · ')

const linkOf = (entry: Entry): string | undefined =>
  typeof entry.url === 'string' ? entry.url : undefined
</script>

<template>
  <ul v-if="items.length" class="vita-section">
    <VitaEntry v-for="item in items" :key="item.id" :date="item.date as never">
      <p class="vita-entry__title">
        <!-- eslint-disable vue/no-v-html -- build-time rendered Markdown -->
        <a v-if="linkOf(item)" :href="linkOf(item)" v-html="titleOf(item)" />
        <span v-else v-html="titleOf(item)" />
      </p>
      <p v-if="secondaryOf(item)" class="vita-entry__meta">{{ secondaryOf(item) }}</p>
      <p v-if="typeof item.note === 'string'" class="vita-entry__note">{{ item.note }}</p>
    </VitaEntry>
  </ul>
</template>

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

const termOf = (entry: Entry): string | undefined =>
  typeof entry.term === 'string' && entry.term.length > 0 ? entry.term : undefined

const secondaryOf = (entry: Entry) =>
  // A teaching term belongs in the date column, not in both places. Keep this
  // web-only choice out of the shared field selection used by LaTeX.
  entrySecondaryParts(termOf(entry) ? { ...entry, term: undefined } : entry, titleFieldOf(entry))

const linkOf = (entry: Entry): string | undefined =>
  typeof entry.url === 'string' ? entry.url : undefined
</script>

<template>
  <ul v-if="items.length" class="vita-section">
    <VitaEntry v-for="item in items" :key="item.id" :date="item.date as never">
      <template v-if="termOf(item)" #date>{{ termOf(item) }}</template>
      <p class="vita-entry__title">
        <!-- eslint-disable vue/no-v-html -- build-time rendered Markdown -->
        <a v-if="linkOf(item)" :href="linkOf(item)" v-html="titleOf(item)" />
        <span v-else v-html="titleOf(item)" />
        <span v-if="item.ongoing === true" class="vita-entry__status"> (in progress)</span>
      </p>
      <p v-if="secondaryOf(item).length" class="vita-entry__meta">
        <template v-for="(part, index) in secondaryOf(item)" :key="index">
          <template v-if="index"> · </template>
          <template v-if="part.kind === 'institution'">
            <a v-if="part.institution.url" :href="part.institution.url">{{ part.institution.name }}</a>
            <template v-else>{{ part.institution.name }}</template>
          </template>
          <template v-else>{{ part.text }}</template>
        </template>
      </p>
      <p v-if="typeof item.note === 'string'" class="vita-entry__note">{{ item.note }}</p>
      <p v-if="typeof item.slides === 'string' && item.slides" class="vita-entry__links">
        <a :href="item.slides">Slides</a>
      </p>
    </VitaEntry>
  </ul>
</template>

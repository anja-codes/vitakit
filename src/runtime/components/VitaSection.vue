<script setup lang="ts" generic="Id extends string = string">
/**
 * A generic section with conventional field selection and optional overrides.
 *
 * title/meta/note slots replace those regions; the default slot replaces the
 * whole entry body. The list, row and date column remain owned by vitakit.
 *
 * With `title`, the list comes with its heading, in a <section> carrying the
 * section id as anchor, and neither appears when there are no entries -- the
 * website's `\vitasection[Title]{id}`.
 */
import { computed, type VNodeChild } from 'vue'
import { useSection } from '#imports'
import {
  entrySecondaryParts,
  entryTitleField,
  filterWhere,
  richHtml,
  type DateRange,
  type Entry,
  type SectionEntries,
  type VitaSectionSlotProps,
  type Where,
} from '@anja.codes/vitakit/shared'

const props = defineProps<{
  /** Section id; ignored when `entries` is given. */
  id?: Id
  entries?: SectionEntries<Id>
  /** Fields to try, in order, for the main line. */
  titleFields?: string[]
  /** Only entries whose fields have these values, as `where` in a PDF document. */
  where?: Where
  limit?: number
  /** A heading; the list is then wrapped in a <section> with the id as anchor. */
  title?: string
}>()

type Row = VitaSectionSlotProps<SectionEntries<Id>[number]>
const slots = defineSlots<{
  title?(props: Row): VNodeChild
  meta?(props: Row): VNodeChild
  note?(props: Row): VNodeChild
  default?(props: Row): VNodeChild
}>()

const rows = computed(() => {
  const source = filterWhere((props.entries ?? (props.id ? useSection(props.id) : [])) as Entry[], props.where)
  const items = props.limit ? source.slice(0, props.limit) : source
  return items.map((entry, index): Row => {
    // Field selection remains shared with the emitter; only the web-specific
    // presentation (such as a term replacing the date) is decided here.
    const titleField = entryTitleField(entry, props.titleFields)
    const term = typeof entry.term === 'string' && entry.term.length > 0 ? entry.term : undefined
    return {
      entry: entry as Row['entry'],
      index,
      display: {
        titleHtml: (titleField && richHtml(entry[titleField])) || '',
        titleUrl: typeof entry.url === 'string' ? entry.url : undefined,
        date: entry.date as DateRange | undefined,
        term,
        meta: entrySecondaryParts(term ? { ...entry, term: undefined } : entry, titleField),
        note: typeof entry.note === 'string' ? entry.note : undefined,
        links: typeof entry.slides === 'string' && entry.slides ? [{ label: 'Slides', url: entry.slides }] : [],
        ongoing: entry.ongoing === true,
      },
    }
  })
})
</script>

<template>
  <!-- With a title: the same component without one, inside its section. -->
  <section v-if="title !== undefined && rows.length" :id="id" class="vita-section-group">
    <h2 class="vita-section-group__title">
      {{ title }}
    </h2>
    <VitaSection :entries="rows.map(row => row.entry as Entry)" :title-fields="titleFields">
      <template v-for="(_, name) in slots" #[name]="scope">
        <slot :name="name" v-bind="scope" />
      </template>
    </VitaSection>
  </section>
  <ul v-else-if="title === undefined && rows.length" class="vita-section">
    <VitaEntry v-for="row in rows" :key="row.entry.id" :date="row.display.date">
      <template v-if="row.display.term" #date>{{ row.display.term }}</template>
      <!-- Check presence explicitly: an intentionally empty slot must not
           bring back Vue's slot fallback (or an empty default wrapper). -->
      <slot v-if="slots.default" v-bind="row" />
      <template v-else>
        <slot v-if="slots.title" name="title" v-bind="row" />
        <p v-else class="vita-entry__title">
          <!-- eslint-disable vue/no-v-html -- build-time rendered Markdown -->
          <a v-if="row.display.titleUrl" :href="row.display.titleUrl" v-html="row.display.titleHtml" />
          <span v-else v-html="row.display.titleHtml" />
          <span v-if="row.display.ongoing" class="vita-entry__status"> (in progress)</span>
        </p>
        <slot v-if="slots.meta" name="meta" v-bind="row" />
        <p v-else-if="row.display.meta.length" class="vita-entry__meta">
          <template v-for="(part, index) in row.display.meta" :key="index">
            <template v-if="index"> · </template>
            <template v-if="part.kind === 'linked'">
              <a v-if="part.linked.url" :href="part.linked.url">{{ part.linked.label }}</a>
              <template v-else>{{ part.linked.label }}</template>
            </template>
            <template v-else>{{ part.text }}</template>
          </template>
        </p>
        <slot v-if="slots.note" name="note" v-bind="row" />
        <p v-else-if="row.display.note !== undefined" class="vita-entry__note">{{ row.display.note }}</p>
        <p v-if="row.display.links.length" class="vita-entry__links">
          <a v-for="link in row.display.links" :key="link.url" :href="link.url">{{ link.label }}</a>
        </p>
      </template>
    </VitaEntry>
  </ul>
</template>

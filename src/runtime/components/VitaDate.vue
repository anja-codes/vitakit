<script setup lang="ts">
/** A date or span, formatted identically on the website and in the PDF. */
import { computed } from 'vue'
import { formatDateRange, type DateRange } from '@anja.codes/vitakit/shared'

const props = defineProps<{
  value?: DateRange
  locale?: string
  presentLabel?: string
}>()

const label = computed(() => formatDateRange(props.value, {
  locale: props.locale,
  presentLabel: props.presentLabel,
}))
</script>

<template>
  <time v-if="label" class="vita-date" :datetime="value?.from.raw">{{ label }}</time>
</template>

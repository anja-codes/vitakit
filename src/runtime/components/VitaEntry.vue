<script setup lang="ts">
/**
 * One row of a section: a date column and free content.
 *
 * This is the shape every built-in section component uses, so ejecting one and
 * restyling it does not require reproducing the layout primitives.
 */
import type { DateRange } from '@anja.codes/vitakit/shared'

defineProps<{ date?: DateRange }>()
</script>

<template>
  <li class="vita-entry">
    <div class="vita-entry__date">
      <slot name="date">
        <VitaDate :value="date" />
      </slot>
    </div>
    <div class="vita-entry__body">
      <slot />
    </div>
  </li>
</template>

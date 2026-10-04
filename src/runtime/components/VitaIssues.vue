<script setup lang="ts">
/**
 * Development-only banner listing content problems.
 *
 * A build fails on any of these, so `issues` is always empty in production and
 * this component renders nothing there.
 */
import { useVitakit } from '#imports'

const { issues } = useVitakit()
</script>

<template>
  <aside v-if="issues.length" class="vita-issues">
    <p class="vita-issues__title">
      {{ issues.length }} content problem{{ issues.length > 1 ? 's' : '' }} — the build would fail.
    </p>
    <ul>
      <li v-for="issue in issues" :key="issue.where + issue.message">
        <code>{{ issue.where }}</code>
        <pre>{{ issue.message }}</pre>
      </li>
    </ul>
  </aside>
</template>

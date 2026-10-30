<script setup lang="ts">
const profile = useProfile()
const route = useRoute()

// Mobile menu (below the `lg` breakpoint, i.e. md and smaller screens).
const menuOpen = ref(false)
const menuButton = ref<HTMLButtonElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)

function openMenu() {
  menuOpen.value = true
}

function closeMenu() {
  menuOpen.value = false
}

// Close after navigating, so the new page is visible.
watch(() => route.fullPath, closeMenu)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

// Lock page scrolling while the menu is open, and move focus into the
// panel (and back to the toggle when it closes).
watch(menuOpen, async (open) => {
  if (!import.meta.client) return
  const root = document.documentElement
  if (open) {
    // Keep the layout from shifting when the scrollbar disappears.
    const scrollbar = window.innerWidth - root.clientWidth
    root.style.overflow = 'hidden'
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`
    document.addEventListener('keydown', onKeydown)
    await nextTick()
    closeButton.value?.focus()
  } else {
    unlockPage()
    menuButton.value?.focus()
  }
})

function unlockPage() {
  const root = document.documentElement
  root.style.overflow = ''
  root.style.paddingRight = ''
  document.removeEventListener('keydown', onKeydown)
}

// Close the menu if the window grows past the mobile breakpoint.
let desktopQuery: MediaQueryList | undefined
function onBreakpointChange(event: MediaQueryListEvent) {
  if (event.matches) closeMenu()
}

onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 64rem)')
  desktopQuery.addEventListener('change', onBreakpointChange)
})

onBeforeUnmount(() => {
  desktopQuery?.removeEventListener('change', onBreakpointChange)
  unlockPage()
})
</script>

<template>
  <div>
    <!-- `inert` keeps the page behind the open menu from being focused or clicked. -->
    <div class="min-h-screen flex flex-col" :inert="menuOpen">
      <!-- Shows content problems while developing; a build fails on them instead. -->
      <VitaIssues />

      <header class="border-b border-neutral-200">
        <div class="mx-auto flex max-w-3xl items-center gap-x-6 px-4 py-6">
          <NuxtLink to="/" class="text-lg font-semibold no-underline">
            {{ profile.name }}
          </NuxtLink>

          <!-- Desktop navigation -->
          <nav class="ml-auto hidden gap-4 text-sm lg:flex" aria-label="Main">
            <NuxtLink
              v-for="item in profile.nav"
              :key="item.url"
              :to="item.url"
              class="no-underline hover:underline"
            >
              {{ item.label }}
            </NuxtLink>
          </nav>

          <!-- Mobile menu toggle -->
          <button
            ref="menuButton"
            type="button"
            class="-mr-2 ml-auto rounded p-2 text-neutral-700 hover:bg-neutral-100 lg:hidden"
            aria-controls="mobile-menu"
            :aria-expanded="menuOpen"
            @click="openMenu"
          >
            <span class="sr-only">Open menu</span>
            <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
            </svg>
          </button>
        </div>
      </header>

      <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <slot />
      </main>

      <footer class="border-t border-neutral-200">
        <div class="mx-auto flex max-w-3xl flex-wrap items-baseline gap-2 px-4 py-6 text-sm text-neutral-600">
          <p>&copy; {{ new Date().getFullYear() }} {{ profile.name }}</p>
          <VitaMarkdown class="ml-auto text-xs text-neutral-400" :html="profile.footerHtml" />
        </div>
      </footer>
    </div>

    <!-- Mobile slide-over menu -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-300 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="menuOpen"
          class="fixed inset-0 z-40 bg-neutral-900/40 lg:hidden"
          aria-hidden="true"
          @click="closeMenu"
        />
      </Transition>

      <Transition
        enter-active-class="transition-transform duration-300 ease-out"
        enter-from-class="translate-x-full"
        leave-active-class="transition-transform duration-200 ease-in"
        leave-to-class="translate-x-full"
      >
        <div
          v-if="menuOpen"
          id="mobile-menu"
          class="fixed inset-y-0 right-0 z-50 flex w-full max-w-xs flex-col overflow-y-auto bg-white shadow-xl lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div class="flex items-center justify-between border-b border-neutral-200 px-4 py-6">
            <span class="text-lg font-semibold">{{ profile.name }}</span>
            <button
              ref="closeButton"
              type="button"
              class="-mr-2 rounded p-2 text-neutral-700 hover:bg-neutral-100"
              @click="closeMenu"
            >
              <span class="sr-only">Close menu</span>
              <svg class="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav class="flex flex-col px-2 py-4" aria-label="Main">
            <NuxtLink
              v-for="item in profile.nav"
              :key="item.url"
              :to="item.url"
              class="rounded px-2 py-3 text-base no-underline hover:bg-neutral-100"
              active-class="font-semibold"
              @click="closeMenu"
            >
              {{ item.label }}
            </NuxtLink>
          </nav>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

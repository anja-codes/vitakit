/**
 * Access to the content compiled by the vitakit Nuxt module.
 *
 * These are plain imports of a build-time generated module: fully typed, no
 * loading state, no network request, and only what a page uses ends up in its
 * chunk.
 */
import content from '#vitakit/content'
import type { Entry, Page, Profile, PublicationGroup, VitakitContent } from '@anja.codes/vitakit/shared'

export function useVitakit(): VitakitContent {
  return content
}

export function useProfile(): Profile {
  return content.profile
}

/**
 * Entries of one section, already validated, visibility-filtered and sorted
 * newest first.
 *
 * Unknown ids return an empty list rather than throwing, so deleting a content
 * file cannot break a page that still mentions it.
 */
export function useSection(id: string): Entry[] {
  return content.sections[id] ?? []
}

/** All section ids that have content. */
export function useSectionIds(): string[] {
  return Object.keys(content.sections)
}

export function usePublications(): PublicationGroup[] {
  return content.publications
}

/** The page for a route, or `undefined`. Routes always end with a slash. */
export function usePage(route: string): Page | undefined {
  const normalised = route.endsWith('/') ? route : `${route}/`
  return content.pages.find((page: Page) => page.route === normalised)
}

export function usePages(): Page[] {
  return content.pages
}

/**
 * Access to the content compiled by the vitakit Nuxt module.
 *
 * These are plain imports of a build-time generated module: fully typed, no
 * loading state, no network request, and only what a page uses ends up in its
 * chunk.
 */
import content from '#vitakit/content'
import type { Entry, Page, Profile, PublicationList, VitakitContent } from '@anja.codes/vitakit/shared'

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

/**
 * A list declared in `content/publication-lists.yml`, formatted at build time.
 *
 * Unlike a section, an unknown name is an error: a list is declared on
 * purpose, so a name that matches none is a typo. Builds report it before
 * this runs.
 */
export function usePublicationList(name: string): PublicationList {
  if (Object.hasOwn(content.publications, name)) return content.publications[name]!
  const names = Object.keys(content.publications)
  throw new Error(name
    ? `no publication list "${name}" in content/publication-lists.yml; the lists are ${names.join(', ') || '(none)'}`
    : 'VitaPublications needs a list, e.g. <VitaPublications list="all" />; the lists are in content/publication-lists.yml')
}

/** The page for a route, or `undefined`. Routes always end with a slash. */
export function usePage(route: string): Page | undefined {
  const normalised = route.endsWith('/') ? route : `${route}/`
  return content.pages.find((page: Page) => page.route === normalised)
}

export function usePages(): Page[] {
  return content.pages
}

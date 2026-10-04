/**
 * `@anja.codes/vitakit` — the build-time API.
 *
 * Imported by a user's `schemas/*.ts` (for `z`, `section`, `dateRange`, …) and
 * by scripts that need the compiled content. Runtime composables and
 * components come from the Nuxt module; helpers shared with them (dates, rich
 * text, entry fields) from `@anja.codes/vitakit/shared`.
 */
export { z, text, richText, url, dateRange, institution, link, visibility, entry, section } from './primitives'
export {
  schemas,
  extendSection,
  education,
  employment,
  teaching,
  talks,
  supervision,
  type BuiltinSection,
} from './schemas'

export { loadContent, type LoadContentOptions } from './content'
export {
  publications,
  badgePresets,
  type BadgeConfig,
  type PublicationGroupConfig,
  type PublicationsInput,
} from './publications'

export type {
  ContentIssue,
  DatePoint,
  DateRange,
  Entry,
  EntryBase,
  Institution,
  Link,
  Page,
  Profile,
  Publication,
  PublicationBadge,
  PublicationGroup,
  RichText,
  VitakitContent,
  Visibility,
} from './shared/types'

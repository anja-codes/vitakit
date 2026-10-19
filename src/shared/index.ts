/**
 * Dependency-free code shared by the build and the browser.
 *
 * The runtime (components, composables) must import from here, never from
 * `@anja.codes/vitakit`: that entry pulls in citation-js, remark and KaTeX, which
 * would then be bundled into the client even though they only ever run at build
 * time.
 */
export { formatDateRange, dateSortKey, type DateFormatOptions } from './format'
export {
  entryTitleField,
  entrySecondaryParts,
  TITLE_FIELDS,
  SECONDARY_FIELDS,
  LINKED_FIELDS,
  type SecondaryPart,
  type VitaSectionDisplay,
  type VitaSectionSlotProps,
} from './entry'
export { richSource, richHtml } from './rich'
export type * from './types'

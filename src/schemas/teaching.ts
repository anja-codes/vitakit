/**
 * Shape of `content/teaching.yml`.
 *
 * Also the file `vitakit eject teaching` copies into a project, with the import
 * rewritten to `@anja.codes/vitakit`; it is therefore the single definition of
 * this section, not a copy of one.
 */
import { dateRange, institution, richText, section, text, url } from '../primitives'

export default section({
  date: dateRange,
  title: richText,
  role: text.optional(),
  institution: institution.optional(),
  /** e.g. `2024S`, `Winter 2023/24` -- free text, shown as written. */
  term: text.optional(),
  url: url.optional(),
  note: text.optional(),
})

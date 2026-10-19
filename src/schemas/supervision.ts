/**
 * Shape of `content/supervision.yml`.
 *
 * Also the file `vitakit eject supervision` copies into a project, with the import
 * rewritten to `@anja.codes/vitakit`; it is therefore the single definition of
 * this section, not a copy of one.
 */
import { dateRange, linked, richText, section, text, z } from '../primitives'

export default section({
  date: dateRange,
  student: text,
  /** A thesis still in progress; shown as such instead of as completed. */
  ongoing: z.boolean().default(false),
  /** Markdown, math allowed. */
  title: richText,
  degree: text.optional(),
  institution: linked.optional(),
  coSupervisor: text.optional(),
})

/**
 * Shape of `content/education.yml`.
 *
 * Also the file `vitakit eject education` copies into a project, with the import
 * rewritten to `@anja.codes/vitakit`; it is therefore the single definition of
 * this section, not a copy of one.
 */
import { dateRange, linked, richText, section, text, url, z } from '../primitives'

export default section({
  date: dateRange,
  degree: text,
  institution: linked,
  thesis: z.strictObject({
    title: richText,
    type: text.optional(),
    supervisor: linked.optional(),
    url: url.optional(),
  }).optional(),
  note: text.optional(),
})

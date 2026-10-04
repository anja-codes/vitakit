/**
 * Shape of `content/employment.yml`.
 *
 * Also the file `vitakit eject employment` copies into a project, with the import
 * rewritten to `@anja.codes/vitakit`; it is therefore the single definition of
 * this section, not a copy of one.
 */
import { dateRange, institution, richText, section, text, url, z } from '../primitives'

export default section({
  date: dateRange,
  position: text,
  institution,
  project: z.strictObject({
    title: richText,
    funder: text.optional(),
    grant: text.optional(),
    url: url.optional(),
  }).optional(),
  note: text.optional(),
})

/**
 * Shape of `content/talks.yml`.
 *
 * Also the file `vitakit customize talks --schema --copy` writes into a project, with the import
 * rewritten to `@anja.codes/vitakit`; it is therefore the single definition of
 * this section, not a copy of one.
 */
import { dateRange, richText, section, text, url, z } from '../primitives'

export default section({
  date: dateRange,
  /** Markdown, math allowed. */
  title: richText,
  event: text.optional(),
  location: text.optional(),
  kind: z.enum(['invited', 'contributed', 'seminar', 'poster', 'outreach']).optional(),
  url: url.optional(),
  slides: url.optional(),
})

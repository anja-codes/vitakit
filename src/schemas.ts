/**
 * Built-in schemas, one per `content/<name>.yml`.
 *
 * All are exported individually so a user can extend one in `schemas/<name>.ts`:
 *
 * ```ts
 * import { schemas, z } from '@anja.codes/vitakit'
 * export default schemas.teaching.extend({ evaluationScore: z.number().optional() })
 * ```
 *
 * `.extend()` works because each is an array of strict objects; extending the
 * element type is done through `extendSection` below, which keeps the array
 * wrapper in place.
 */
import { absoluteUrl, linked, requiredLink, text, z } from './primitives'

// One file per section, so that `vitakit eject <section>` can copy the
// definition itself rather than a paraphrase of it.
import education from './schemas/education'
import employment from './schemas/employment'
import teaching from './schemas/teaching'
import talks from './schemas/talks'
import supervision from './schemas/supervision'

export { education, employment, teaching, talks, supervision }

export const profile = z.strictObject({
  name: text,
  title: text.optional(),
  affiliation: linked.optional(),
  email: z.string().trim().email().optional(),
  links: z.array(requiredLink).default([]),
  /**
   * One or two sentences for metadata: the page description and social
   * previews. Prose belongs in `content/pages/index.md`, which is where a
   * reader sees it -- this is deliberately not rendered on the page.
   */
  summary: text.optional(),
  /**
   * Where the website is published, e.g. `https://jane.example.org/` or
   * `https://jane.github.io/site/`. The PDF needs it to link paths on the site
   * such as `/slides/talk.pdf`; the website itself does not.
   */
  url: absoluteUrl.optional(),
  /** Path below `public/`, e.g. `/img/portrait.jpg`. */
  avatar: text.startsWith('/').optional(),
  /** Navigation, in the order it should appear. */
  nav: z.array(z.strictObject({ label: text, to: text })).default([]),
  /** Footer line; inline Markdown. */
  footer: text.optional(),
})

export const page = z.strictObject({
  title: text,
  description: text.optional(),
  route: text.regex(/^\/(?:[a-z0-9-]+\/)*$/, 'expected a route like /research/').optional(),
  order: z.number().int().default(100),
})

/** Every built-in section, keyed by its `content/<name>.yml` file name. */
export const schemas = {
  education,
  employment,
  teaching,
  talks,
  supervision,
} as const

export type BuiltinSection = keyof typeof schemas

/**
 * Extend a built-in section's *entry* shape, keeping the array wrapper.
 *
 * ```ts
 * export default extendSection(schemas.teaching, { evaluationScore: z.number().optional() })
 * ```
 */
export function extendSection<Shape extends z.ZodRawShape>(
  base: z.ZodArray<z.ZodObject<z.ZodRawShape>>,
  shape: Shape,
) {
  return z.array(base.element.extend(shape))
}

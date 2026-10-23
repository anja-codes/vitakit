/**
 * `schemas/publications.ts`: the statuses of `content/publications.bib`, and
 * how references are linked and formatted.
 *
 * Like a section schema, it is a file in the project that the website,
 * `vitakit verify` and the PDF all read, so the three cannot disagree about
 * which statuses exist. `vitakit customize publications` writes the defaults
 * (`src/schemas/publications.ts`) as a starting point. Which publications a
 * list shows is decided in `content/publication-lists.yml`.
 */
import { z } from 'zod'
import { badgePresets, type BadgeConfig } from '@behackl/citation-js-extras'
import { fail, formatZodIssues } from './issues'

export { badgePresets }
export type { BadgeConfig }

export interface PublicationStatusConfig {
  /** A value of the `status` field; lowercase, e.g. `preprint` or `talk-slides`. */
  id: string
  /** Heading of its group, on the website and in the PDF. */
  label: string
}

/** What `schemas/publications.ts` may set; everything is optional. */
export interface PublicationsInput {
  /** The values of `status`, in the order their groups appear. */
  statuses?: PublicationStatusConfig[]
  /** The status of an entry without one. Defaults to the first status. */
  defaultStatus?: string
  /** BibTeX fields that become links after a reference, on the website. */
  badges?: BadgeConfig[]
  /** Further BibTeX fields to hand to the website, as `entry.fields`. */
  fields?: string[]
  /**
   * A built-in CSL style (`apa`, `vancouver`, ...) or a path relative to the
   * project. Not needed for `content/publications.csl`, which is found anyway.
   */
  cslStyle?: string
}

/** The validated settings, defaults filled in. */
export interface PublicationsSchema {
  statuses: PublicationStatusConfig[]
  defaultStatus: string
  badges: BadgeConfig[]
  fields: string[]
  cslStyle?: string
}

/**
 * Typing for `schemas/publications.ts`; the file is validated when it is
 * loaded, so that problems are reported with its name.
 */
export function publications(input: PublicationsInput): PublicationsInput {
  return input
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const callable = z.custom<Exclude<BadgeConfig['label'], string>>(value => typeof value === 'function', 'expected a function')

const badge = z.strictObject({
  field: z.string().min(1),
  label: z.union([z.string(), callable]),
  url: z.union([z.string(), callable]),
  match: z.instanceof(RegExp).optional(),
  split: z.union([z.string(), z.instanceof(RegExp)]).optional(),
  className: z.string().optional(),
})

const input = z.strictObject({
  statuses: z.array(z.strictObject({
    id: z.string().regex(ID, 'expected a lowercase id such as `preprint` or `talk-slides`'),
    label: z.string().trim().min(1),
  })).min(1, 'expected at least one status').optional(),
  defaultStatus: z.string().optional(),
  badges: z.array(badge).optional(),
  fields: z.array(z.string().regex(/^[a-z][a-z0-9_-]*$/i, 'expected a BibTeX field name')).optional(),
  cslStyle: z.string().trim().min(1).optional(),
})

/**
 * Validate settings and fill in defaults. `where` names the file in errors;
 * `defaults` are the package's own settings (`src/schemas/publications.ts`).
 */
export function resolvePublications(
  value: unknown,
  defaults: PublicationsSchema = { statuses: [], defaultStatus: '', badges: [], fields: [] },
  where = 'schemas/publications.ts',
): PublicationsSchema {
  const renamed = ['groups', 'defaultGroup'].filter(key => typeof value === 'object' && value !== null && Object.hasOwn(value, key))
  if (renamed.length) {
    fail(where, `${renamed.join(' and ')} ${renamed.length > 1 ? 'are' : 'is'} now called ${renamed.map(key => key === 'groups' ? 'statuses' : 'defaultStatus').join(' and ')}; \`vitakit migrate\` renames ${renamed.length > 1 ? 'them' : 'it'}`)
  }
  const parsed = input.safeParse(value)
  if (!parsed.success) fail(where, `invalid\n${formatZodIssues(parsed.error)}`)

  const statuses = parsed.data.statuses ?? defaults.statuses
  const ids = statuses.map(status => status.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate) fail(where, `status "${duplicate}" is defined twice`)

  const defaultStatus = parsed.data.defaultStatus ?? (parsed.data.statuses ? ids[0]! : defaults.defaultStatus)
  if (!ids.includes(defaultStatus)) {
    fail(where, `defaultStatus "${defaultStatus}" is not one of the statuses (${ids.join(', ')})`)
  }

  return {
    statuses,
    defaultStatus,
    badges: parsed.data.badges ?? defaults.badges,
    fields: parsed.data.fields ?? defaults.fields,
    ...(parsed.data.cslStyle ? { cslStyle: parsed.data.cslStyle } : {}),
  }
}

/**
 * The contract between the build (Node) and the app (Vue).
 *
 * Everything with an `Html` suffix is trusted markup produced at build time;
 * render it with `v-html`. Nothing here is a Zod schema: schemas describe what
 * a user may *write*, these types describe what a component *receives*.
 */

/** How widely an entry may be shown. */
export type Visibility = 'public' | 'cv' | 'private'

/** A calendar point with the precision the user actually wrote. */
export interface DatePoint {
  /** ISO-ish source: `2024`, `2024-03`, or `2024-03-15`. */
  raw: string
  year: number
  month?: number
  day?: number
  /** Sort key: always comparable across precisions. */
  sortKey: string
}

/** A point in time or a span, normalised from what the user wrote. */
export interface DateRange {
  from: DatePoint
  /** Absent for a single date or an ongoing range; see `ongoing`. */
  to?: DatePoint
  /** True when the user wrote `to: present`. */
  ongoing: boolean
  /** Whether the source was a single date rather than a range. */
  point: boolean
}

/**
 * Intermediate form of a `richText` field, before rendering.
 *
 * Internal: it exists only between validation and `renderRichFields`, never in
 * a `VitakitContent`. `vitakit-check` fails the build if one reaches the output.
 * Read rich fields with `richSource` / `richHtml` instead of inspecting shapes.
 */
export interface RichTextMarker {
  __vitakitRich: string
}

/** A field that went through the Markdown/KaTeX renderer. */
export interface RichText {
  /** The Markdown source, for plain-text contexts such as `title` attributes. */
  text: string
  /** Rendered inline HTML; use with `v-html`. */
  html: string
}

export interface Link {
  label: string
  url: string
}

export interface Institution {
  name: string
  url?: string
}

/** Fields every section entry has, whatever else its schema adds. */
export interface EntryBase {
  /** Stable identity for `v-for` keys: the source file plus the index. */
  id: string
  visibility: Visibility
}

/** A validated entry of an arbitrary section. */
export type Entry = EntryBase & Record<string, unknown>

/** A link after a reference: DOI, arXiv, MR, zbMATH, or a badge of your own. */
export interface PublicationBadge {
  /** The BibTeX field it comes from, e.g. `doi`. */
  field: string
  /** The identifier as matched, e.g. `10.1000/xyz` or `2301.00001`. */
  value: string
  label: string
  /** Ready to use: root-relative URLs already carry the base path. */
  url: string
  /** The badge's `className`; `vita-badge` for the built-in ones. */
  className?: string
}

/** One formatted reference. */
export interface Publication {
  /** Citation key in the .bib file. */
  key: string
  /**
   * The reference as the citation style formats it, title linked, formulas
   * typeset; without the badges. Sanitized HTML.
   */
  html: string
  /** Where the title links to, if anywhere (already in `html`). */
  titleUrl?: string
  badges: PublicationBadge[]
  /**
   * The BibTeX fields listed under `fields` in `schemas/publications.ts`, as
   * written in the .bib file, where the entry has them.
   */
  fields: Record<string, string>
}

/** One group of formatted references, e.g. all preprints. */
export interface PublicationGroup {
  id: string
  label: string
  count: number
  /**
   * Newest first. Formatted together, so numbering and year suffixes
   * (2024a, 2024b) are right within the group.
   */
  entries: Publication[]
}

export interface Page {
  /** Route path, with leading and trailing slash: `/`, `/research/`. */
  route: string
  title: string
  /** Rendered inline Markdown; math allowed. */
  titleHtml: string
  description?: string
  order: number
  /** Rendered Markdown body. */
  bodyHtml: string
  /** Set only in development, when the page could not be built. */
  error?: string
}

export interface Profile {
  name: string
  title?: string
  affiliation?: Institution
  email?: string
  links: Link[]
  /** Short plain-text description used for page metadata, not rendered. */
  summary?: string
  /**
   * Where the website is published, e.g. `https://jane.example.org/`. Links
   * to paths on the site (`/slides/talk.pdf`) need it to work in the PDF.
   */
  url?: string
  avatar?: string
  /** Navigation entries, as written. */
  nav: Link[]
  /** Rendered inline Markdown, or an empty string. */
  footerHtml: string
}

/** A content problem, reported in the browser during development. */
export interface ContentIssue {
  /** The file it belongs to, e.g. `content/talks.yml`. */
  where: string
  message: string
}

/** Everything compiled from `content/`, as the app sees it. */
export interface VitakitContent {
  profile: Profile
  pages: Page[]
  /** Section id -> validated, sorted, visibility-filtered entries. */
  sections: Record<string, Entry[]>
  publications: PublicationGroup[]
  /** Always empty in a production build, which fails instead. */
  issues: ContentIssue[]
}

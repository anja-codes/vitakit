/**
 * `@anja.codes/vitakit/tex` — the LaTeX side.
 *
 * Kept as its own entry so that importing the web pipeline does not pull in the
 * template engine, and vice versa.
 */
export { buildCv, readGenerated, MissingToolError, type BuildOptions, type BuildEvent } from './tex/build'
export {
  emitDocument,
  renderSection,
  renderPublications,
  resolveTemplate,
  bundledTexDir,
  type EmitOptions,
  type ResolvedTemplate,
} from './tex/emit'
export {
  discoverDocuments,
  selectEntries,
  documentSchema,
  type DocumentOptions,
  type DocumentSource,
} from './tex/documents'
export { escapeTex, escapeRichTex, escapeUrl, type EscapeOptions } from './tex/escape'

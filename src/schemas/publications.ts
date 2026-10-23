/**
 * The statuses of `content/publications.bib`, and how references are linked
 * -- on the website, in `vitakit verify` and in the PDF alike. Which
 * publications a list shows is decided in `content/publication-lists.yml`.
 *
 * Also the file `vitakit customize publications` writes into a project, with the
 * import rewritten to `@anja.codes/vitakit`; it is therefore the single definition
 * of the defaults, not a copy of them. Every setting is optional: leave out
 * what you do not change.
 */
import { badgePresets, publications } from '../publications'

export default publications({
  /**
   * The values of the `status` field, with the heading of their group, in
   * the order the groups appear in a list grouped by status. A status that
   * is not listed here is an error, in any capitalisation.
   */
  statuses: [
    { id: 'published', label: 'Published' },
    { id: 'accepted', label: 'Accepted' },
    { id: 'preprint', label: 'Preprints' },
    { id: 'software', label: 'Software' },
    { id: 'other', label: 'Other' },
  ],

  /** The status of an entry without one; the first status if left out. */
  defaultStatus: 'published',

  /**
   * BibTeX fields that become links after a reference on the website. The
   * presets accept the spellings real exports use (`doi:10...`, doi.org URLs,
   * `arXiv:...`, `MR1234567`, `Zbl 1234.56789`) and biblatex's `eprint`. A
   * badge of your own, e.g. for slides in `public/slides/`:
   *
   *   { field: 'slides', label: 'Slides', url: '/slides/$1.pdf', className: 'vita-badge' }
   */
  badges: [
    { ...badgePresets.doi, className: 'vita-badge' },
    { ...badgePresets.arxiv, className: 'vita-badge' },
    { ...badgePresets.mrnumber, className: 'vita-badge' },
    { ...badgePresets.zbl, className: 'vita-badge' },
  ],

  /**
   * Further BibTeX fields a component can show, as `entry.fields.<name>`,
   * e.g. `['project']` for a copy of VitaPublication that names the project.
   */
  fields: [],
})

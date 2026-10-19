# The content folder

Everything that is *about you* lives in `content/`: YAML for lists of entries,
Markdown for prose, BibTeX for publications. Both the website and the PDF are
made from it.

```
content/
  profile.yml           name, affiliation, links, menu, footer
  <section>.yml         education, employment, teaching, talks, …
  publications.bib      your publications, grouped by a status field
  publications.csl      optional: the website's citation style
  pages/*.md            the website's prose pages, mathematics and images included
schemas/<section>.ts    what a section of your own may contain
schemas/publications.ts optional: publication groups, badges, fields
```

A section of your own needs a schema in `schemas/<section>.ts`. Built-in
sections already have schemas; add a local one only to change their fields.

| Page | |
|---|---|
| [Field types](./field-types.md) | how to write dates, links, web addresses and formatted text |
| [Built-in sections](./sections.md) | education, employment, teaching, talks, supervision: every field |
| [Profile and pages](./profile-and-pages.md) | `profile.yml` and the front matter of Markdown pages |
| [Publications](./publications.md) | `publications.bib`, its groups, badges and citation style |
| [Schemas](./schemas.md) | sections of your own, and more fields for built-in ones |

## Validated, strictly

Every file is validated before it is used. A typo is an error naming the file,
the entry and the field, not a silently missing line on your site:

```
[vitakit] 1 content problem(s):
  content/talks.yml: invalid
    - 0: Unrecognized key: "titel"
```

**While you work** (`pnpm dev`), a problem is reported, not fatal: the
development server keeps running, the affected page shows the error in place, a
red banner lists every problem, and saving a fix recovers without a restart.

**When you build** (`pnpm check`, CI, a deployment), the same problem fails the
build, so a broken file cannot reach your website. `vitakit validate` checks
everything at once without building; see [the commands](../cli/looking.md).

## Visibility

Every entry of every section accepts a `visibility`:

```yaml
- date: 2019
  position: Visiting Researcher
  institution: Uppsala University
  visibility: cv          # in the PDF, never on the website
```

| | Website | PDF |
|---|---|---|
| `public` (the default) | yes | yes |
| `cv` | **no** | yes, by default |
| `private` | **no** | only in documents that ask for it |

The website is hard-wired to `public`; each PDF document decides how far it goes
(see [documents](../pdf/index.md#selection-options)). How this is enforced, and
checked: [privacy](../guide/privacy.md).

## Sorting

Entries are sorted newest first, by their `date`; the order in the file does not
matter. Entries without a date come last, in the order of the file.

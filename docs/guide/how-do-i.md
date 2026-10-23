# How do I …?

Short answers, with a link to where each is explained. Commands are shown for
pnpm; with npm, write `npx vitakit` and `npm run`.

## Content

**… add a section vitakit does not have?**
Write `content/<name>.yml`, then `pnpm vitakit add section <name>`: it drafts
the schema from your entries and puts the section on a page and in the PDF.
[Tutorial, chapter 5](./tutorial/own-section.md)

**… add a field to a section?**
`pnpm vitakit add field teaching evaluation --type number`. Accepting a field
does not show it yet; see the next question.
[Schemas](../content/schemas.md#more-fields-for-a-built-in-section)

**… show a field that is accepted but not shown?**
`pnpm vitakit customize teaching --web --pdf --field evaluation`.
[Tutorial, chapter 6](./tutorial/showing-more.md)

**… see which fields a section accepts?**
`pnpm vitakit explain <section>`. [Built-in sections](../content/sections.md)

**… write a date that is not a single day?**
`2024`, `2024-03`, `{ from: 2019, to: 2023 }`, `{ from: 2023, to: present }`.
[Field types](../content/field-types.md#dates)

**… link an institution?**
`institution: { name: University of Graz, url: https://www.uni-graz.at }`.
[Field types](../content/field-types.md#links)

**… use mathematics in a title?**
`$…$`, as in LaTeX, in any field of type formatted text — titles of talks,
theses, courses, publications. [Field types](../content/field-types.md#formatted-text)

**… keep my phone number, address or referees off the website?**
`visibility: cv` on the entry (in the PDF, not on the website), or `private`
(only in documents that ask for it). [Privacy](./privacy.md)

**… find out what is wrong?**
`pnpm vitakit validate` lists every problem, with file, entry and field.
[Troubleshooting](./troubleshooting.md)

## Website

**… add a page?**
A Markdown file in `content/pages/`, and a line in `nav` in
`content/profile.yml`. For a page that shows sections:
`pnpm vitakit add page <name>`. [Pages and routes](../website/index.md)

**… put a section on another page, or a second time?**
`pnpm vitakit add section <section> --page /<page>/`, or one line
`<VitaSection id="<section>" title="…" />` in the page.
[Placing sections](../website/sections.md)

**… change the order of sections on the CV page?**
Move the lines in `app/pages/cv.vue`.

**… show only some entries, say invited talks?**
`<VitaSection id="talks" title="Invited talks" :where="{ kind: 'invited' }" />`.
[Placing sections](../website/sections.md#where)

**… show the three latest talks on the home page?**
The scaffold's home page does: `<VitaSection :entries="talks" :limit="3" />`.
[Placing sections](../website/sections.md#a-section-in-code)

**… change colours and fonts?**
The `@theme` block at the top of `app/assets/css/main.css`.
[Styling](../website/styling.md)

**… link slides or a PDF from an entry?**
Put the file in `public/`, e.g. `public/slides/talk.pdf`, and write
`slides: /slides/talk.pdf`. The website shows a Slides link; the default PDF
template for talks does not. If you change the template to show that link,
also set your site's `url` in `content/profile.yml` so the PDF can link to
its full address. [Field types](../content/field-types.md#web-addresses)

## Publications

**… use my Zotero (or JabRef, or arXiv) export?**
Export it as BibTeX and replace `content/publications.bib`. Add `status =
{preprint}` (or `accepted`, `software`, `other`) to what is not published.
[Tutorial, chapter 4](./tutorial/publications.md)

**… show more or fewer of my newest publications on the home page?**
In `content/publication-lists.yml`, change `limit: 3` in the list `recent`.
[Lists](../content/publications.md#lists)

**… show only my preprints, or only my selected papers?**
Add a list: `pnpm vitakit add publication-list preprints --where status=preprint`,
or `--where keywords=selected` for papers tagged `selected` in Zotero. It asks
where to show it. [add publication-list](../cli/add.md#add-publication-list)

**… choose exactly which papers, in my order?**
A list with `keys: [berger2024trees, berger2022urns]`, the citation keys from
`publications.bib`. [Lists](../content/publications.md#examples)

**… group my publications by year instead of by status?**
`groupBy: year` in the list, e.g. `all: { groupBy: year }`.
[Settings](../content/publications.md#settings)

**… put only recent publications in one PDF?**
A list with `since: 2020`, and `\vitapublications[Publications]{<list>}` in that
document. [Tutorial, chapter 7](./tutorial/pdf.md#a-version-for-one-application)

**… rename "Preprints" to "Submitted"?**
`pnpm vitakit customize publications`, then change the `label` of `preprint` in
`schemas/publications.ts`. [Statuses](../content/publications.md#statuses-badges-and-fields)

**… find out why a paper is not in a list?**
`pnpm vitakit explain <list>` shows how many each setting removed, and the
citation keys of those it shows.

**… change how references read on the website?**
Save a CSL style as `content/publications.csl`.
[Citation style](../content/publications.md#citation-style)

## PDF

**… change the order or headings of the PDF?**
The `\vitasection[Heading]{section}` lines in `cv-tex/cv.tex`.
[Documents](../pdf/index.md)

**… leave old or minor entries out of the PDF?**
In `cv-tex/cv.yml`: `sections: { talks: { since: 2020, limit: 10 } }`.
[Selection options](../pdf/index.md#selection-options)

**… find out why an entry is missing from the PDF?**
`pnpm vitakit explain <section>` shows, per document, how many entries are
included and which option removed the others.

**… make a version of my CV for one application?**
Copy `cv-tex/cv.tex` (and `cv.yml`), change `\vitadocument{…}` to the new name,
and edit the copy. [Tutorial, chapter 7](./tutorial/pdf.md#a-version-for-one-application)

**… add a cover letter or a research statement?**
Plain LaTeX in `cv-tex/prose/`, included with `\input{prose/…}`.
[Variants and prose](../pdf/variants.md)

**… change fonts and spacing in the PDF?**
`cv-tex/preamble.tex`. [PDF styling](../pdf/styling.md)

**… build the PDF without installing LaTeX?**
`pnpm pdf --tex-only`, then any TeX installation, Overleaf, or the scaffold's
CI workflow. [Building](../pdf/building.md)

## Publishing

**… publish the site?**
[Publishing](./publishing.md); the creator sets up a workflow for your host.

**… keep my repository private?**
Choose a host that serves sites from private repositories, e.g. Cloudflare
Workers or GitLab Pages. [Publishing](./publishing.md)

**… serve the site from a subdirectory, like `~username/`?**
Set `NUXT_APP_BASE_URL=/~username/` for the build.
[Publishing](./publishing.md#the-base-path)

---

## Recipes

A few tasks that combine several steps.

### Two lists from one section

Lena's talks are scientific and public ones. Rather than two files, one file
with a field that tells them apart:

```yaml
# content/talks.yml
- date: 2025-06-16
  title: The shape of large random $k$-ary trees
  kind: invited
- date: 2024-03-12
  title: What is a random tree?
  kind: outreach
```

and two lines on the page, one per kind:

```vue
<VitaSection id="talks" title="Scientific talks" :where="{ kind: ['invited', 'contributed', 'seminar'] }" />
<VitaSection id="talks" title="Public talks" :where="{ kind: 'outreach' }" />
```

In the PDF, the same selection is `where` in `cv-tex/cv.yml`. A section appears
only once per document, so for both lists in one PDF, use two sections
instead: `content/talks-science.yml` and `content/talks-public.yml`, sharing a
schema (`pnpm vitakit add section talks-public --like talks-science`).

### Group entries by term

Courses grouped under a heading per semester:

```bash
pnpm vitakit customize teaching --web --list --group-by term
```

writes `app/components/TeachingList.vue` with one heading per value of `term`,
in the order of the entries, and shows teaching with it. In the PDF, grouping
means writing the loop of `cv-tex/templates/teaching.eta` yourself; see
[templates](../pdf/templates.md).

### Bring an existing CV over

If your CV is already data — YAML for another tool, a spreadsheet exported to
YAML — it can usually be brought over with light changes:

1. **Use the built-in field names** where a built-in section fits:
   `position` (employment), `degree` (education), `title`, `institution`.
   `vitakit explain <section>` lists them.
2. **Dates in vitakit's form**: `05/2015` → `2015-05`; `[2012, 2014]` →
   `{ from: 2012, to: 2014 }`; `since 2023` → `{ from: 2023, to: present }`.
   Every entry needs a `date` to be sorted.
3. **Links as `{ name, url }`**: a name in one field and its web address in
   another (`institution`, `institution-url`) become one field.
4. **Lists where there may be several**: a field that is sometimes one value
   and sometimes a list is always a list, `[Lecture]`.
5. Run **`pnpm vitakit add section <name>`** for each file. It drafts the
   fields a schema is missing, and lists every entry that still needs a change,
   with what to change.

`pnpm vitakit status` then shows what is where; `pnpm vitakit validate` what is
left to fix.

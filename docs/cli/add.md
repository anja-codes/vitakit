# add

`add` creates what is missing — a section, a field, a page, a publication list — and shows every
change before it makes it. Running it again only adds what is still missing.

## add section

::: code-group

```bash [pnpm]
pnpm vitakit add section grants
```

```bash [npm]
npx vitakit add section grants
```

:::

A section is a file `content/<name>.yml` and the schema that says what its
entries may contain (see [concepts](../guide/concepts.md)). `add section` creates
whatever is missing, and asks where the section should appear:

```
Show grants on which page of your website?
  1  /  (app/pages/index.vue)
  2  /cv/  (app/pages/cv.vue)   (Enter)
  3  /publications/  (app/pages/publications.vue)
  4  a new page, /grants/
  5  not on the website, for now
```

then shows everything it is about to do, and asks before writing:

```
= content/grants.yml   2 entries
+ schemas/grants.ts   drafted from the 2 entries in content/grants.yml; check its comments
    import { dateRange, linked, richText, section, text, z } from '@anja.codes/vitakit'

    export default section({
      date: dateRange,
      // Markdown and $math$ allowed
      title: richText,
      // a name, or { name, url }
      funder: linked,
      amount: z.number(),
      role: text,
    })
~ app/pages/cv.vue   shows grants after education
        <VitaSection id="education" title="Education" />
  +     <VitaSection id="grants" title="Grants" />
~ cv-tex/cv.tex   includes grants after education
    \vitasection[Education]{education}
  + \vitasection[Grants]{grants}

Write these changes? [Y/n]
```

**Write your entries first**, and the schema is drafted from them: every value
of every entry is looked at, nothing is restricted on a guess, and what could
reasonably be different is said in a comment above the field — a set of values
that could be a fixed list, a date written in a form vitakit does not read, a
field name that needs quotes. If an entry does not fit the draft (an empty
value, a number in one entry and text in another), you are told which entry
and what to change. Without a file, you get one example entry and a schema with
date, title and note. More on drafting and editing schemas:
[schemas](../content/schemas.md).

A **built-in** section (education, employment, teaching, talks, supervision)
needs no schema; for it, `add section` only creates the file, empty, with an
example entry as a comment. If its entries have fields the built-in schema does
not, `add section` drafts those into `schemas/<section>.ts`, which keeps all
the built-in fields — the same for a schema of your own. A section whose
entries fit another section's schema can share it: `--like talks`.

Where it appears is one line in each place, after the section you choose —
`<VitaSection id="grants" title="Grants" />` in a page, `\vitasection[Grants]{grants}`
in a PDF document — exactly what you would have written. Running it again only
adds what is missing.

| Option | |
|---|---|
| `--page <route>` | show it on this page, e.g. `/cv/`; a route like `/grants/` that does not exist yet becomes a new page |
| `--document <name>` | include it in this PDF document, e.g. `cv` |
| `--after <section>` | place it after this section, on the page and in the document |
| `--title <text>` | its heading |
| `--like <section>` | use that section's schema |

## add field

::: code-group

```bash [pnpm]
pnpm vitakit add field teaching evaluation --type number
```

```bash [npm]
npx vitakit add field teaching evaluation --type number
```

:::

Lets a section accept one more field. Without `--type`, it asks:

| Type | In YAML |
|---|---|
| `text` | `Analysis 1` |
| `formatted-text` | Markdown and `$math$` |
| `number` | `4.6` |
| `yes-no` | `true` |
| `date` | `2024`, `2024-03`, `{ from: 2019, to: present }` |
| `web-address` | `https://…`, `/slides/talk.pdf` |
| `link` | `University of Graz`, or `{ name: University of Graz, url: https://… }` |
| `choice` | one of the values given with `--choice`, once per value |

`--several` allows a list of them, `--required` makes every entry need it.

For a built-in section, the first field creates `schemas/<section>.ts`, which
keeps all of vitakit's fields and adds yours; later fields are added to that
file, without touching anything else in it. In a schema the command cannot
change safely — one you have rewritten in your own way — it shows the line to
paste instead.

**A field that is accepted is not shown yet.** Showing it on the website or in
the PDF is the next step: `vitakit customize teaching --web --pdf --field evaluation`,
see [customize](./customize.md).

## add page

::: code-group

```bash [pnpm]
pnpm vitakit add page talks --title Talks
```

```bash [npm]
npx vitakit add page talks --title Talks
```

:::

A page at `/talks/` that can show sections: `content/pages/talks.md` for its
title and text, `app/pages/talks.vue` for its sections, and an entry in the menu
in `content/profile.yml` (`--no-menu` leaves the menu alone). A page that is
only text needs no command: it is one Markdown file in `content/pages/`. See
[pages and routes](../website/index.md).

## add publication-list

A [publication list](../content/publications.md#lists) says which of your
publications to show — the newest, the preprints, your selected papers — and
`add publication-list` declares one and shows it on a website page or in a PDF.

::: code-group

```bash [pnpm]
pnpm vitakit add publication-list preprints
```

```bash [npm]
npx vitakit add publication-list preprints
```

:::

Without options, it asks, in this order:

```
Which publications?
  1  all of them   (Enter)
  2  only some statuses
> 2
Which, separated by commas (published, accepted, preprint, software, other): preprint, accepted
How many at most? (Enter for all):
In what order?
  1  newest first   (Enter)
  2  oldest first
  3  by title
  4  as in publications.bib
>
In groups, each with a heading?
  1  no, one list   (Enter)
  2  by status (Published, Preprints, …)
  3  by year
>
Show preprints on which page of your website?
  1  /  (app/pages/index.vue)
  2  /cv/  (app/pages/cv.vue)
  3  /publications/  (app/pages/publications.vue)   (Enter)
  4  not on the website, for now
>
Include preprints in the PDF cv-tex/cv.tex? [y/N]
Heading [Preprints]:
```

and then shows what it will write — the list, at the end of
`content/publication-lists.yml`, and one line on the page, after the last
section or list there:

```
~ content/publication-lists.yml   declares the list preprints
  + preprints:
  +   where: { status: [preprint, accepted] }
~ app/pages/publications.vue   shows the list preprints after all
        <VitaPublications list="all" class="mt-8" />
  +     <VitaPublications list="preprints" title="Preprints" />

Write these changes? [Y/n]
```

The same in one line, without questions:

::: code-group

```bash [pnpm]
pnpm vitakit add publication-list preprints --where status=preprint --where status=accepted --page /publications/ --yes
```

```bash [npm]
npx vitakit add publication-list preprints --where status=preprint --where status=accepted --page /publications/ --yes
```

:::

The questions cover the common cases. A list can do more — pick papers by a
keyword or by citation key, group by year — with the options below, or by adding
a line to the list in `content/publication-lists.yml` afterwards; every setting
is described in [lists](../content/publications.md#settings).

**The list exists already?** Then the command only shows it somewhere else, e.g.
`add publication-list recent --document cv`. It does not change a list: to
change what a list shows, edit it in `content/publication-lists.yml` — the
command tells you on which line, if you try.

**Checked before writing.** A status that does not exist, or a field that no
publication has (`--where keywrds=selected`), is refused; a list that matches no
publication yet is pointed out before anything is written. Afterwards, `vitakit explain <list>` shows which publications it
contains, and which setting left the others out.

| Option | |
|---|---|
| `--where <field=value>` | only publications with this value: `status=preprint`, `keywords=selected`, `year=2024`. Repeat it for several values of a field (any of them) or several fields (all of them) |
| `--since <year>`, `--until <year>` | only publications from these years |
| `--sort <by>` | `date` (newest first, the default), `year`, `title`, `source` (as in `publications.bib`), or a BibTeX field |
| `--order <asc\|desc>` | turn the order around |
| `--group-by <by>` | a heading per `status`, per `year`, or per value of a BibTeX field |
| `--limit <count>` | at most this many |
| `--page <route>` | show it on this page, e.g. `/publications/` |
| `--document <name>` | show it in this PDF document, e.g. `cv` |
| `--after <name>` | after this section or list, on the page and in the document |
| `--title <text>` | its heading; the list's name by default, `--title ""` for none |

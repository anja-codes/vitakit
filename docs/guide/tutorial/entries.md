# 3. Your CV entries

Each part of your CV is a **section**, and each section is one YAML file in
`content/`. Five are built in: `employment`, `education`, `teaching`, `talks`
and `supervision`. Their files are filled with example entries; replace them
with yours.

## An entry

`content/employment.yml` is a list; each item, starting with `-`, is an entry:

```yaml
- date: { from: 2023, to: present }
  position: Postdoctoral Researcher
  institution: { name: University of Graz, url: https://www.uni-graz.at }
  project:
    title: Asymptotics of random discrete structures
    funder: FWF
    grant: P 12345

- date: { from: 2020, to: 2023 }
  position: University Assistant
  institution: University of Klagenfurt
```

Indentation matters in YAML: the lines of one entry line up under each other,
two spaces in from the `-`. Which fields an entry may have is fixed for each
section — every one is listed in [built-in sections](../../content/sections.md),
and `vitakit explain employment` prints them.

A few kinds of values come back everywhere:

**Dates** are numeric, with the precision you mean:

```yaml
date: 2024                         # a year
date: 2024-03                      # a month
date: { from: 2019, to: 2023 }     # a range
date: { from: 2023, to: present }  # ongoing
```

Entries are sorted newest first; the order in the file does not matter.

**Links** — an institution, a supervisor — are a name, or a name with a web
address:

```yaml
institution: University of Klagenfurt
institution: { name: University of Klagenfurt, url: https://www.aau.at }
```

**Titles** may contain Markdown and mathematics: `title: Cutting down random
$k$-ary trees` is typeset on the website and passed to LaTeX for the PDF.

More in [field types](../../content/field-types.md).

## Lena's sections

Lena goes through the files one by one. In **education**, a thesis is part of
the degree:

```yaml
- date: { from: 2016, to: 2020 }
  degree: PhD in Mathematics
  institution: { name: University of Klagenfurt, url: https://www.aau.at }
  thesis:
    title: Cutting down random trees
    type: Doctoral thesis
    supervisor: { name: Michael Fuchs, url: https://example.org/fuchs }
```

In **teaching**, `term` is shown instead of the date, as it is written:

```yaml
- date: 2025-03
  term: Summer 2025
  title: Analytic Combinatorics
  role: Lecturer
  institution: University of Graz
```

In **talks**, `kind` says what sort of talk it is — `invited`, `contributed`,
`seminar`, `poster` or `outreach` — which the PDF uses to select:

```yaml
- date: 2025-06-16
  title: The shape of large random $k$-ary trees
  event: AofA 2025
  location: Bath, UK
  kind: invited
  slides: /slides/aofa2025.pdf
```

`slides` points to a file in `public/slides/`: put the PDF there and the website
links it.

Lena has not supervised anyone yet, so she deletes `content/supervision.yml`.
**A deleted file is a section that is gone** — nothing else to switch off — but
the CV page and the PDF still mention it. `vitakit validate` says so:

```
✖ cv-tex/cv.tex:35
    no section called "supervision"
✖ app/pages/cv.vue:31
    no section called "supervision" (no content/supervision.yml)

2 problems
```

She removes the line `<VitaSection id="supervision" … />` from
`app/pages/cv.vue` and `\vitasection[Supervised theses]{supervision}` from
`cv-tex/cv.tex`. (Keeping the file with an empty list, `[]`, would have worked
too: an empty section is not shown, heading included.)

## Not everything is public

A CV holds things a website should not: an address, referees, a complete list
of everything. Every entry can say who may see it:

```yaml
- date: 2019
  position: Visiting Researcher
  institution: Uppsala University
  note: Three-month research stay with the combinatorics group.
  visibility: cv
```

| `visibility` | Website | PDF |
|---|---|---|
| `public` (default) | yes | yes |
| `cv` | no | yes |
| `private` | no | only in documents that ask for it |

The website only ever reads public entries; there is no setting to get wrong.
[Privacy](../privacy.md) explains the rest.

## When something is wrong

Lena mistypes a field:

```yaml
- date: 2025-06-16
  titel: The shape of large random $k$-ary trees
```

The browser shows a red banner listing the problem, and the page shows the
error in place of the section. The development server keeps running; saving
the fix makes it disappear. From the terminal:

::: code-group

```bash [pnpm]
pnpm vitakit validate
```

```bash [npm]
npx vitakit validate
```

:::

```
✖ content/talks.yml
    entry 1, title: Invalid input: expected string, received undefined
    entry 1: Unrecognized key: "titel"

1 problem
```

Entry 1 has no `title`, and a field `titel` that talks do not have. Every file
is checked this strictly, on purpose: a typo is an error you see, not a line
that is quietly missing from your CV. A build — and so a deployment — fails
until it is fixed.

## Where sections appear

On the website, the CV page `app/pages/cv.vue` lists the sections, one line
each:

```vue
<VitaSection id="employment" title="Employment" />
<VitaSection id="education" title="Education" />
<VitaSection id="teaching" title="Teaching" />
<VitaSection id="talks" title="Talks" />
```

Move a line to move a section, change `title` to change its heading. The PDF
has the same in `cv-tex/cv.tex`, separately — [chapter 7](./pdf.md) is about
that. `vitakit status` shows both.

**Next:** [publications](./publications.md).

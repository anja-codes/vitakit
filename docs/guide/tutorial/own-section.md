# 5. A section of your own

Lena's CV needs a list vitakit does not have: her grants. A section of your
own is the same as a built-in one — a YAML file — plus a **schema**, a short
file saying what its entries may contain. You do not need to write the schema:
write your entries, and vitakit drafts it from them.

## Write the entries

`content/grants.yml`, with whatever fields describe a grant for you:

```yaml
- date: { from: 2023, to: 2027 }
  title: Scaling limits of random trees
  funder: { name: FWF, url: https://www.fwf.ac.at }
  amount: 342000
  role: Principal investigator

- date: 2021
  title: Travel grant for AofA 2021
  funder: Austrian Mathematical Society
  amount: 1500
  role: Applicant
```

Use `date` for the date — vitakit sorts by it — and `title` for the main line.
The development server now shows a problem: `content/grants.yml` has no schema.

## Let vitakit set it up

::: code-group

```bash [pnpm]
pnpm vitakit add section grants
```

```bash [npm]
npx vitakit add section grants
```

:::

The command asks where the section should appear — on which page of the
website, after which section, in the PDF or not, with which heading:

```
Show grants on which page of your website?
  1  /  (app/pages/index.vue)
  2  /cv/  (app/pages/cv.vue)   (Enter)
  3  /publications/  (app/pages/publications.vue)
  4  a new page, /grants/
  5  not on the website, for now
> 
After which section?
  1  employment
  2  education
  3  teaching
  4  talks   (Enter)
> 2

Include grants in the PDF cv-tex/cv.tex? [Y/n]
After which section?
  …
> 2

Heading [Grants]: 
```

and then shows everything it is about to do:

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
        <VitaSection id="employment" title="Employment" />
        <VitaSection id="education" title="Education" />
  +     <VitaSection id="grants" title="Grants" />
        <VitaSection id="teaching" title="Teaching" />
~ cv-tex/cv.tex   includes grants after education
    \vitasection[Education]{education}
  + \vitasection[Grants]{grants}
    \vitasection[Teaching]{teaching}

Write these changes? [Y/n]
```

`+` is a new file, `~` a change to one of yours, shown line by line; nothing is
written until you say yes. Three things happen:

1. **`schemas/grants.ts`** is the schema, drafted from both entries: `date` is a
   date, `title` may contain Markdown and mathematics, `funder` is a name that
   may link, `amount` a number, `role` text. Every field is in every entry, so
   every field is required; a field missing from some entries would be
   optional.
2. **The CV page** gets one line, after education.
3. **The PDF** gets one line, after education.

Grants are now on `http://localhost:3000/cv/`.

## Check the draft

The draft is a starting point: the comments above fields say what it could
not decide. Had Lena written `role: PI` in one entry and `role: Applicant` in the
other three, it would suggest a fixed list:

```ts
  // values so far: PI, Applicant; to allow only these: z.enum(['PI', 'Applicant'])
  role: text,
```

and had she written a date as `03/2021`, it would say how vitakit reads dates:
`2021-03`. An entry the draft does not accept — an empty value, a number in one
entry and text in another — is listed, with what to change, before anything is
written. Read the comments, change what is not right, delete them; the file is
yours. More in [schemas](../../content/schemas.md).

## Accepted is not shown

After writing, the command says:

```
Accepted, but not shown by the standard layout: funder, amount. To show them:
`pnpm vitakit customize grants --web --pdf --field funder --field amount`
```

The schema decides what an entry may *contain*. What the website and the PDF
*show* is decided separately: the standard layout shows a date, a title, the
usual details such as a role or an institution, and a note — not an amount.
[Chapter 6](./showing-more.md) shows them.

## A page for it

Lena's teaching page from [chapter 2](./make-it-yours.md#a-new-page) is text
only. To list her courses on it, she adds the teaching section there:

::: code-group

```bash [pnpm]
pnpm vitakit add section teaching --page /teaching/
```

```bash [npm]
npx vitakit add section teaching --page /teaching/
```

:::

```
= content/teaching.yml   3 entries
= content/pages/teaching.md   the page's title and text, as they are
+ app/pages/teaching.vue   the page, with its sections
```

A page that shows sections is a small Vue file in `app/pages/` — the text from
the Markdown file, then one line per section, as on the CV page. (Had the page
not been in the menu yet, the command would have added it.) Teaching is
now on both pages; to have it only on the teaching page, she deletes its line
from `app/pages/cv.vue`. For a page that does not exist yet,
`vitakit add page <name>` creates both files and the menu entry.

## Where everything is

::: code-group

```bash [pnpm]
pnpm vitakit explain grants
```

```bash [npm]
npx vitakit explain grants
```

:::

```
grants

  data      content/grants.yml · 2 entries
  schema    schemas/grants.ts (yours)
              date     date, required
              title    formatted text, required
              funder   link, required
              amount   number, required
              role     text, required

  website   /cv/   app/pages/cv.vue:30   <VitaSection title="Grants">

  pdf       cv   cv-tex/cv.tex:31  \vitasection[Grants]{grants}
                 template: vitakit's generic template (there is no grants.eta)
                 2 of 2 entries
```

`explain` follows one section through everything: its file, what it accepts,
where it appears on the website and in each PDF, and how many of its entries
each PDF includes.

**Next:** [showing more](./showing-more.md).

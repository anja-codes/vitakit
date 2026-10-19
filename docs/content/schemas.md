# Schemas

A **schema** says what the entries of a section may contain: which fields, of
which [types](./field-types.md), which of them every entry needs. The five
[built-in sections](./sections.md) have theirs in vitakit. A section of your
own has one in `schemas/<section>.ts`, a small TypeScript file — usually
written for you by `vitakit add section`.

A schema decides what is **accepted**, not what is **shown**. Showing a field is
a separate step, on the website and in the PDF: see [customize](../cli/customize.md).

## A section of your own

Write your entries first, in `content/<name>.yml`, then let the command draft
the schema from them:

::: code-group

```bash [pnpm]
pnpm vitakit add section outreach
```

```bash [npm]
npx vitakit add section outreach
```

:::

```yaml
# content/outreach.yml
- date: 2025-03-14
  title: What is a random tree?
  venue: BRG Klagenfurt-Viktring
  audience: school
- date: 2024-11-02
  title: Maths night
  audience: public
```

```ts twoslash
// schemas/outreach.ts, as drafted
import { section, dateRange, richText, text } from '@anja.codes/vitakit'

export default section({
  date: dateRange,
  // Markdown and $math$ allowed
  title: richText,
  venue: text.optional(),
  audience: text,
})
```

The draft looks at every value of every entry:

- a field missing from some entries is `.optional()`;
- `date` is a date, a field called `title` is formatted text, `{ name, url }`
  values are links, web addresses are web addresses, numbers stay numbers;
- what could reasonably be different is a **comment above the field**, not a
  decision: a few repeated values that could be a fixed list, a date written in
  a form vitakit does not read (`03/2015` — write `2015-03`), a field name that
  needs quotes;
- an entry the draft does not accept — an empty value, a number in one entry and
  text in another — is listed, with what to change, before anything is written.

Check the comments, change what is not right, and delete them. The file is
yours: edit it freely afterwards.

## Writing one by hand

```ts twoslash
import { section, dateRange, richText, linked, z } from '@anja.codes/vitakit'

export default section({
  date: dateRange,
  title: richText,                 // Markdown and $math$
  venue: linked.optional(),
  audience: z.enum(['school', 'public', 'press']),
  participants: z.number().optional(),
})
```

`section()` makes a list of entries, each of which also accepts `visibility`.
Use the vitakit building blocks — `dateRange`, `richText`, `text`, `url`,
`linked` — for dates, formatted text, plain text, web addresses and links, and
your section sorts, filters and formats like a built-in one. Anything else
[Zod](https://zod.dev) can express works too: `z` is exported for that.

Every entry is strict: a field the schema does not name is an error, so a typo
cannot silently drop a line from your CV.

## More fields for a built-in section

::: code-group

```bash [pnpm]
pnpm vitakit add field teaching evaluationScore --type number
```

```bash [npm]
npx vitakit add field teaching evaluationScore --type number
```

:::

The first field creates `schemas/teaching.ts`, which keeps vitakit's fields and
adds yours; later fields are added to the same file. It is also easy to write:

```ts twoslash
import { schemas, extendSection, z } from '@anja.codes/vitakit'

export default extendSection(schemas.teaching, {
  evaluationScore: z.number().optional(),
})
```

A field listed there that vitakit already has replaces vitakit's rule for it.
If your entries already have the extra fields, `vitakit add section teaching`
drafts all of them at once.

To change or remove built-in rules wholesale, take over the whole definition —
the file vitakit itself uses, not a paraphrase:

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching --schema --copy   # -> schemas/teaching.ts
```

```bash [npm]
npx vitakit customize teaching --schema --copy   # -> schemas/teaching.ts
```

:::

A copied schema no longer gets vitakit's improvements to it; an extended one
does.

## One schema for two sections

Two sections with the same fields — say, scientific and public talks in two
files — can share a schema:

::: code-group

```bash [pnpm]
pnpm vitakit add section talks-public --like talks
```

```bash [npm]
npx vitakit add section talks-public --like talks
```

:::

```ts
// schemas/talks-public.ts
export { default } from './talks-sci.ts'   // another section's schema
```

```ts
// schemas/talks-public.ts
import { schemas } from '@anja.codes/vitakit'

export default schemas.talks               // a built-in section's schema
```

A relative import needs its `.ts` extension: schemas are loaded by Node itself.
Often a single section with a field to tell entries apart is simpler — one
`talks.yml` with `kind: outreach` — and [`where`](../website/sections.md#where)
splits it on the page.

## Which schema is used

For `content/<name>.yml`, the first of:

1. `schemas/<name>.ts` in your project,
2. vitakit's built-in schema of that name,
3. none: the section is reported, and the build fails, until it has one.

`vitakit explain <section>` shows which one is in use and what fields it
accepts.

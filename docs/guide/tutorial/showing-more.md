# 6. Showing more

So far, every section looks the way vitakit's standard layout shows it: a date,
a title, a line of details, a note. This chapter shows fields beyond that — the
amount of a grant, the evaluation of a course — on the website and in the PDF.

## A component and a template

The amount and funder of Lena's grants are accepted but not shown. One command
shows them in both places:

::: code-group

```bash [pnpm]
pnpm vitakit customize grants --web --pdf --field funder --field amount
```

```bash [npm]
npx vitakit customize grants --web --pdf --field funder --field amount
```

:::

```
+ app/components/GrantsSection.vue   grants through VitaSection, with your own note line showing funder, amount
    …
~ app/pages/cv.vue   shows grants with GrantsSection
  -     <VitaSection id="grants" title="Grants" />
  +     <GrantsSection id="grants" title="Grants" />
+ cv-tex/templates/grants.eta   a copy of vitakit's generic template, with funder, amount
    …
```

**On the website**, a section is shown by a component. `GrantsSection.vue` is a
small one of your own, in `app/components/`: vitakit's list, with a line per
field added to each entry's note:

```vue
<template>
  <VitaSection v-bind="props">
    <template #note="{ entry, display }">
      <p v-if="display.note !== undefined" class="vita-entry__note">{{ display.note }}</p>
      <p v-if="asLinkedList(entry.funder).length" class="vita-entry__note">Funder: …</p>
      <p v-if="typeof entry.amount === 'number'" class="vita-entry__note">Amount: {{ entry.amount }}</p>
    </template>
  </VitaSection>
</template>
```

The CV page now shows grants with it: the line `<VitaSection id="grants" … />`
became `<GrantsSection id="grants" … />`. Each line only appears for entries
that have the field, and each field is shown in a way that suits it: a link
links, a number is shown even when it is `0`.

The component is yours to edit; the browser shows every change as you save.
Lena prefers the amount in euros, on the same line as the funder:

```vue
<p class="vita-entry__note">
  {{ asLinkedList(entry.funder)[0]?.label }}, EUR {{ (entry.amount as number).toLocaleString('en') }}
</p>
```

**In the PDF**, a section is written by a template. `cv-tex/templates/grants.eta`
is a copy of the template vitakit used, with a line per field:

```eta
<%~ it.vita.note(item.note) %>
<%~ it.vita.note`Funder: ${it.linked(item.funder)}` %>
<%~ it.vita.note`Amount: ${item.amount}` %>
```

`it.vita.note` adds a line below the entry; in the backquoted form, the whole
line is left out when a value is missing. Lena's version:

```eta
<%~ it.vita.note`${it.linked(item.funder)}, EUR ${item.amount.toLocaleString('en')}` %>
```

Templates are explained in [templates](../../pdf/templates.md).

## A new field

Lena's teaching evaluations are not part of the teaching section at all. A
field is added to a section's schema:

::: code-group

```bash [pnpm]
pnpm vitakit add field teaching evaluation --type number
```

```bash [npm]
npx vitakit add field teaching evaluation --type number
```

:::

Without `--type`, the command asks what kind of value it is: text, formatted
text, number, yes/no, date, web address, link, or one of a fixed list. Teaching
is a built-in section, so the first field creates `schemas/teaching.ts`, which
keeps all of vitakit's teaching fields and adds hers:

```ts
import { extendSection, schemas, z } from '@anja.codes/vitakit'

export default extendSection(schemas.teaching, {
  evaluation: z.number().optional(),
})
```

Now her entries may have it:

```yaml
- date: 2025-03
  term: Summer 2025
  title: Analytic Combinatorics
  role: Lecturer
  evaluation: 4.6
```

and to show it:

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching --web --pdf --field evaluation
```

```bash [npm]
npx vitakit customize teaching --web --pdf --field evaluation
```

:::

Teaching is on two pages, the CV and the teaching page; the command switches
both to the new `TeachingSection`.

## Later fields

A month later, Lena records the number of students as well:

::: code-group

```bash [pnpm]
pnpm vitakit add field teaching students --type number
pnpm vitakit customize teaching --web --pdf --field students
```

```bash [npm]
npx vitakit add field teaching students --type number
npx vitakit customize teaching --web --pdf --field students
```

:::

The field is added to `schemas/teaching.ts`, next to `evaluation`. But the
component and the template are hers by now, possibly edited, and the command
does not rewrite them; it shows what to add, and where:

```
? app/components/TeachingSection.vue   is yours already; add these lines where the entry's lines are, e.g. in its #note slot
    <p v-if="typeof entry.students === 'number'" class="vita-entry__note">Students: {{ entry.students }}</p>
? cv-tex/templates/teaching.eta   is yours already; add these lines inside its loop over the entries, where the notes are
    <%~ it.vita.note`Students: ${item.students}` %>
```

She pastes them. `vitakit explain teaching --field students` prints the same
lines at any time.

## Other kinds of change

- **Grouped or numbered lists.** `vitakit customize teaching --web --list
  --group-by term` writes a component with a list of its own, one heading per
  term. See [customising entries](../../website/entries.md).
- **Styling only.** Colours, spacing, fonts: `app/assets/css/main.css` on the
  website ([styling](../../website/styling.md)), `cv-tex/preamble.tex` in the PDF
  ([PDF styling](../../pdf/styling.md)).
- **The same look for two sections.** You can reuse a component you have
  already created for another section with the same fields. See
  [customising entries](../../website/entries.md#a-component-of-your-own).

**Next:** [the PDF](./pdf.md).

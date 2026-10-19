# 6. Showing more

In chapter 5, your grants appeared on the CV page, but their funders and amounts
did not. Those values are valid content; vitakit simply has not been told how
to display them.

In this chapter you will show those fields, then add a course evaluation that
teaching entries do not yet accept. The commands write the display code for
you. Afterwards, an optional walkthrough shows how to edit that code yourself.

## Show the grant fields

Ask vitakit to show `funder` and `amount` on the website and in the PDF:

::: code-group

```bash [pnpm]
pnpm vitakit customize grants --web --pdf --field funder --field amount
```

```bash [npm]
npx vitakit customize grants --web --pdf --field funder --field amount
```

:::

When asked for the component's name, press Enter to keep `GrantsSection`.
The command previews the changes and asks before writing them. Among the
changes you will see:

```text
+ app/components/GrantsSection.vue   grants through VitaSection, with your own note line showing funder, amount
~ app/pages/cv.vue   shows grants with GrantsSection
+ cv-tex/templates/grants.eta   a copy of vitakit's generic template, with funder, amount
```

Confirm the changes, then open `http://localhost:3000/cv/`. If you used Lena's
grants from chapter 5, the entry "Scaling limits of random trees" now has two
extra lines:

```text
Funder: FWF
Amount: 342000
```

FWF links to the funder's website. The PDF will show the same extra fields
when you build it in [chapter 7](./pdf.md); you do not need to build it yet.

## What the command changed

A reusable piece of a website page is called a **component**. Until now,
vitakit's `VitaSection` component displayed your grants. The command created
`GrantsSection`, a component of your own that keeps vitakit's list and adds
the two fields beneath each entry.

For the PDF, a **template** turns entries into LaTeX. The command copied the
template vitakit used for grants and added the same fields there.

| File | What changed |
|---|---|
| `app/components/GrantsSection.vue` | A new component that displays grants on the website, including funder and amount. |
| `app/pages/cv.vue` | Now uses `GrantsSection` instead of `VitaSection` for grants. |
| `cv-tex/templates/grants.eta` | A new template that writes grants, including funder and amount, into the PDF's LaTeX files. |

Your entries in `content/grants.yml` and their schema did not change. The
schema still decides what a grant may contain; these files decide what is
shown. You can leave the generated code as it is, or edit it yourself.

## Add a field to teaching

The grant fields already existed. A course evaluation is different: the
built-in teaching section does not yet accept one. First, add the field:

::: code-group

```bash [pnpm]
pnpm vitakit add field teaching evaluation --type number
```

```bash [npm]
npx vitakit add field teaching evaluation --type number
```

:::

Confirm the proposed change. For a built-in section, the first extra field
creates `schemas/teaching.ts`. This keeps all the built-in teaching fields and
allows an optional number called `evaluation`: courses without an evaluation
remain valid. You do not need to edit this schema yourself; [schemas](../../content/schemas.md#more-fields-for-a-built-in-section)
explains its definition if you want to inspect it.

Open `content/teaching.yml` and add `evaluation: 4.6` to one of your courses,
keeping its other fields. For Lena's course, the entry is now:

```yaml
- date: 2025-03
  term: Summer 2025
  title: Analytic Combinatorics
  role: Lecturer
  institution: University of Graz
  evaluation: 4.6
```

Save and look at the website: the course is still there, but the evaluation
is not shown yet. As with grants, displaying the field is a separate step:

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching --web --pdf --field evaluation
```

```bash [npm]
npx vitakit customize teaching --web --pdf --field evaluation
```

:::

Keep the proposed name `TeachingSection` and confirm the changes. The command
creates `app/components/TeachingSection.vue` and `cv-tex/templates/teaching.eta`.
It also switches the teaching section's lines in your website pages to use the
new component.

If you followed Lena's setup in chapter 5, teaching is on both `/cv/` and
`/teaching/`. Open either page: the course now has a line reading
**Evaluation: 4.6**. Courses without an evaluation have no extra line.

You have now done both tasks: shown fields that already existed, and added
and shown a new field. You can go straight to [the PDF](./pdf.md), or continue
below to try editing the generated code.

## Optional: change the wording on the website

Suppose you want the label to read "Student evaluation" rather than
"Evaluation". This changes only how the value is displayed, not the field's
name in your data.

Open `app/components/TeachingSection.vue`. Like other Vue files, it has a
script for its setup and a template describing what appears on the page.
Inside the template, find the block that begins:

```vue
<template #note="{ entry, display }">
```

This is a **slot**: a part of `VitaSection` you can replace while keeping the
rest of its layout. The `#note` slot controls the extra lines beneath each
course. `VitaSection` provides two values to this block:

- **`entry`** is the course currently being displayed, with its fields.
- **`display`** contains vitakit's prepared display values. The generated code
  uses `display.note` to keep the course's ordinary note, if it has one.

Within that block, find this line:

```vue
<p v-if="typeof entry.evaluation === 'number'" class="vita-entry__note">Evaluation: {{ entry.evaluation }}</p>
```

It is a paragraph (`<p>`) with a few instructions:

- `v-if="typeof entry.evaluation === 'number'"` shows it only when the
  evaluation is a number. A score of `0` still appears.
- `class="vita-entry__note"` gives it the same styling as other note lines.
- The expression in double braces inserts the course's evaluation into the
  text.

Replace that one line with:

```vue
<p v-if="typeof entry.evaluation === 'number'" class="vita-entry__note">Student evaluation: {{ entry.evaluation }}</p>
```

Leave the surrounding script, template and other lines in place. Save and
check `/teaching/`: the line now reads **Student evaluation: 4.6**. Because
both pages use the same component, `/cv/` has the new wording too.

The PDF has not changed. Its wording is in a separate file.

## Optional: change the wording in the PDF

Open `cv-tex/templates/teaching.eta`. **Eta** is the template format used here:
ordinary LaTeX text mixed with JavaScript instructions that insert your data.
You will only change a label, not write a template from scratch.

The file loops over the courses selected for this PDF, writing each one in
turn. Within that loop:

- **`item`** is the current course, so `item.evaluation` is its evaluation.
- **`it`** provides the template's inputs and formatting helpers.
- **`it.vita.note`** is a helper that writes an extra line beneath an entry.

Find the evaluation line:

```eta
<%~ it.vita.note`Evaluation: ${item.evaluation}` %>
```

`<%~ … %>` inserts the helper's output. The text between backticks is the
note's wording, with `${item.evaluation}` inserting the score. In this form,
`it.vita.note` leaves out the whole line when the evaluation is missing,
including the label.

Replace that line with:

```eta
<%~ it.vita.note`Student evaluation: ${item.evaluation}` %>
```

Leave the backticks, `${…}` and surrounding lines unchanged. The next PDF
build will use the new wording. [Templates](../../pdf/templates.md) explains
how to make larger changes, including links and optional sentences.

## Optional: add another field later

A month later, Lena wants to record student numbers too. Add a `students`
field, then ask to display it:

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

Confirm the schema change. This time, the display files already exist and may
contain your edits. **The command does not rewrite them.** Instead, it prints
the lines to add yourself.

In `app/components/TeachingSection.vue`, add this line just below the
evaluation paragraph, still inside the `#note` block:

```vue
<p v-if="typeof entry.students === 'number'" class="vita-entry__note">Students: {{ entry.students }}</p>
```

In `cv-tex/templates/teaching.eta`, add this line just below the evaluation
note, inside the existing loop and before its closing `<% } %>`:

```eta
<%~ it.vita.note`Students: ${item.students}` %>
```

Finally, add `students: 32` to the course in `content/teaching.yml`, at the
same indentation as `evaluation`. Save and check the teaching page: it now
also says **Students: 32**. Your label edits are still there.

If you need the suggested lines again, this command prints them without
changing any files:

::: code-group

```bash [pnpm]
pnpm vitakit explain teaching --field students
```

```bash [npm]
npx vitakit explain teaching --field students
```

:::

## Check your changes

Whether you stopped after the commands or tried the optional edits, check
your work from the terminal:

::: code-group

```bash [pnpm]
pnpm vitakit validate
```

```bash [npm]
npx vitakit validate
```

:::

This checks the content and renders the PDF templates without running LaTeX,
so you do not need a TeX installation. It does not build or typecheck your Vue
components; check the website in the browser as you go. Chapter 8 introduces
the full website check.

For more extensive changes — grouping courses by term, changing layouts or
reusing components — see [customising entries](../../website/entries.md).

**Next:** [the PDF](./pdf.md).

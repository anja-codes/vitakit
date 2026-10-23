# Updating vitakit

A new version of vitakit can change how a setting is written. Your content —
entries, pages, publications — keeps working; what may need changing is how a
page or a PDF uses vitakit. `vitakit migrate` makes those changes for you.

## Step by step

Commit your project first (or copy it), so that you can compare afterwards.

**1. Update the package.**

::: code-group

```bash [pnpm]
pnpm add @anja.codes/vitakit@latest
```

```bash [npm]
npm install @anja.codes/vitakit@latest
```

:::

**2. See what would change.** Nothing is written yet:

::: code-group

```bash [pnpm]
pnpm vitakit migrate --dry-run
```

```bash [npm]
npx vitakit migrate --dry-run
```

:::

Every change is shown as the lines it removes (`-`) and adds (`+`), file by
file, followed by notes: what now works differently, and what it could not
change for you.

**3. Make the changes.** Run it again without `--dry-run`; it asks before writing.

::: code-group

```bash [pnpm]
pnpm vitakit migrate
```

```bash [npm]
npx vitakit migrate
```

:::

**4. Do what it left for you.** Lines starting with **By hand** name a file, and
what to change in it — usually a file you wrote or copied yourself, which
`migrate` does not rewrite.

**5. Check.**

::: code-group

```bash [pnpm]
pnpm vitakit validate
```

```bash [npm]
npx vitakit validate
```

:::

`validate`, like every build, names anything that is still outdated, with the
file and line. Running `migrate` again is harmless: what is up to date stays as
it is.

## From vitakit 0.2

**What changed.** In 0.2, a page chose its publications: `<VitaPublications
:groups="['preprint']" />`. Now that choice is a [publication
list](../content/publications.md#lists), declared once in
`content/publication-lists.yml`, and a page or a PDF only names the list. The
same list shows the same publications everywhere, and lists can do more: the
newest few, a selection by keyword, a year range, groups by year.

**What `migrate` does.** For a project scaffolded with 0.2 (shortened):

```
~ app/pages/publications.vue   VitaPublications shows all
  -     <VitaPublications class="mt-8" />
  +     <VitaPublications list="all" class="mt-8" />
~ cv-tex/cv.tex   shows the publication list all
  - \section{Publications}
  - \vitainput{publications}
  + \vitapublications[Publications]{all}
+ content/publication-lists.yml   declares all
    all:
      groupBy: status
```

Everything it changes:

| In 0.2 | Now |
|---|---|
| `<VitaPublications />` | `<VitaPublications list="all" />`, and the list `all: { groupBy: status }` |
| `<VitaPublications :groups="['preprint']" />` | `<VitaPublications list="preprint" />`, and a list of the preprints, grouped by status |
| `:headings="false"` | a list without groups: one list, newest first |
| `\section{Publications}` and `\vitainput{publications}` | `\vitapublications[Publications]{all}` |
| `publications: { groups: [...] }` in `cv-tex/<document>.yml` | a list, shown by that document's `\vitapublications` |
| `groups` and `defaultGroup` in `schemas/publications.ts` | `statuses` and `defaultStatus` |

The new lists are named after what they show (`all`, `preprint`,
`published-preprint`); rename one in `content/publication-lists.yml` and where it
is shown, if you like. Two things may look different afterwards, and `migrate`
says so where they apply:

- `:groups="['published', 'preprint']" :headings="false"` showed the published
  papers, then the preprints. The list is one list, newest first.
- `groups` in another order than the statuses showed the groups in that order. A
  list grouped by status shows them in the order of the statuses in
  `schemas/publications.ts`; reorder them there.

**New, if you like.** A new project shows its three newest publications on the
home page. To add that to yours:

::: code-group

```bash [pnpm]
pnpm vitakit add publication-list recent --limit 3 --page / --title "Recent publications"
```

```bash [npm]
npx vitakit add publication-list recent --limit 3 --page / --title "Recent publications"
```

:::

**By hand**, where `migrate` finds them:

- `usePublications()` in a page or component of your own: use
  `usePublicationList('all')` — or another list — instead.
- A copy of `VitaPublications.vue` (from `vitakit eject`): its props are now
  `list` and `title`. Compare it with vitakit's, or delete it to use vitakit's.
- A copy of the PDF template `cv-tex/templates/publications.eta`: vitakit's now
  prints one list, in its order. `vitakit customize publications --pdf --force`
  writes vitakit's, keeping yours next to it as a `.backup` to compare.

## From vitakit 0.1

| 0.1 | now |
|---|---|
| `build:cv` script, `vitakit-build-cv` | `pdf` script, `vitakit pdf` |
| `--no-pdf` | `--tex-only` |
| `check:static` script, `vitakit-check` | `vitakit verify` |
| `vitakit list` | `vitakit eject --list` |
| `vitakit add <name>` | `vitakit add section <name>` |
| `vitakit eject <section>` (a schema) | `vitakit customize <section> --schema --copy` |
| `vitakit eject publications` | `vitakit customize publications` |
| `vitakit eject <section>.eta` | `vitakit customize <section> --pdf` |

In an existing project, change the scripts in `package.json` to
`"pdf": "vitakit pdf"` and
`"check": "pnpm typecheck && pnpm generate && vitakit verify"` (with npm:
`npm run typecheck && npm run generate && vitakit verify`).

In `content/`, nothing changes. In code of your own, a value of a **link**
field (an institution, a supervisor, `profile.affiliation`) is `{ label, url? }`;
read `.label` where 0.1 code read `.name`. A schema that imports `institution`
or `link` from `@anja.codes/vitakit` imports `linked` instead — see
[field types](../content/field-types.md#links).

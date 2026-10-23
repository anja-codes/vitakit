# How the commands work

Two kinds of commands. **Scripts** in your project's `package.json` run the
website and the PDF build:

| Script | Does |
|---|---|
| `dev` | the development server, at `http://localhost:3000` |
| `pdf` | render `content/` into `cv-tex/` and run `latexmk` |
| `check` | typecheck, generate the site, verify the output — what CI runs |

**`vitakit`** answers questions about your project and helps change it:

| Command | Does |
|---|---|
| [`vitakit status`](./looking.md#vitakit-status) | what is in this project, what is broken, where sections appear |
| [`vitakit explain <name>`](./looking.md#vitakit-explain-name) | where a section, publication list, PDF document or page comes from, and where it goes |
| [`vitakit validate`](./looking.md#vitakit-validate) | check everything a build would check, without building |
| [`vitakit add section <name>`](./add.md#add-section) | a section: its file, a schema drafted from your entries, its place on a page and in a PDF |
| [`vitakit add field <section> <name>`](./add.md#add-field) | one more field a section accepts |
| [`vitakit add page <name>`](./add.md#add-page) | a website page that can show sections, in the menu |
| [`vitakit add publication-list <name>`](./add.md#add-publication-list) | which publications a list shows, and its place on a page and in a PDF |
| [`vitakit customize <section>`](./customize.md) | make one section yours: how it looks on the website and in the PDF, what it may contain |
| [`vitakit pdf`](./building.md#pdf) | build the PDF documents (what the `pdf` script runs) |
| [`vitakit verify`](./building.md#check-and-vitakit-verify) | check the generated website (the last step of `check`) |
| [`vitakit eject <file>`](./eject.md) | take over a file vitakit shares between all sections (advanced) |
| [`vitakit migrate`](./migrating.md) | after updating vitakit, change what it no longer supports in your files |

Run `vitakit` on its own for the list, and any command with `--help` for its
options and examples.

## pnpm and npm

::: code-group

```bash [pnpm]
pnpm dev
pnpm pdf --tex-only
pnpm vitakit status
```

```bash [npm]
npm run dev
npm run pdf -- --tex-only
npx vitakit status
```

:::

With npm, scripts run with `npm run`, and arguments for the script go after
`--`; `vitakit` runs with `npx`. The examples in these docs have a tab for each,
and every `--help` text is written the way your project runs it.

## Which project

A command works on the project you are in: from any directory inside it, it
finds the nearest `package.json` that depends on `@anja.codes/vitakit`. Inside a
larger repository or workspace, that is your site, not the repository root.
`--root <dir>` names the project explicitly.

## Nothing changes without asking

Every command that writes files first shows what it is about to do, then asks:

```
= content/grants.yml   2 entries
+ schemas/grants.ts   drafted from the 2 entries in content/grants.yml; check its comments
~ app/pages/cv.vue   shows grants after education
        <VitaSection id="education" title="Education" />
  +     <VitaSection id="grants" title="Grants" />

Write these changes? [Y/n]
```

`+` is a new file, `~` a change to one of yours (shown as a diff), `=` a file
that stays as it is, and `?` a change the command leaves to you, with the lines
to paste.

| Option | |
|---|---|
| `--dry-run` | only show what would happen |
| `--yes` | do not ask; use the options given |

Without a terminal — in a script or CI — nothing is asked, and nothing is
written unless `--yes` is given.

## What it edits, and what not

Files are only ever edited at places the command recognizes with certainty,
and only by adding or changing those lines; the rest of the file stays exactly
as you wrote it, comments and formatting included. It recognizes:

- in a page, an element showing a section: `<VitaSection id="talks" … />`, or
  one of your components with a literal `id`;
- in a PDF document, a `\vitasection[…]{…}` or `\vitainput{…}` line;
- in a schema, the fields of `section({ … })` or `extendSection(…, { … })`;
- in `content/profile.yml`, the menu (`nav`), one entry per line.

Where a file does not have that shape — you wrote it your own way — the command
prints what to paste and where, and changes nothing. Files that exist are never
replaced, except by `--force` where a command offers it; yours is then kept
next to the new one as a `.backup`.

## Exit codes

| | |
|---|---|
| `0` | done, or nothing to do |
| `1` | a problem in the project, a failed build, or a cancelled change |
| `2` | the command was called wrongly: an unknown option, a missing argument |

`vitakit status` always exits with 0; `vitakit validate` is the one to use as a
gate.

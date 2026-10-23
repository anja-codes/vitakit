# customize

`customize` makes one section yours: how it looks on the website, how it looks
in the PDF, or what its entries may contain. Without `--web`, `--pdf` or
`--schema`, it asks which.

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching                                  # asks what to change
pnpm vitakit customize teaching --web --pdf --field evaluation   # show a field in both
pnpm vitakit customize talks --web --list --component TalkList   # a list of your own
pnpm vitakit customize talks-public --web --use TalkList         # the same component again
```

```bash [npm]
npx vitakit customize teaching                                  # asks what to change
npx vitakit customize teaching --web --pdf --field evaluation   # show a field in both
npx vitakit customize talks --web --list --component TalkList   # a list of your own
npx vitakit customize talks-public --web --use TalkList         # the same component again
```

:::

## On the website

A section is shown by a component. `--web` writes one of
your own to `app/components/` and uses it everywhere the section appears — the
page line `<VitaSection id="teaching" title="Teaching" />` becomes
`<TeachingSection id="teaching" title="Teaching" />`, with everything else on
the line kept. Two kinds:

- **how each entry reads** (the default): a small component around
  `VitaSection`, which keeps vitakit's list, sorting, dates and styling and
  replaces one line of every entry — its note, or with `--region meta` its
  secondary line — with the fields you choose;
- **how the list is organised** (`--list`): the entries come from vitakit,
  selected and sorted, and the list markup is yours, with a line for every
  field to start from — for numbering, badges, a layout of your own.
  `--group-by term` writes it with a heading for each term.

The component is named for what it shows, `TeachingSection` or what
`--component` says, and works for any section with the same fields: `--use`
shows another section with it.

See [customising entries](../website/entries.md) for what the generated
components contain and how to change them by hand.

## In the PDF

A section is written by a template. `--pdf` copies the template
in use — vitakit's own for the section, or the generic one — to
`cv-tex/templates/<section>.eta`, where yours wins; with `--field`, with a note
line for each field. `--from <section>` starts from another section's template
instead, for two sections that should look alike.

```eta
<%~ it.vita.note(item.note) %>
<%~ it.vita.note`Evaluation: ${item.evaluation}` %>
```

See [templates](../pdf/templates.md) for the helpers a template can use.

## Showing one more field later

A component or template you have already is never rewritten: asked to show
another field, the command prints the lines to add to it, and `--force` starts
over, keeping yours as a `.backup`. The same lines, without writing anything:
`vitakit explain teaching --field evaluation`.

## What its entries may contain

`--schema`:

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching --schema          # add fields to a built-in section
pnpm vitakit customize teaching --schema --copy   # take over its whole definition
pnpm vitakit customize publications               # groups, badges and fields
```

```bash [npm]
npx vitakit customize teaching --schema          # add fields to a built-in section
npx vitakit customize teaching --schema --copy   # take over its whole definition
npx vitakit customize publications               # groups, badges and fields
```

:::

Without `--copy`, `schemas/<section>.ts` keeps vitakit's fields — which keep
improving — and adds yours. With `--copy` it is vitakit's complete definition,
to change or remove any rule; later improvements to it will not reach you. An
existing schema is never replaced. See [schemas](../content/schemas.md).

## Publications

Which publications are shown, in what order and in which groups, is set in
`content/publication-lists.yml` ([lists](../content/publications.md#lists));
`vitakit customize publications` writes their statuses, badges and fields. They
are shown by `VitaPublications` and `VitaPublication`; to change those, `vitakit
eject VitaPublication` (see [publications on the website](../website/publications.md)).
Their PDF template (`--pdf`) prints a list's groups; each reference is formatted by
biblatex (see [bibliography](../pdf/bibliography.md)).

## Options

| Option | |
|---|---|
| `--web`, `--pdf`, `--schema` | what to change; asked when none is given |
| `--field <name>` | show this field (repeatable); asked when not given |
| `--list` | website: a list of your own instead of a component around `VitaSection` |
| `--group-by <field>` | with `--list`: a heading for each value of the field |
| `--region note\|meta` | website: the line of each entry the fields go on |
| `--component <Name>` | website: the component's name |
| `--use <Name>` | website: show the section with a component you have already |
| `--page <route>` | website: also show the section on this page |
| `--from <section>` | PDF: start from another section's template |
| `--copy` | schema: copy a built-in schema whole instead of extending it |
| `--force` | replace your component or template, keeping it as a `.backup` |

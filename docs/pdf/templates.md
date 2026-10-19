# Templates

A section's entries are written into the PDF by a **template**:
`cv-tex/templates/<section>.eta` if you have one, else vitakit's template for
that section, else vitakit's generic one. A template only describes the entries;
headings and order are the document's.

::: code-group

```bash [pnpm]
pnpm vitakit customize teaching --pdf                     # a copy of the template in use
pnpm vitakit customize teaching --pdf --field evaluation  # with a line for a field
pnpm vitakit customize talks-public --pdf --from talks    # a copy of another section's
```

```bash [npm]
npx vitakit customize teaching --pdf                     # a copy of the template in use
npx vitakit customize teaching --pdf --field evaluation  # with a line for a field
npx vitakit customize talks-public --pdf --from talks    # a copy of another section's
```

:::

A template whose name matches no section is an error rather than a file that is
silently never read — so `talk.eta` tells you it meant `talks.eta`. A local
`_generic.eta` is the fallback for sections without a named template; named
templates (local or bundled) take precedence. `vitakit explain <section>` shows
which template a section uses; `vitakit validate` renders every template
without running LaTeX.

## Writing entries

After `vitakit customize teaching --pdf`, `cv-tex/templates/teaching.eta` is
yours. Templates receive the document's already-selected,
sorted entries as `it.entries`. They describe the entries, not section headings or
ordering.

```eta
<% for (const item of it.entries) { %>
<%~ it.vita.entry({
  date: it.text(item.term) || it.date(item.date),
  title: item.title,
  context: it.join([item.role, it.linked(item.institution)])
}) %>
<%~ it.vita.note(item.note) %>
<%~ it.vita.note`Evaluation: ${item.evaluationScore}/5` %>
<% } %>
```

The evaluation line is an example for a field you have added to the schema.
Adding a schema field does not display it automatically.

`<% … %>` runs JavaScript; `<%~ … %>` inserts helper output. `it` is Eta's name for
its input object. Every helper escapes inserted data, and helper results can be
passed directly to other helpers without being escaped twice.

## Helpers

| Helper | Meaning |
|---|---|
| `it.text(value)` | text, numbers, or booleans; absent values become empty output |
| `it.date(value)` | a normalized date or range from a `dateRange` schema field |
| `it.linked(value)` | text, or a `{ label, url? }` value (a **link** field); links only when a URL exists |
| `it.linked(label, url)` | the same operation with a separate label and URL |
| `it.url(value)` | a URL target for hand-written LaTeX, not a complete visible link |
| `it.join(values, separator)` | combine nonempty values; separator defaults to `, ` |
| `it.vita.entry({ date, title, context })` | emit `\vitaentry`; date and context are optional |
| `it.vita.note(value)` | emit `\vitanote` unless the value is absent |

There is one text helper regardless of a field's internal representation.
Formatting follows the schema: a `richText` field retains its mathematics, while
ordinary strings are literal text (so `Budget: $500` stays currency). This does
not add Markdown-to-LaTeX conversion: other Markdown formatting still appears
literally. Unknown structured values are errors rather than `[object Object]`;
use `date` or `linked` as appropriate.

`join` accepts data and formatted helper results, omits only empty output, and
keeps zero and `false`. A custom separator is text too. Unlike notes, an entry
is not omitted when one of its slots is empty.

## Optional sentences

Use a **tagged template string**, with no parentheses, to put text around optional
values:

```eta
<%~ it.vita.note`Evaluation: ${item.evaluationScore}/5` %>
<%~ it.vita.note`Hosted by ${it.linked(item.institution)}` %>
<%~ it.optional`\vitanote{Custom note: ${item.note}}` %>
```

If **any** inserted value is absent (`undefined`, `null`, or empty output), the
whole tagged fragment is omitted, including its labels and punctuation. Zero and
`false` are present values. A tag with no inserted values always emits its literal
content.

Literal portions of these tags are template-authored LaTeX: write `\emph{…}` or
`\&` directly, with single backslashes. Inserted values are escaped automatically;
formatted results from `linked`, `date`, etc. are preserved. `vita.note` wraps the
body in `\vitanote{…}`; the lower-level `optional` tag emits just the fragment.

For independently optional clauses, use separate tags and join their results:

```eta
<%~ it.vita.note(it.join([
  it.optional`\emph{${item.title}}`,
  it.optional`, supervised by ${it.linked(item.supervisor)}`
], '')) %>
```

Compose with these tags and `join`, rather than ordinary JavaScript string
concatenation: concatenation loses the distinction between data and generated
LaTeX and can cause double escaping. The wrappers still emit ordinary CV macros;
redefine those in `preamble.tex` to change their appearance.

## Generic and bibliography templates

The generic fallback additionally has `it.generic.title(item)` and
`it.generic.context(item)`, which select conventional fields and return formatted
output. Named templates normally choose their fields explicitly. Teaching's term
preference likewise lives in its template, not a special formatter.

Only the publications template has `it.bib.group(group)`, which emits the
citation-key selection check used by biblatex. It is not an ordinary entry helper.

## Templates from vitakit 0.1

The previous helper names are no longer provided:

- `tex` and `rich` become `text`; `inst` and `linkOrText` become `linked`.
- Replace `term(item)` with `text(item.term) || date(item.date)`.
- Replace `rich(titleOf(item))` and `secondaryOf(item)` with
  `generic.title(item)` and `generic.context(item)`.
- In publications templates, `bibgroup(group)` becomes `bib.group(group)`.

All names above are accessed through `it`. If an old template deliberately used
`rich` on a plain string to preserve mathematics, declare that field as `richText`
in its schema instead. The renderer, not the template author, then handles its
representation.

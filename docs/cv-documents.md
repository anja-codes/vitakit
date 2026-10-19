# CV documents

A **document** is a `.tex` file you own. vitakit renders `content/` into
`cv-tex/generated/<document>/`, one file per section; `latexmk` typesets it. There is
no `-shell-escape` and no Python: LaTeX only typesets what is already on disk.

::: code-group

```bash [pnpm]
pnpm build:cv                 # every document
pnpm build:cv cv              # one document
pnpm build:cv --no-pdf        # only generate .tex (no TeX installation needed)
```

```bash [npm]
npm run build:cv                    # every document
npm run build:cv -- cv              # one document
npm run build:cv -- --no-pdf        # only generate .tex (no TeX installation needed)
```

:::

After `build:cv --no-pdf`, a plain `latexmk cv.tex` in `cv-tex/` works as well,
e.g. from an editor or a CI action: `cv-tex/latexmkrc` lets LaTeX find the generated
document class.

## Two files per document

| | |
|---|---|
| `cv-tex/<name>.tex` | **order and structure** — moving a line moves a section |
| `cv-tex/<name>.yml` | **selection** — what goes in, optional |

```tex
\documentclass{vitakit-cv}
\vitadocument{cv}                          % selects generated/cv/
\addbibresource{../content/publications.bib}
\input{preamble.tex}
\vitainput{profile}                       % header data and document settings

\begin{document}
\vitaheader

\vitasection[Employment]{employment}
\vitasection[Education]{education}
\vitasection[Teaching]{teaching}

\section{Publications}\vitainput{publications}

\vitasection[Supervised theses]{supervision}
\vitasection[Selected talks]{talks}
\end{document}
```

```yaml
# cv-tex/cv.yml
visibility: cv            # include public and cv entries, not private
sections:
  talks:
    where: { kind: invited }
    limit: 10
```

### Macros

| Macro | Meaning |
|---|---|
| `\vitadocument{name}` | which generated directory to read |
| `\vitaheader` | name, tagline and contact line from `profile.yml` |
| `\vitasection[Heading]{id}` | heading + the generated entries; heading argument optional, section omitted when the selection is empty |
| `\vitainput{id}` | the generated file only, no heading or list (profile, publications) |
| `\vitasectiontitle{id}{Text}` | heading wording for this document |
| `\vitaentry{date}{title}{context}`, `\vitanote{…}` | what generated files emit |

Choose a heading at the point of use with the optional argument:

```tex
\vitasection[Public engagement]{outreach}
```

It applies to that invocation only. Without it, the heading comes from the
document's YAML `title`, then `\vitasectiontitle` in the shared preamble, then
the literal section ID. Inline headings are ordinary LaTeX, so write `\&` for
an ampersand, for example.

Because `\vitasection` emits a real `\section`, `\tableofcontents` and PDF bookmarks
work as usual.

### Selection options

```yaml
visibility: public | cv | private     # default: cv
sections:
  <id>:
    where: { kind: [invited, seminar] }  # field equals this value, or one of them;
                                         # the same as <VitaSection :where>
    since: 2020                          # start year at least this
    until: 2024                          # start year at most this
    limit: 10                            # keep the newest N
    title: Selected talks                # heading wording, this document only
publications:
  groups: [published, preprint]          # omit the software group
```

That is the whole list, and it is meant to stay that way. `where` compares against
the field as written (for rich-text fields, their source text; for a link,
its label). There is no query language, no `or`, no negation: selection subtler than
this belongs in a hand-written `.tex` or an
[ejected template](./customising.md), which is already how everything else specific
is done here.

Unknown options and section IDs are errors naming the document's YAML file.
For schemas made with `section()` or `extendSection()`, `where` field names are
checked against the schema too, including optional fields absent from the data.

Empty selections are omitted by `\vitasection`, including their headings.
Manually written headings, such as `\section{Publications}`, remain yours to show
or remove.

A YAML `title` overrides the label from the shared preamble. Keep
`\vitainput{profile}` after `\input{preamble.tex}`: the generated profile also
contains the document's title overrides and empty-section markers.

## Making a variant

A document is a file, so make one by copying a file:

```bash
cp cv-tex/cv.tex cv-tex/teaching-uni-x.tex
cp cv-tex/cv.yml cv-tex/teaching-uni-x.yml      # optional
```

Change `\vitadocument{cv}` to `\vitadocument{teaching-uni-x}` in the copy, reorder the
`\vitasection` lines, adjust the YAML, then `build:cv teaching-uni-x`.

**The data is untouched**, so your website and every other variant are unaffected.
If an older document uses `\input{generated/cv/profile.tex}`, replace that line
with `\vitainput{profile}` first, so the copy reads its own generated profile.

## A prescribed order

Calls often prescribe exactly what a dossier must contain. That is purely a matter of
the `.tex`:

```tex
\begin{document}
\input{prose/application-xyz-cover.tex}   % 1. cover letter
\newpage
\tableofcontents                          % 2. table of contents
\newpage
\section{Publications}\vitainput{publications} % 3. publications
\input{prose/research-statement.tex}      % 4. research statement
\vitasection[Courses taught]{teaching}    % 5. courses taught
\vitasection{supervision}                 % 6. supervised theses
\input{prose/teaching-statement.tex}      % 7. teaching statement
\end{document}
```

The optional argument sets the prescribed wording directly in the document.
Use `\vitasectiontitle` in the preamble for labels shared across documents.

## Prose

Cover letters and statements live in `cv-tex/prose/*.tex` as plain LaTeX, and are
never read by the website build. Include them with `\input` wherever you want them.

## Styling

`preamble.tex` is yours. Generated files only use the macros above, so redefining
those changes the design without touching anything vitakit produces:

```tex
\renewcommand{\vitaentry}[3]{\item[#1]\textsc{#2}\par{\small #3}}
```

For deeper changes, `vitakit eject vitakit-cv.cls` copies the class into
`cv-tex/`, where it is yours and takes precedence, and
`vitakit eject talks.eta` copies the template that generates a section.

**Do not edit `cv-tex/generated/`.** Everything there — the section files, the
profile header and the copy of the class — is rewritten on every build. An ejected file always wins: `cv-tex/` comes before the generated
directory in the LaTeX search path.

A template whose name matches no section is an error rather than a file that is
silently never read — so `talk.eta` tells you it meant `talks.eta`.
A local `_generic.eta` is the fallback for sections without a named template;
named templates (local or bundled) take precedence.

## Editing entries with Eta

Eject a bundled template with `pnpm vitakit eject teaching.eta`, then edit
`cv-tex/templates/teaching.eta`. Templates receive the document's already-selected,
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

### Formatting and composition

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

### Optional sentences and LaTeX fragments

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

### Generic and bibliography templates

The generic fallback additionally has `it.generic.title(item)` and
`it.generic.context(item)`, which select conventional fields and return formatted
output. Named templates normally choose their fields explicitly. Teaching's term
preference likewise lives in its template, not a special formatter.

Only the publications template has `it.bib.group(group)`, which emits the
citation-key selection check used by biblatex. It is not an ordinary entry helper.

### Migrating an older ejected template

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

## What the build writes

```
cv-tex/
  cv.tex, cv.yml, preamble.tex, prose/   your files, never modified
  cv.pdf                                 the result
  generated/cv/                          everything else: section .tex files,
                                         vitakit-cv.cls, and all of latexmk's
                                         auxiliary output
```

Obsolete generated section files are removed on each build, so deleting a data
source cannot silently leave its old entries in the PDF. Remove its
`\vitasection` line too; an input for a missing source is an error, not an empty
selection. Bibliography output is regenerated even when no publications remain.

`cv-tex/generated/` is disposable; latexmk's auxiliary files are kept between
builds, and you can delete the directory for a completely clean build.

## Bibliography

The class loads biblatex, and `\vitainput{publications}` prints one list per group.
The groups are the website's: vitakit decides which entry belongs where (an entry
without `status` is `published`, and `Published` counts as `published`) and
`generated/<document>/publications.tex` selects each group by citation key, so the
PDF and the website always list the same entries. `arxiv` becomes an eprint link.

For a list of your own, `\printbibliography[keyword=published]` also works: the
`status` field is copied to `keywords`, as written. Pass
`\documentclass[nobib]{vitakit-cv}` to load biblatex yourself instead.

Building the bibliography needs **biber** (part of every current TeX distribution);
`latexmk` runs it for you.

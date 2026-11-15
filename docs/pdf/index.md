# Documents

A **document** is a `.tex` file you own. vitakit renders `content/` into
`cv-tex/generated/<document>/`, one file per section; `latexmk` typesets it.
There is no `-shell-escape` and no Python: LaTeX only typesets what is already
on disk. The scaffold has one document, `cv-tex/cv.tex`; every copy is another.

::: code-group

```bash [pnpm]
pnpm pdf                 # every document
pnpm pdf cv              # one document
```

```bash [npm]
npm run pdf                    # every document
npm run pdf -- cv              # one document
```

:::

More about building — without a TeX installation, in CI: [building](./building.md).

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

\vitapublications[Publications]{all}

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
| `\vitaheader` | name, tagline and contact line from `profile.yml`; the [portrait](#portrait) beside them, if any |
| `\vitasection[Heading]{id}` | heading + the generated entries; heading argument optional, section omitted when the selection is empty |
| `\vitapublications[Heading]{list}` | a [publication list](../content/publications.md#lists), with its heading; omitted when the list is empty |
| `\vitainput{id}` | the generated file only, no heading or list (profile) |
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
portrait: true | /img/print.jpg       # default: none; see Portrait below
sections:
  <id>:
    where: { kind: [invited, seminar] }  # field equals this value, or one of them;
                                         # the same as <VitaSection :where>
    since: 2020                          # start year at least this
    until: 2024                          # start year at most this
    limit: 10                            # keep the newest N
    title: Selected talks                # heading wording, this document only
```

Publications are selected by the [list](../content/publications.md#lists) the
document shows with `\vitapublications`, which accepts the same `where`, `since`,
`until` and `limit`.

That is the whole list, and it is meant to stay that way. `where` compares against
the field as written (for rich-text fields, their source text; for a link,
its label). There is no query language, no `or`, no negation: selection subtler than
this belongs in a hand-written `.tex` or an
[template of your own](./templates.md), which is already how everything else specific
is done here.

Unknown options and section IDs are errors naming the document's YAML file.
For schemas made with `section()` or `extendSection()`, `where` field names are
checked against the schema too, including optional fields absent from the data.

Empty selections are omitted by `\vitasection` and `\vitapublications`, including
their headings. Headings written by hand, such as a `\section{…}` of your own,
remain yours to show or remove.

A YAML `title` overrides the label from the shared preamble. Keep
`\vitainput{profile}` after `\input{preamble.tex}`: the generated profile also
contains the document's title overrides and empty-section markers.

### Portrait

A document shows a photo beside its header when its YAML asks for one:

```yaml
# cv-tex/cv.yml
portrait: true                 # avatar from content/profile.yml
portrait: /img/print.jpg       # or another image below public/
```

It is off by default, so a variant for a place that expects no photo simply
leaves the line out. The image must be a JPG, PNG or PDF; LaTeX cannot include
SVG, so an SVG `avatar` needs a path to another format here. A missing
file, an unsupported format or `true` without an `avatar` is an error that
names the document's YAML file.

The portrait is 3 cm high and at most a quarter of the line wide. Change its
height in `preamble.tex`:

```tex
\setlength{\vitaportraitheight}{4cm}
```

For another layout, [take over the class](./styling.md#taking-over-the-class)
and change `\vitaheader` there.

`vitakit explain <section>` shows, for each document, which entries it selects
and which option removed the others; `vitakit explain cv` lists what a
document includes.

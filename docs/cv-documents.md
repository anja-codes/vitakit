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
\input{generated/cv/profile.tex}           % header data from profile.yml

\begin{document}
\vitaheader

\vitasection{employment}
\vitasection{education}
\vitasection{teaching}

\section{Publications}\vitainput{publications}

\vitasection{supervision}
\vitasection{talks}
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
| `\vitasection{id}` | heading + the generated entries for that section |
| `\vitainput{id}` | the generated file only, no heading or list (publications) |
| `\vitasectiontitle{id}{Text}` | heading wording for this document |
| `\vitaentry{date}{title}{context}`, `\vitanote{…}` | what generated files emit |

Because `\vitasection` emits a real `\section`, `\tableofcontents` and PDF bookmarks
work as usual.

### Selection options

```yaml
visibility: public | cv | private     # default: cv
sections:
  <id>:
    where: { kind: [invited, seminar] }  # field equals this value, or one of them
    since: 2020                          # start year at least this
    until: 2024                          # start year at most this
    limit: 10                            # keep the newest N
    title: Selected talks                # heading wording, this document only
publications:
  groups: [published, preprint]          # omit the software group
```

That is the whole list, and it is meant to stay that way. `where` compares against
the field as written (for rich-text fields, their source text; for an institution,
its name). There is no query language, no `or`, no negation: selection subtler than
this belongs in a hand-written `.tex` or an
[ejected template](./customising.md), which is already how everything else specific
is done here.

Unknown keys are an error, naming the file — so a typo is never silently ignored.

## Making a variant

A document is a file, so make one by copying a file:

```bash
cp cv-tex/cv.tex cv-tex/teaching-uni-x.tex
cp cv-tex/cv.yml cv-tex/teaching-uni-x.yml      # optional
```

Change `\vitadocument{cv}` to `\vitadocument{teaching-uni-x}` in the copy, reorder the
`\vitasection` lines, adjust the YAML, then `build:cv teaching-uni-x`.

**The data is untouched**, so your website and every other variant are unaffected.

## A prescribed order

Calls often prescribe exactly what a dossier must contain. That is purely a matter of
the `.tex`:

```tex
\begin{document}
\input{prose/application-xyz-cover.tex}   % 1. cover letter
\newpage
\tableofcontents                          % 2. table of contents
\newpage
\vitasection{publications}                % 3. publications
\input{prose/research-statement.tex}      % 4. research statement
\vitasection{teaching}                    % 5. courses taught
\vitasection{supervision}                 % 6. supervised theses
\input{prose/teaching-statement.tex}      % 7. teaching statement
\end{document}
```

Use `\vitasectiontitle{teaching}{Courses taught}` in the preamble when the call
prescribes the wording too.

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

## What the build writes

```
cv-tex/
  cv.tex, cv.yml, preamble.tex, prose/   your files, never modified
  cv.pdf                                 the result
  generated/cv/                          everything else: section .tex files,
                                         vitakit-cv.cls, and all of latexmk's
                                         auxiliary output
```

`cv-tex/generated/` is disposable: delete it whenever a build looks stale.

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

# Styling

The look of every document is `cv-tex/preamble.tex`, which is yours. Fonts,
margins, colours and spacing are ordinary LaTeX there: anything you would put in
a preamble works.

```tex
% cv-tex/preamble.tex
\usepackage{libertinus}
\geometry{margin=2cm}
```

## The macros

Generated files use only a few [macros](./index.md#macros) of vitakit's
document class, so redefining those in `preamble.tex` changes how every entry
and heading is typeset, without touching anything vitakit writes:

```tex
% the title in small caps, the details on the next line
\renewcommand{\vitaentry}[3]{\item[#1]\textsc{#2}\par{\small #3}}
```

| Macro | Typesets |
|---|---|
| `\vitaentry{date}{title}{details}` | one entry: the date in the margin column, then title and details |
| `\vitanote{text}` | a further line of an entry |
| `\vitaheader` | name, position and contact line |
| `\vitasectiontitle{section}{Heading}` | a section's heading in every document that includes this preamble |

## Taking over the class

For changes the macros do not reach — the page layout, how sections are
headed, which packages are loaded — copy the class into your project:

::: code-group

```bash [pnpm]
pnpm vitakit eject vitakit-cv.cls   # -> cv-tex/vitakit-cv.cls
```

```bash [npm]
npx vitakit eject vitakit-cv.cls   # -> cv-tex/vitakit-cv.cls
```

:::

It is yours from then on, and every document uses it: later improvements to the
class in vitakit will not reach you. To change how one section's entries are
written, rather than how they look, change its [template](./templates.md).

## Characters

Under pdfLaTeX, the class uses the T1 font encoding and Latin Modern, so names
and places such as „Łódź" or „Győr" typeset. LuaLaTeX and XeLaTeX use Unicode
fonts of their own.

**Do not edit `cv-tex/generated/`.** Everything there — the section files, the
profile header and the copy of the class — is rewritten on every build. A file
of yours in `cv-tex/` always wins over the generated one: it comes first in the
LaTeX search path.

# Tutorial

This tutorial builds a complete academic website and a typeset CV, from an
empty directory to a published site. It follows Lena Berger, a postdoc in
probability at the University of Graz, and uses her data as the running
example; use your own as you go.

| Chapter | |
|---|---|
| [1. Create and run](./create.md) | a working site on your machine, and a tour of it |
| [2. Make it yours](./make-it-yours.md) | your name, links, menu, and the text of your pages |
| [3. Your CV entries](./entries.md) | employment, education, teaching, talks; what errors look like |
| [4. Publications](./publications.md) | your BibTeX file, and lists of it: the newest, all of them grouped, your selected papers |
| [5. A section of your own](./own-section.md) | grants: a list vitakit does not know yet |
| [6. Showing more](./showing-more.md) | a new field, on the website and in the PDF |
| [7. The PDF](./pdf.md) | what goes into the CV, in which order, and a variant for one application |
| [8. Check and publish](./publish.md) | what CI checks, and putting the site online |

Each chapter takes ten to twenty minutes and ends with a working site.

## What you need

- **Node.js 22.18 or newer**, and a terminal. Check with `node --version`.
- **pnpm** or **npm**. npm comes with Node; the examples have a tab for each.
- **git**, to keep your project — and, for publishing, an account with a host
  such as GitHub, GitLab or Cloudflare. Chapter 8 helps you choose.
- For the PDF, **a TeX distribution** with `latexmk` and `biber`: TeX Live,
  MacTeX or MiKTeX. Without one, you can still do everything else, and let CI
  build the PDF.

No web development experience is needed. You will edit YAML (lists of
`field: value` lines), Markdown (text), and occasionally copy a line of HTML or
LaTeX that the commands write for you.

If you would rather read how the pieces fit together first:
[concepts](../concepts.md).

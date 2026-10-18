# Troubleshooting

Most problems announce themselves with the file and field. These are the ones where
the message needs context.

## Content

**`Unrecognized key: "titel"`** — a typo, or a field that section does not have.
Schemas are strict on purpose: the alternative is a silently missing line on your
site. See the [content reference](./content-reference.md).

**`no schema for this file; create schemas/outreach.ts`** — you added
`content/outreach.yml` without telling vitakit its shape. The message prints a
starter snippet; see [adding a section](./customising.md#layer-5--adding-a-section).

**`expected a date like 2024, 2024-03 or 2024-03-15, got "June 2025"`** — dates are
written numerically. Free-form labels belong in `term` (teaching) or `note`.

**`range ends (2019) before it starts (2023)`** — `from` and `to` are swapped.

**A section is missing from the site** — check that the file is not empty, that its
entries are not all marked `visibility: cv`, and that the page actually renders it
(`<VitaSection id="…" />`).

## Mathematics

**`invalid TeX … Undefined control sequence: \kk`** — a typo in a formula, reported
with the file and field. The same check runs on `.bib` titles, where the message
names the citation key.

**`KaTeX refused to render: \href{…}`** — `\href`, `\url` and `\includegraphics` are
disabled inside mathematics. Rendered formulas are inserted into the page without
further sanitization, so allowing them would let a formula inject markup. Put links
outside the formula, in Markdown.

**A formula renders inline when it should be displayed** — both `$$x$$` on one line
and a `$$ … $$` block work; if it still looks inline, check for a stray `$`.

## Build and deployment

**Every link and asset is broken on the deployed site** — the base path is wrong. A
project site at `https://user.github.io/repo/` needs
`NUXT_APP_BASE_URL=/repo/`; a user site or custom domain needs `/`. The scaffolded
workflow sets it; `pnpm check` verifies it.

**`ERR_PNPM_BAD_PM_VERSION` in CI** — the pnpm version is given twice: in the workflow
and in `packageManager`. Remove the `version:` line from `pnpm/action-setup`.

**`SyntaxError: … does not provide an export named 'styleText'` in CI** — the runner's
Node is too old. Pin Node 22 with `actions/setup-node` and keep it in sync with
`engines.node`.

**`schemas/<name>.ts: cannot load TypeScript on Node 22.x`** — vitakit loads the
files in `schemas/` with Node's built-in TypeScript support, which needs Node
22.18 or newer. Update Node; `node-version: 22` in a workflow already gets a
recent enough release.

**`No projects found in "/some/dir"` from pnpm** — a `pnpm-workspace.yaml`
*above* your project makes pnpm treat that directory as the workspace root, and
your project is not listed in it. Either move the project out of that tree, or
add it to the workspace file. (The message names the workspace root, not the
file, which makes this hard to spot.)

**A change to `schemas/*.ts` seems to be ignored** — fixed in recent versions,
which reload the module when its modification time changes. If you are on an
older one, restart the dev server.

**An image works locally but 404s on the deployed site** — it was written in a
way vitakit could not rewrite for the base path. Markdown images, raw `<img>`
in Markdown (including `srcset`, `<video>`, `<source>`) and `profile.avatar` are
all handled; a path hard-coded in a Vue file is not — use `<NuxtLink>`, or prefix
it with `useRuntimeConfig().app.baseURL`. `pnpm check` reports these when the site
uses a base path.

**`vitakit-check: no generated site`** — run `pnpm generate` first; `pnpm check` does
both.

**`… entry 2 is marked "cv" but its text appears in …`** — a non-public entry's title
reached the generated site; the message names the file, the entry number and the page.
See [privacy](./privacy.md). This is a text comparison, so a title that genuinely
appears on that page for another reason is a false positive: pass
`vitakit-check --no-leak-check` in that case.

## The PDF

**`latexmk not found`** — install a TeX distribution (TeX Live, MacTeX), or use
`pnpm build:cv --no-pdf` and let CI build the PDF.

**The bibliography is empty** — biber has not run, or the `.bib` path in
`\addbibresource` is wrong. `latexmk` runs biber automatically; delete
`cv-tex/*.bcf` and rebuild if it got stuck.

**`There's no line here to end`** — usually an ejected template emitting a blank line
inside an entry: a blank line starts a new paragraph, after which a continuation
fails. Keep template output free of blank lines.

**A section is in the PDF but not on the website (or the reverse)** — that is the
design: the website composes sections in `app/pages/`, the PDF in `cv-tex/*.tex`, and
each document filters independently.

**Citations look different in the two outputs** — expected. The website uses a CSL
style, the PDF uses biblatex. To change the website's, see
[citation style](./content-reference.md#citation-style).

**A `<text variable="DOI"/>` in my CSL style prints nothing** — by design: an
identifier vitakit already links (as the title link or a badge) is withheld from the
style, so that it is not printed twice. Remove the badge in `schemas/publications.ts`
(`pnpm vitakit eject publications`) if you would rather print it.

**`… is a path on the website, and the PDF can only link it …`** — a link such as
`/slides/talk.pdf` works on the website, but a PDF has no site to be relative to. Add
the address your site is published at to `content/profile.yml`
(`url: https://jane.github.io/site/`), and the PDF links the full URL.

**`unknown status …` in `content/publications.bib`** — every `status` must be one of
the groups in `schemas/publications.ts` (or the default groups, without that file).
Add the group there, or correct the entry.

## Development

**Adding or removing an ejected Vue component briefly restarts dev** — when a
local component takes over a packaged VitaKit component (or gives it back),
VitaKit requests a normal Nuxt soft restart so existing imports use the new
component. Editing an existing override still uses HMR; content and schema
changes still reload in place.

**The dev server shows a red banner** — content problems. The site keeps working
around them; fix the file and it recovers without a restart. The same problems fail a
build.

**A change to `content/` does nothing** — the watcher covers `content/` and
`schemas/`. Changes elsewhere (for example `nuxt.config.ts`) restart Nuxt instead.

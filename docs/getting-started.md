# Getting started

::: code-group

```bash [pnpm]
pnpm create @anja.codes/vitakit my-site
cd my-site
pnpm install
pnpm dev
```

```bash [npm]
npm create @anja.codes/vitakit my-site
cd my-site
npm install
npm run dev
```

:::

`http://localhost:3000` now serves a complete example site. Everything below is
editing files in a repository you own.

## 1. Make it yours

| File | What to change |
|---|---|
| `content/profile.yml` | name, position, affiliation, email, links, navigation, footer |
| `content/education.yml`, `employment.yml`, `teaching.yml`, `talks.yml`, `supervision.yml` | replace the examples |
| `content/publications.bib` | your BibTeX export |
| `content/pages/*.md` | the prose pages |

Save and the page reloads. **Delete a file you do not need and its section
disappears**; there is nothing else to switch off.

Full field list: [content reference](./content-reference.md).

## 2. When something is wrong

Content is validated, so mistakes are caught immediately and named:

```
[vitakit] 1 content problem(s):
  content/talks.yml: invalid
    - 0: Unrecognized key: "titel"
```

The development server keeps running, the affected page shows the error in place, a
red banner lists every problem, and saving a fix recovers without a restart. The same
problem fails `nuxt generate`, so a broken file cannot reach your website.

## 3. Build the PDF

::: code-group

```bash [pnpm]
pnpm build:cv
```

```bash [npm]
npm run build:cv
```

:::

This renders `content/` into `cv-tex/generated/cv/` and runs `latexmk`, producing
`cv-tex/cv.pdf`. It needs a TeX distribution; if you do not have one locally, the
`CV` workflow builds it in CI and attaches it to the run.

The order of the PDF is decided in `cv-tex/cv.tex`, which is yours: moving a
`\vitasection{…}` line moves a section. See [CV documents](./cv-documents.md).

## 4. Check what CI will check

::: code-group

```bash [pnpm]
pnpm check     # typecheck + generate + assertions on the generated HTML
```

```bash [npm]
npm run check     # typecheck + generate + assertions on the generated HTML
```

:::

The last step verifies that pages were generated, mathematics was typeset, the
deployment base path is right, the bibliography is fully formatted, and **no entry marked
`cv` or `private` appears anywhere in the site**.

## 5. Publish

The creator wrote a workflow for the target you chose.

| Target | Notes |
|---|---|
| **Cloudflare Pages** | Recommended. Builds from **private** repositories on the free tier |
| GitHub Pages | Requires a public repository unless you have Pro/Team |
| rsync | For university web space; set the host and path in the workflow |

Assume your repository is private: it holds a phone number, an address, possibly
referees or a cover letter. What is controlled is the *website build*, not the
repository. See [privacy](./privacy.md).

If you deploy to `https://user.github.io/repo/` rather than a domain of your own, the
site lives under a base path; the workflow sets `NUXT_APP_BASE_URL` for you, and a
wrong value fails the build rather than producing a site with broken links.

## Next

- [Commands](./cli.md) — `add`, `eject`, `build:cv`, `check`
- [Content reference](./content-reference.md) — every field of every file
- [Customising](./customising.md) — design, page structure, your own sections
- [CV documents](./cv-documents.md) — variants, ordering, cover letters
- [Privacy](./privacy.md) — what reaches the web, and what cannot

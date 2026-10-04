# Privacy

A CV contains things a website should not: a private address and phone number,
referees, an exhaustive talk list, sometimes a cover letter written for one
application. vitakit is built so that keeping those off the web is structural rather
than a matter of remembering.

## The model

**Assume your repository is private.** That is where the sensitive material lives, and
it is the natural place for it. What needs controlling is not the repository but
**what the website build emits**.

```
content/*.yml   visibility: public | cv | private
                      │
      website build ──┴── hard-wired to `public`, not configurable
      cv-tex/*.tex  ──── document's own `visibility:`, default `cv`
```

## Marking content

```yaml
- date: { from: 2019, to: 2019 }
  position: Visiting Researcher
  institution: Uppsala University
  visibility: cv          # in the PDF, never on the website
```

| Level | Website | PDF (`visibility: cv`) | PDF (`visibility: private`) |
|---|---|---|---|
| `public` (default) | yes | yes | yes |
| `cv` | **no** | yes | yes |
| `private` | **no** | no | yes |

A document's `visibility:` sets the highest level *it* may include, so an application
dossier with a cover letter would use `private`, while a CV you hand out uses the
default `cv`.

## Three independent guarantees

1. **The website loader is hard-wired to `public`.** It is not an option in
   `nuxt.config.ts`, so there is no flag to set wrongly.
2. **`cv-tex/prose/` is never read by the website build.** Cover letters and
   statements are plain LaTeX in a directory the web pipeline does not look at.
3. **`vitakit-check` verifies the output.** It reloads your content *with* private
   entries visible and fails if a non-public entry's *title* appears in the visible
   text of any generated page — the backstop for a page that prints something it
   should not. Only title-like fields are compared, because an institution or
   co-author name is usually public for some other entry; if a match is still a
   coincidence, run `vitakit-check --no-leak-check`.

```
$ pnpm check
  ok  4 page(s) generated
  ok  1 non-public entr(ies) absent from the site
```

Run it in CI (the scaffolded workflows do) so a leak fails the deployment.

## PDFs are not published

`pnpm build:cv` writes to `cv-tex/`. Nothing copies a PDF into `public/`, and the
`CV` workflow attaches it to the run as an artifact rather than deploying it. The
website already renders your CV information directly, so there is usually nothing to
gain from publishing the PDF as well.

If you do want `/cv.pdf` on your site, copy it into `public/` yourself — knowing that
it may carry `cv`-level material.

## A note on GitHub Pages

A GitHub Pages site built from a private repository is still **served publicly**;
private source does not mean a private site. And on the free plan, Pages requires a
public repository at all.

This is why **Cloudflare Pages is the recommended target**: it builds from private
repositories on the free tier, so your content stays private while the site is
public — which is exactly the intended arrangement.

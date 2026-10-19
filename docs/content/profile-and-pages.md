# Profile and pages

## `content/profile.yml`

The only file that is not a CV section: who you are, plus the shape of the site.

| Field         | Type                    | Required | Notes                                                                                                                 |
| ------------- | ----------------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| `name`        | text                    | yes      | Site header, page titles and CV header                                                                                |
| `title`       | text                    | no       | e.g. `Postdoctoral Researcher`                                                                                        |
| `affiliation` | link                    | no       |                                                                                                                       |
| `email`       | email                   | no       |                                                                                                                       |
| `links`       | list of links           | no       | ORCID, GitHub, arXiv, …                                                                                               |
| `summary`     | text                    | no       | One or two sentences for metadata; not rendered on the page — prose belongs in `content/pages/index.md`               |
| `url`         | http(s) URL             | no       | Where the site is published, e.g. `https://jane.github.io/site/`. The PDF needs it to link [paths on the site](./field-types.md#web-addresses) |
| `avatar`      | path                    | no       | Below `public/`, e.g. `/img/portrait.jpg`                                                                             |
| `nav`         | list of `{ label, to }` | no       | Navigation; explicit, so wording and order are yours                                                                  |
| `footer`      | text                    | no       | Inline Markdown, shown at the bottom of every page                                                                    |

Navigation is not derived from your pages: adding a page does not change the
menu (`vitakit add page` adds the entry for you).

## `content/pages/*.md`

The file name is the route: `research.md` → `/research/`, `index.md` → `/`.

```md
---
title: Research
description: Analytic combinatorics.
order: 10
---

Prose, $mathematics$, tables and images.
```

| Front matter  | Type     | Required | Notes                                           |
| ------------- | -------- | -------- | ----------------------------------------------- |
| `title`       | formatted text | yes |                                           |
| `description` | text     | no       | Meta description and page lead                  |
| `route`       | path     | no       | Override the file-name route, e.g. `/about/me/` |
| `order`       | integer  | no       | Sort order; defaults to `100`                   |

Body Markdown supports GFM (tables, strikethrough, task lists), `$inline$` and
`$$display$$` mathematics, and images from `public/`. Write paths as if the site
were served from `/`: root-relative links and assets such as `[CV](/cv/)` or
`/img/tree.svg` are rewritten for the deployment base URL, so they work both locally
and under `user.github.io/repo/`. That covers Markdown links and images as well as
raw HTML — `href`, `src`, `srcset`, `poster`, `<object data>` and form actions.
Relative paths (`img/tree.svg`) and full URLs are left alone.

A page that should also show sections needs a Vue page next to its Markdown;
see [pages and routes](../website/index.md).

# 2. Make it yours

## Your profile

`content/profile.yml` is about you, and about the shape of the site. Lena's:

```yaml
name: Lena Berger
title: Postdoctoral Researcher
affiliation:
  name: Department of Mathematics, University of Graz
  url: https://mathematik.uni-graz.at
email: lena.berger@uni-graz.at

avatar: /img/lena.jpg

links:
  - { label: ORCID, url: https://orcid.org/0000-0002-1825-0097 }
  - { label: arXiv, url: https://arxiv.org/a/berger_l_1 }
  - { label: GitHub, url: https://github.com/lenaberger }

summary: Postdoc in probability at the University of Graz, working on random trees.

nav:
  - { label: About, to: / }
  - { label: Research, to: /research/ }
  - { label: Publications, to: /publications/ }
  - { label: CV, to: /cv/ }

footer: Built with [vitakit](https://github.com/anja-codes/vitakit).
```

A few things worth knowing:

- **The portrait** is a file in `public/`: put `lena.jpg` there and write
  `/img/lena.jpg` if it is in `public/img/`. Delete the `avatar` line for none.
- **`summary`** is for search engines and link previews, not shown on the page.
- **`nav`** is the menu, in its order, with your wording. Adding a page does not
  change it — that is up to you.
- **`affiliation`** is a *link*: a name, optionally with a web address. The same
  form is used for institutions throughout (see [field types](../../content/field-types.md#links)).

Save, and the header of the site changes. Every field is listed in [profile
and pages](../../content/profile-and-pages.md).

## Your pages

The text of each page is a Markdown file in `content/pages/`:

| File | Page |
|---|---|
| `index.md` | `/`, the home page |
| `research.md` | `/research/` |
| `publications.md` | the text above the publication list |
| `cv.md` | the text above the CV |

Open `content/pages/index.md` and write a few sentences about yourself:

```md
---
title: Lena Berger
order: 0
---

I am a postdoc at the [University of Graz](https://www.uni-graz.at), working on
the shape of large random trees and the analysis of algorithms on them.

Before that, I was a university assistant in Klagenfurt, where I wrote my thesis
on cutting down trees.
```

The part between `---` lines is the **front matter**: the page's title, an
optional description, and `order`, its position among the pages. Below it is
ordinary Markdown: `**bold**`, `*italics*`, `[links](https://…)`, lists, tables.

**Mathematics** works everywhere, as in LaTeX: `$T(z) = z\,\phi(T(z))$` inline,
`$$ … $$` on its own lines for a display. It is typeset when the site is built,
so visitors' browsers load no extra software. The research page shows an
example.

**Images** go into `public/` and are written from the root: `![A tree](/img/tree.svg)`.

## A new page

A new Markdown file is a new page. Lena adds `content/pages/teaching.md`:

```md
---
title: Teaching
description: Courses, materials and thesis topics.
order: 15
---

I teach discrete mathematics and probability. Students interested in a
bachelor's or master's thesis are welcome to get in touch.
```

and it is at `http://localhost:3000/teaching/`. To have it in the menu, add a
line to `nav` in `content/profile.yml`:

```yaml
nav:
  - { label: About, to: / }
  - { label: Research, to: /research/ }
  - { label: Teaching, to: /teaching/ }
  - { label: Publications, to: /publications/ }
  - { label: CV, to: /cv/ }
```

A page that should also show parts of the CV — Lena's teaching page will list
her courses — needs one more file; `vitakit add page` writes both at once. We
come back to that in [chapter 5](./own-section.md#a-page-for-it).

## The design

Colours and fonts are set at the top of `app/assets/css/main.css`:

```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --color-primary: oklch(48% 0.13 250);
}
```

Change `--color-primary` for the colour of links, `--font-sans` for the text.
The rest of the file styles vitakit's elements, and is yours to change: see
[styling](../../website/styling.md).

**Next:** [your CV entries](./entries.md).

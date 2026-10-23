# 1. Create and run

## Create the project

::: code-group

```bash [pnpm]
pnpm create @anja.codes/vitakit lena-berger
```

```bash [npm]
npm create @anja.codes/vitakit lena-berger
```

:::

The creator asks a few questions — your name, position, affiliation, email —
and where the site will be published. Lena answers:

```
Your name: (Your Name) Lena Berger
Your position: (Postdoctoral Researcher)
Affiliation: (Department of Mathematics, University of Graz)
Email: (you@example.org) lena.berger@uni-graz.at
```

For the deployment target, choose **decide later** if you are not sure: you can
add a workflow at any time, and [chapter 8](./publish.md) helps you choose.
Type `?` at that question for a comparison of the options.

Then install and start the development server:

::: code-group

```bash [pnpm]
cd lena-berger
pnpm install
pnpm dev
```

```bash [npm]
cd lena-berger
npm install
npm run dev
```

:::

Open `http://localhost:3000`. That is a complete site, with example data: a
home page, a research page, publications and a CV. Leave the server running —
every change you save from now on appears in the browser right away.

## What was created

```
lena-berger/
  content/              your data — this is where you will spend most time
    profile.yml           name, affiliation, links, menu
    education.yml         one file per CV section
    employment.yml
    teaching.yml
    talks.yml
    supervision.yml
    publications.bib      your publications
    publication-lists.yml which of them are shown where
    pages/                the text of the website's pages
  app/                  the website: pages, layout, design
  cv-tex/               the PDF: cv.tex, its settings and styling
  public/               images and files served as they are
  package.json          the commands: dev, pdf, check
```

It is a git repository waiting to happen: run `git init` and commit, so every
step from here can be undone. Keep the repository **private** — it will hold
things your website does not show (see [privacy](../privacy.md)).

## Ask the project

In a second terminal, in the same directory:

::: code-group

```bash [pnpm]
pnpm vitakit status
```

```bash [npm]
npx vitakit status
```

:::

```
Sections                                    website   pdf
  education     3 entries                   /cv/      cv
  employment    3 entries: 2 public, 1 cv   /cv/      cv
  supervision   2 entries                   /cv/      cv
  talks         3 entries                   /cv/ /    cv
  teaching      3 entries                   /cv/      cv

Publications   content/publications.bib · 3 entries
                 all: 3 entries · /publications/, cv (pdf)
                 recent: 3 entries · /
Pages          /  /cv/  /publications/  /research/   (all in the menu)
PDF            cv-tex/cv.tex → not built yet

No problems.
```

This is your project at a glance: five sections, and for each, on which pages
of the website it appears and in which PDF documents. `talks` is on the CV page
(`/cv/`) and on the home page (`/`), where the three latest talks are listed.
One employment entry is marked `cv`: it is in the PDF, but not on the website —
more on that in [chapter 3](./entries.md).
The publications are shown as two lists: `all` on the publications page and in
the PDF, `recent` on the home page — [chapter 4](./publications.md) is about them.

Run `pnpm vitakit` on its own for the list of commands; you will meet most of
them in this tutorial.

**Next:** [make it yours](./make-it-yours.md).

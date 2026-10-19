# Field types

A section's fields are of a few kinds. The tables in [built-in
sections](./sections.md) name them; `vitakit add field` asks for one; a
[schema](./schemas.md) writes them with the building block in the last column.

| Type | In YAML | In a schema |
|---|---|---|
| text | `Analysis 1` | `text` |
| formatted text | Markdown and `$math$`: `The shape of random $k$-ary trees` | `richText` |
| number | `4.6`, `0` | `z.number()` |
| yes/no | `true`, `false` | `z.boolean()` |
| date | `2024`, `2024-03`, `{ from: 2019, to: present }` | `dateRange` |
| web address | `https://…`, `mailto:…`, `/slides/talk.pdf` | `url` |
| link | `University of Graz`, `{ name: University of Graz, url: https://… }` | `linked` |
| one of a fixed list | `invited` | `z.enum(['invited', 'contributed'])` |

Any of them may be a list (`[a, b]`, written `z.array(…)`), and any may be
optional (`.optional()`).

## Dates

Three precisions, written as you would in a CV:

```yaml
date: 2024                  # a year
date: 2024-03               # a month
date: 2024-03-15            # a day
date: { from: 2019, to: 2023 }
date: { from: 2023, to: present }     # open-ended
```

Precisions mix freely and still sort correctly. `2024-13` or `2023-02-30` are errors,
as is a range that ends before it starts.

Entries are sorted newest first automatically. Formatting follows the precision you
wrote: `2024`, `Mar 2024`, `2019–2023`, `2023–present`.

## Links

A field of type **link** is a name or label that may link somewhere: an
institution, a funder, a supervisor.

```yaml
institution: University of Graz
institution: { name: University of Graz, url: https://uni-graz.at }
institution: { label: University of Graz, url: https://uni-graz.at }   # the same
institution: https://uni-graz.at       # label derived from the URL
```

`name` and `label` mean the same; use whichever reads better. With a `url`, the
label is linked in both outputs. In code, every form arrives as `{ label, url? }`.
A link is what vitakit shows as a place on an entry's secondary line, when the
field is called `institution`, `issuer` or `organisation`.

The `links` in `content/profile.yml` are links that must have a URL:

```yaml
links:
  - https://example.org/a # label derived from the URL
  - { label: ORCID, url: https://orcid.org/… }
```

## Web addresses

A field of type **web address** takes an `http(s)` or `mailto` URL, or a path on your site
such as `/slides/talk.pdf` — a file in `public/`:

```yaml
url: https://aofa.org/2025
slides: /slides/aofa2025.pdf # public/slides/aofa2025.pdf
```

On the website, a path gets the deployment base path, like paths in Markdown. The
PDF has no site to be relative to, so where it prints such a link it needs your
site's address, [`url` in `content/profile.yml`](./profile-and-pages.md#contentprofileyml); without it, `vitakit pdf` stops and
says so. Links the PDF does not print, such as `slides` of a talk, need nothing.

## Formatted text

Fields of type **formatted text** accept Markdown and `$…$` mathematics:

```yaml
title: The shape of large random $k$-ary trees
```

On the website it reads: The shape of large random $k$-ary trees.

Mathematics is typeset by KaTeX for the website and passed through to LaTeX for
the PDF. Write `\$` for a dollar sign that does not start a formula. Other Markdown formatting (emphasis, links, etc.) is currently rendered
only on the website; its source syntax appears literally in the PDF.
Invalid TeX fails the build with the file, the entry index and the field.

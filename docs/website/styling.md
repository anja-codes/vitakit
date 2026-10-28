# Styling

The design of the website is one file, `app/assets/css/main.css`, using
[Tailwind CSS](https://tailwindcss.com). vitakit's components only provide
structure and class names; how they look is decided there.

`app/assets/css/main.css` starts with design tokens:

```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Lora", ui-serif, Georgia, serif;
  --color-primary: oklch(48% 0.13 250);
}
```

`--color-primary` changes the links; `--font-sans` changes the default text font.
`--font-serif` only affects elements using `font-serif`; the scaffold does not use
that class by default.

Below that, the same file styles the classes vitakit components emit. They are yours
to restyle; the components only provide structure.

| Class | Element |
|---|---|
| `vita-entry`, `vita-entry__date`, `vita-entry__title`, `vita-entry__meta`, `vita-entry__note` | one row of a section |
| `vita-section` | the list wrapping entries |
| `vita-date`, `vita-links` | a formatted date, a row of links |
| `vita-publications__title`, `vita-publications__group`, `vita-publications__heading`, `vita-bib`, `vita-badge` | a [publication list](./publications.md#classes) |
| `vita-prose` | rendered Markdown |
| `vita-issues` | the development-only problem banner |

`vita-section-group`, `vita-section-group__title` and `vita-section-group__subtitle`
are the section with its heading, as `<VitaSection title>` and grouped lists
write them.

The page layout — header, menu, footer — is `app/layouts/default.vue`, and each
page is a file in `app/pages/`: change the markup there directly.

## Fonts

The scaffold loads its fonts with `@nuxt/fonts`, which finds the families named
in the CSS and serves them from your site. Change `--font-sans` to another
family and it is loaded the same way.

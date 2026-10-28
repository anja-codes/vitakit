# 8. Check and publish

## Check what will be published

::: code-group

```bash [pnpm]
pnpm check
```

```bash [npm]
npm run check
```

:::

`check` does what a deployment does — typechecks the project and builds the
site into `.output/public` — and then checks the result:

```
  ok  5 page(s) generated
  ok  mathematics rendered on 4 page(s)
  ok  base path /
  ok  2 of 2 non-public entr(ies) absent from the site
  ok  assets and links use /
  ok  links into the site lead somewhere
  ok  bibliography on 1 page(s)

The generated site looks correct.
```

Two of these are worth knowing:

- **Nothing marked `cv` or `private` is in the site.** The website never reads
  those entries; this checks, independently, that none of their titles appear
  on any page — in case a page of your own prints something it should not.
- **Every link leads somewhere.** A link to `/slides/aofa2025.pdf` fails the
  check until `public/slides/aofa2025.pdf` exists, with the name in the same
  case: web servers usually tell `Talk.pdf` and `talk.pdf` apart, even where
  your computer does not.

The scaffolded workflows run `check` before every deployment, so a problem
stops the deployment instead of reaching your site.

## Choose a host

The site is static files: any web host serves them. The creator can set up one
of these for you:

| | Your site at | Repository can be private |
|---|---|---|
| Cloudflare Workers (recommended) | `https://<name>.<account>.workers.dev/` or your domain | yes |
| GitHub Pages | `https://<user>.github.io/<repo>/` or your domain | only with a paid plan |
| GitLab Pages | `https://<group>.gitlab.io/<project>/` | yes |
| Codeberg Pages | `https://<user>.codeberg.page/<repo>/` | needs your own CI runner |
| your university's web space | where it is, via SSH | yes |

**Keep your repository private.** It holds things your website does not show:
private entries, referees, cover letters. A public website does not need a
public repository; choose a host that allows that. Lena chooses Cloudflare
Workers.

If you chose *decide later* in [chapter 1](./create.md), create a new project
with the target you want in a temporary directory and copy its workflow file
(`.github/workflows/…`, and `wrangler.json` for Cloudflare) into yours.

[Publishing](../publishing.md) has the setup for each host: accounts, secrets,
custom domains, and serving the site from a subdirectory.

## Push

```bash
git add -A
git commit -m "My site"
git push
```

The workflow checks and deploys the site. With the GitHub Pages and Cloudflare
presets, a second workflow builds the PDF and attaches it to the run, to
download — the PDF is not put on the website, since it may contain entries
marked `cv` (see [privacy](../privacy.md)).

## Where to go from here

- **Look things up:** [how do I …?](../how-do-i.md) answers the common
  questions in a line or two each.
- **The command:** `pnpm vitakit status` whenever you lose track; all commands
  in [the CLI](../../cli/index.md).
- **More detail:** [content](../../content/index.md),
  [website](../../website/index.md), [PDF](../../pdf/index.md).
- **When something goes wrong:** [troubleshooting](../troubleshooting.md).

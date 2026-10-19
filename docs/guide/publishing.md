# Publishing

The website is static files in `.output/public`, built by `pnpm check` (which
also verifies them). Any static host serves them; the creator sets one up for
you when you choose a deployment target.


The creator adds a workflow for the target you choose, unless you choose to decide
later. Enter `?` at the deployment prompt for a compact comparison, or read the
same help without creating a project:

::: code-group

```bash [pnpm]
pnpm create @anja.codes/vitakit --deployment-help
```

```bash [npm]
npm create @anja.codes/vitakit -- --deployment-help
```

:::

**Hosting, CI and repository visibility are different choices.** Assume your source
repository is private: it may hold a phone number, an address, referees or a cover
letter. The website build filters that data; making the source public would still
expose it. A public website does not require a public source repository. See
[privacy](./privacy.md).

## GitHub Pages

The included GitHub Actions workflow publishes a public site at
`https://<user>.github.io/<repo>/`. A repository named `<user>.github.io` instead
serves `https://<user>.github.io/`; custom domains are also supported. On GitHub Free
the source repository must be public. Private source requires **GitHub Pro** for a
personal account, or **Team/Enterprise** for an organization; it does not make the
resulting site private. Do not publish sensitive CV source to qualify for free Pages.
See [GitHub's plans](https://docs.github.com/en/get-started/learning-about-github/githubs-plans)
and [Pages URL types](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages).

In repository settings, select **Pages → Source → GitHub Actions**. The workflow
sets `NUXT_APP_BASE_URL` to `/<repo>/` for a project site. For a user site or a custom
domain served at `/`, remove that environment setting. A wrong base path breaks
links and assets.

## Cloudflare Workers — recommended for new Cloudflare projects

[Cloudflare recommends Workers for new projects](https://developers.cloudflare.com/pages/).
The preset serves **static assets only**, without a Worker script, SSR adapter or
server-side runtime. Your site gets `https://<worker>.<account>.workers.dev/`, or a
custom domain. Static-asset requests are free, subject to platform limits; the
GitHub source repository can stay private without GitHub Pro. GitHub Actions usage
limits still apply. This is a separate deployment target from Pages, not a
`pages.dev` site.

The included `.github/workflows/workers.yml` runs the `check` script and deploys only
`.output/public` using `wrangler.json`. The configuration uses normal static-page
routing and a real 404 response, not an SPA fallback. To set it up:

1. Enable a `workers.dev` subdomain in your Cloudflare account.
2. Choose an available Worker name in `wrangler.json` (initially the directory slug).
3. Add the GitHub repository secrets `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN`, with **Workers Scripts: Edit** permission for that account.
   The **Edit Cloudflare Workers** token template is a suitable starting point;
   custom-domain configuration may require additional zone permissions.
4. Push to `main`. Wrangler creates/updates the Worker; no Pages project is needed.

For a custom domain, configure a [Workers custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).
After running the `check` script, you can also deploy manually:

::: code-group

```bash [pnpm]
pnpm dlx wrangler@4 deploy
```

```bash [npm]
npx wrangler@4 deploy
```

:::

Do not change the assets directory to the repository root: only the checked static
output should be uploaded. The included `CV` workflow keeps the PDF separate as a
run artifact.

## Cloudflare Pages — legacy option

Pages is the legacy option and remains available; use Workers for new deployments.
This preset is for users who specifically want Pages, including existing Pages
projects. Your public site gets `https://<project>.pages.dev/` (the actual
name depends on availability), or you can attach a custom domain. This preset uses
**GitHub Actions to build and check the site**, then uploads only `.output/public`
to Cloudflare; it does not use Cloudflare's Git-integrated builds. You need a
Cloudflare account and a GitHub repository, but not GitHub Pro. Hosting and CI usage
limits still apply.

Create a [Pages Direct Upload project](https://developers.cloudflare.com/pages/get-started/direct-upload/)
with production branch `main`. Match its name in the `--project-name` argument in
`.github/workflows/cloudflare.yml`. Add the repository secrets
`CLOUDFLARE_API_TOKEN` (with Cloudflare Pages edit permission for the account) and
`CLOUDFLARE_ACCOUNT_ID`. The other included workflow, `CV`, builds the PDF as a run
artifact, not as website content. A Direct Upload project cannot later be switched
to Cloudflare Git integration without creating a new project.

## GitLab Pages

The included `.gitlab-ci.yml` runs the `check` script and publishes only `.output/public`
on the project's **default branch**. It uses GitLab CI/CD, not GitHub Actions, and
supports private source projects on the Free tier, subject to runner availability
and CI quotas. On GitLab.com, a new site usually gets a unique URL such as
`https://my-site-a1b2c3.gitlab.io/`. Without unique domains, a project URL looks like
`https://<namespace>.gitlab.io/<project>/`; subgroup paths and institutional GitLab
Pages domains also work. See [GitLab's URL guide](https://docs.gitlab.com/user/project/pages/getting_started_part_one/).

Enable CI runners and Pages for the project, then look under **Deploy → Pages**
for the resulting URL. To publish a public website from private source, set
**Settings → General → Visibility, project features, permissions → Pages** access
to **Everyone**, if your instance/group permits it. Do not change the repository's
visibility to make the site public. See [Pages access control](https://docs.gitlab.com/user/project/pages/pages_access_control/).
Self-managed installations need **GitLab 17.10+**, Pages enabled by the
administrator, and a Docker-compatible runner for the Node 22 build image.

The job derives `NUXT_APP_BASE_URL` from `CI_PAGES_URL`, so both unique root domains
and project/subgroup paths get the right asset URLs. For a root-level custom domain,
set a project CI/CD variable `NUXT_APP_BASE_URL=/`; the predefined `CI_PAGES_URL`
continues to describe GitLab's own URL. Use your actual serving path if the custom
domain serves the site below a subdirectory. No separate PDF job is included.

## Codeberg Pages — powered by git-pages

[git-pages](https://git-pages.org/) is the open-source static-site server now
powering Codeberg Pages, not another account-based hosting service. The included
`.forgejo/workflows/codeberg.yml` runs the `check` script and uploads **only
`.output/public`** with the [official git-pages action](https://codeberg.org/git-pages/action).
For the matching project URL, `https://<owner>.codeberg.page/<repo>/`, it uses the
automatic `forgejo.token`: no personal access token, webhook or `pages` branch is
needed. Both the URL and base path use the actual repository name, which need not
match the directory name you picked when scaffolding.

Enable Actions in the repository settings and select a suitable Docker-capable
runner. The preset selects `codeberg-medium` rather than the tiny tier for Nuxt
builds. **Codeberg-hosted runners require a public, freely licensed repository**;
see the [hosted runner policy](https://codeberg.org/actions/meta). Do not expose CV
source containing private data to qualify for hosted CI. Keep it private and use
your own compatible runner (change `runs-on`), or choose another deployment target.
The website itself is public. No separate PDF job is included.

The preset targets a project subdirectory by default. For a root site, follow
[Codeberg's root-site instructions](https://docs.codeberg.org/codeberg-pages/forgejo-actions/)
and change **both** `site` to the root URL and `NUXT_APP_BASE_URL` to `/`. For a
custom domain, change both similarly, keep `server: codeberg.page`, and configure
DNS and the `_git-pages-forge-allowlist` TXT record as described in
[Codeberg's custom-domain guide](https://docs.codeberg.org/codeberg-pages/using-custom-domain/).

The same upload action can target another git-pages server: change `site` and
`server`, and use that server's supported authorization method. An automatic
Codeberg token is not universally valid on unrelated servers. Self-hosting the
server and its DNS/TLS setup is outside what the scaffolder configures.

## Existing web space (SSH/rsync)

Use university web space or a server you already control. This option provides no
hosting account or domain: the server determines the URL, such as
`https://www.example.edu/~username/`. It requires SSH access, rsync on the server,
and write permission for the web directory; FTP/SFTP-only web space is not enough
for this preset. Source visibility is independent of the hosting method.

**The current workflow runs on Forgejo Actions, not GitHub Actions.** In
`.forgejo/workflows/deploy.yml`, configure `SSH_DEPLOY_KEY` and replace the example
rsync destination with your SSH user, host and web directory. Set
`NUXT_APP_BASE_URL` to the URL's path (`/~username/` in the example, or `/` for a
root-level site). Configure SSH host-key verification before using the template;
its current example disables that check. Check the destination carefully:
`rsync --delete` removes remote files absent from the build output. There is no
separate PDF-build workflow in this preset.

## Decide later / deploy manually

No deployment or PDF-build workflows are added. The website and CV still work
locally, and you can add automation later without re-scaffolding. Run the `check`
script and upload **only `.output/public`** to any static host. Do not upload the
source repository or `cv-tex/`. For a site below a subdirectory, set
`NUXT_APP_BASE_URL` when running the check/build:

::: code-group

```bash [pnpm]
NUXT_APP_BASE_URL=/~username/ pnpm check
```

```bash [npm]
NUXT_APP_BASE_URL=/~username/ npm run check
```

:::

## The base path

A site served from a subdirectory — `https://user.github.io/my-site/` — must be
built for it: `NUXT_APP_BASE_URL=/my-site/`. The scaffolded workflows set it;
`pnpm check` verifies that every link and asset uses it. A user site, a custom
domain or any site at the root of its domain needs `/`, the default.

## The PDF

The PDF is not published with the website (see
[privacy](./privacy.md#pdfs-are-not-published)). The GitHub Pages and Cloudflare
presets include a `CV` workflow that builds it in CI and attaches it to the run;
the other presets only deploy the website — build the PDF locally, or add a job
like that workflow. See [building the PDF](../pdf/building.md).

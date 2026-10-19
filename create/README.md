# @anja.codes/create-vitakit

Scaffold a [vitakit](https://github.com/anja-codes/vitakit) project: an academic
website and a LaTeX CV built from one set of files.

```bash
pnpm create @anja.codes/vitakit my-site
cd my-site
pnpm install
pnpm dev            # http://localhost:3000
pnpm pdf            # cv-tex/cv.pdf (needs a TeX distribution)
pnpm check          # what CI runs
```

`npm create @anja.codes/vitakit my-site` works too: the project is then written
for npm, with `npm run …` in its scripts, workflows and instructions.

It asks for your name, position, affiliation, email and a deployment target
(GitHub Pages, Cloudflare Workers or Pages, GitLab Pages, Codeberg Pages,
existing web space via SSH/rsync, or decide later), copies the template and
substitutes those few values.

Choose `?` at the deployment prompt for a compact comparison of URLs,
requirements and CI. Numbered setup steps follow your selection.
To read the comparison without creating files:

```bash
pnpm create @anja.codes/vitakit --deployment-help
```

- **GitHub Pages:** public source on Free; a paid plan for private source.
- **Cloudflare Workers:** recommended for new Cloudflare projects; uses GitHub Actions.
- **Cloudflare Pages:** legacy option, still available; also uses GitHub Actions.
- **GitLab Pages:** private source supported on Free; uses GitLab CI/CD.
- **Codeberg Pages:** uses git-pages and Forgejo Actions. Hosted CI requires public,
  freely licensed source; use your own runner for sensitive CV source.
- **SSH/rsync:** needs existing web space; the preset uses Forgejo Actions.

Choosing to decide later adds no workflows and leaves all hosting options open.

See [publishing and setup](../docs/guide/publishing.md) for details.

Everything afterwards is ordinary files in a repository you own. The
`vitakit` command in the project helps with the common changes — `pnpm vitakit
status` shows what is there, `pnpm vitakit add section <name>` sets up a new
section — and shows every change before it makes it.

MIT

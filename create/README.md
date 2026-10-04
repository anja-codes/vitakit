# @anja.codes/create-vitakit

Scaffold a [vitakit](https://github.com/anja-codes/vitakit) project: an academic
website and a LaTeX CV built from one set of files.

```bash
pnpm create @anja.codes/vitakit my-site
cd my-site
pnpm install
pnpm dev            # http://localhost:3000
pnpm build:cv       # cv-tex/cv.pdf (needs a TeX distribution)
pnpm check          # what CI runs
```

It asks for your name, position, affiliation, email and a deployment target
(GitHub Pages, Cloudflare Pages, rsync, or none), copies the template and
substitutes those few values.

This is the only scaffolding step vitakit has. Everything afterwards — a new
page, a new CV variant, a new section — is adding or copying a file in a
repository you own.

MIT

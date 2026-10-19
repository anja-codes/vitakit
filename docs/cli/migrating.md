# From vitakit 0.1

| 0.1 | now |
|---|---|
| `build:cv` script, `vitakit-build-cv` | `pdf` script, `vitakit pdf` |
| `--no-pdf` | `--tex-only` |
| `check:static` script, `vitakit-check` | `vitakit verify` |
| `vitakit list` | `vitakit eject --list` |
| `vitakit add <name>` | `vitakit add section <name>` |
| `vitakit eject <section>` (a schema) | `vitakit customize <section> --schema --copy` |
| `vitakit eject publications` | `vitakit customize publications` |
| `vitakit eject <section>.eta` | `vitakit customize <section> --pdf` |

In an existing project, change the scripts in `package.json` to
`"pdf": "vitakit pdf"` and
`"check": "pnpm typecheck && pnpm generate && vitakit verify"` (with npm:
`npm run typecheck && npm run generate && vitakit verify`).

In `content/`, nothing changes. In code of your own, a value of a **link**
field (an institution, a supervisor, `profile.affiliation`) is `{ label, url? }`;
read `.label` where 0.1 code read `.name`. A schema that imports `institution`
or `link` from `@anja.codes/vitakit` imports `linked` instead — see
[field types](../content/field-types.md#links).

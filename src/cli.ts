/**
 * `@anja.codes/vitakit/cli` — the two commands that exist, and why only these.
 *
 * vitakit has no scaffolding CLI: a CV variant is a copied `.tex`, a page is a
 * new file. Ejecting is the exception, because the file to copy lives at a
 * pnpm store path nobody can type and that changes on every update.
 */
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { resolveAsset } from './assets'
import { bundledTexDir } from './tex/emit'

export { addSection, type AddOptions, type WrittenFile } from './scaffold'

export interface EjectableItem {
  /** Name to pass to `eject`, e.g. `VitaSection`, `talks.eta` or `teaching`. */
  name: string
  kind: 'component' | 'template' | 'class' | 'schema' | 'style'
  /** Absolute source path inside the package. */
  source: string
  /** Destination relative to the project root. */
  target: string
}

/** Everything that can be copied into a project. */
export async function listEjectable(): Promise<EjectableItem[]> {
  const items: EjectableItem[] = []

  const componentsDir = resolveAsset('runtime/components')
  for (const file of (await readdir(componentsDir)).filter(name => name.endsWith('.vue')).sort()) {
    items.push({
      name: basename(file, '.vue'),
      kind: 'component',
      source: join(componentsDir, file),
      target: join('app', 'components', file),
    })
  }

  const templatesDir = join(bundledTexDir, 'templates')
  for (const file of (await readdir(templatesDir)).filter(name => name.endsWith('.eta')).sort()) {
    items.push({
      name: file,
      kind: 'template',
      source: join(templatesDir, file),
      target: join('cv-tex', 'templates', file),
    })
  }

  // Built-in section schemas: ejecting one is how you change what a section
  // may contain, without having to know how to extend it. `publications` is
  // the same for content/publications.bib: its groups, links and fields.
  const schemaDir = resolveAsset('schemas')
  for (const file of (await readdir(schemaDir)).filter(name => name.endsWith('.ts')).sort()) {
    const id = basename(file, '.ts')
    items.push({
      name: id,
      kind: 'schema',
      source: join(schemaDir, file),
      target: join('schemas', file),
    })
  }

  // The CSL style for the website's bibliography. It lands next to the .bib
  // file it formats, where the loader looks for it -- so it is watched in dev
  // and seen by `vitakit-check`, with nothing to configure.
  items.push({
    name: 'publications.csl',
    kind: 'style',
    // The path of `defaultCslStyle`, without loading citation-js to get it.
    source: join(resolveAsset('styles'), 'vitakit-math.csl'),
    target: join('content', 'publications.csl'),
  })

  items.push({
    name: 'vitakit-cv.cls',
    kind: 'class',
    source: join(bundledTexDir, 'vitakit-cv.cls'),
    target: join('cv-tex', 'vitakit-cv.cls'),
  })

  return items
}

export interface EjectResult {
  item: EjectableItem
  /** Absolute path written. */
  path: string
}

/**
 * Copy a package default into the project, where it then wins by the normal
 * resolution rule. Never overwrites without `force`.
 */
export async function eject(name: string, rootDir: string, { force = false } = {}): Promise<EjectResult> {
  const items = await listEjectable()
  const item = items.find(candidate => candidate.name === name)
    ?? items.find(candidate => candidate.name.toLowerCase() === name.toLowerCase())

  if (!item) {
    const known = items.map(candidate => candidate.name).join(', ')
    throw new Error(`unknown item "${name}". Available: ${known}`)
  }

  const path = join(rootDir, item.target)
  if (existsSync(path) && !force) {
    throw new Error(`${relative(rootDir, path)} already exists; pass --force to overwrite`)
  }

  await mkdir(join(path, '..'), { recursive: true })

  if (item.kind === 'schema') {
    // The package builds these against its own modules; a project imports
    // them by package name, which exports everything they use.
    const source = await readFile(item.source, 'utf8')
    await writeFile(path, source.replace(/from '\.\.\/[\w-]+'/g, "from '@anja.codes/vitakit'"))
  } else {
    await copyFile(item.source, path)
  }

  return { item, path }
}

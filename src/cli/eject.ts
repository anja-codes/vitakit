/**
 * Shared package files a project can take over.
 */
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { resolveAsset } from '../assets'
import { CommandError } from './command'
import type { Plan } from './plan'

export interface EjectableAsset {
  name: string
  /** Absolute path inside the package. */
  source: string
  /** Destination relative to the project root. */
  target: string
  /** What taking it over affects. */
  scope: string
  /** What to do after ejecting. */
  after: string
}

const SCOPES: Record<string, string> = {
  VitaSection: 'every section on every page; prefer customize for one section',
  VitaEntry: 'every entry row of every section',
  VitaDate: 'every date on the website',
  VitaLinks: 'the profile links',
  VitaMarkdown: 'every Markdown page body',
  VitaIssues: 'the development error banner',
  VitaPublications: 'the publication list and its groups',
  VitaPublication: 'how each reference looks on the website',
}

export async function ejectableAssets(): Promise<EjectableAsset[]> {
  const componentsDir = resolveAsset('runtime/components')
  const components = (await readdir(componentsDir)).filter(file => file.endsWith('.vue')).sort()
  return [
    ...components.map(file => ({
      name: basename(file, '.vue'),
      source: join(componentsDir, file),
      target: `app/components/${file}`,
      scope: SCOPES[basename(file, '.vue')] ?? 'the website',
      after: 'Your copy is used instead of vitakit\'s from now on.',
    })),
    {
      name: 'publications.csl',
      source: join(resolveAsset('styles'), 'vitakit-math.csl'),
      target: 'content/publications.csl',
      scope: 'how publications.bib is formatted on the website (not the PDF)',
      after: 'Edit it, or replace it with any CSL style, e.g. from zotero.org/styles.',
    },
    {
      name: 'vitakit-cv.cls',
      source: resolveAsset('tex/vitakit-cv.cls'),
      target: 'cv-tex/vitakit-cv.cls',
      scope: 'the LaTeX class of every PDF document; preamble.tex is usually enough',
      after: 'Every PDF document uses your copy from now on.',
    },
  ]
}

export async function ejectPlan(root: string, asset: EjectableAsset, { force }: { force: boolean }): Promise<Plan> {
  const exists = existsSync(join(root, asset.target))
  if (exists && !force) {
    throw new CommandError(`${asset.target} is already yours. --force replaces it with vitakit's current version, keeping yours as a backup.`)
  }
  const content = await readFile(asset.source, 'utf8')
  return {
    items: [exists
      ? { kind: 'replace', path: asset.target, content, reason: "vitakit's current version; yours is kept next to it as a .backup" }
      : { kind: 'create', path: asset.target, content, reason: asset.scope }],
  }
}

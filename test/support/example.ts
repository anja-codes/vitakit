/**
 * Throwaway copies of the scaffolded example, for tests that run commands
 * against a whole project.
 *
 * Each copy has nothing built or installed, and two adjustments so that what
 * the CLI writes loads under the test runner as it would in a project:
 * `@anja.codes/vitakit` resolves to this checkout's source (so primitives keep
 * their identity), and the tsconfig no longer extends the missing `.nuxt/`.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PACKAGE_ENTRY, ROOT } from './project'

const EXAMPLE = join(ROOT, 'examples/scaffolded')
const BUILT = /[/\\](node_modules|\.nuxt|\.output|generated)([/\\]|$)/

/** A new file's contents, a change to an existing one, or `null` to delete it. */
export type FileChange = string | ((source: string) => string) | null

/** A copy of the example; removed with the run's temporary directory (see global-setup.ts). */
export async function exampleProject(changes: Record<string, FileChange> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-project-'))
  await cp(EXAMPLE, root, { recursive: true, filter: source => !BUILT.test(source) && !source.endsWith('.pdf') })

  await writeFile(join(root, 'tsconfig.json'), '{}\n')
  const shim = join(root, 'node_modules/@anja.codes/vitakit')
  await mkdir(shim, { recursive: true })
  await writeFile(join(shim, 'package.json'), JSON.stringify({ name: '@anja.codes/vitakit', type: 'module', exports: './index.ts' }))
  await writeFile(join(shim, 'index.ts'), `export * from '${PACKAGE_ENTRY}'\n`)

  for (const [path, change] of Object.entries(changes)) {
    const file = join(root, path)
    if (change === null) {
      await rm(file)
      continue
    }
    await mkdir(join(file, '..'), { recursive: true })
    await writeFile(file, typeof change === 'string' ? change : change(await readFile(file, 'utf8')))
  }
  return root
}

/** An empty directory that is not a project. */
export function emptyDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'vitakit-empty-'))
}

export const readProjectFile = (root: string, path: string): Promise<string> => readFile(join(root, path), 'utf8')

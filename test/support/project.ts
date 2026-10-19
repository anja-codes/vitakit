/** Throwaway project directories for tests that go through the file system. */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { onTestFinished } from 'vitest'

/** The repository root. */
export const ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** The package entry, for `schemas/*.ts` files in a test project. */
export const PACKAGE_ENTRY = join(ROOT, 'src/index.ts')

/** `import { a, b } from '<the package>'`, as a project's schema would write it. */
export const importPackage = (...names: string[]) => `import { ${names.join(', ')} } from '${PACKAGE_ENTRY}'\n`

/** Write `files` (path -> contents) below `root`. */
export async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), contents)
  }
}

/** A fresh directory containing `files`, removed when the current test ends. */
export async function project(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-test-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  await writeFiles(root, files)
  return root
}

/** Whether a command is installed, for tests that need a TeX distribution. */
export function hasCommand(command: string, args: string[] = ['-v']): boolean {
  try {
    execFileSync(command, args, { stdio: 'ignore' })
    return true
  }
  catch {
    return false
  }
}

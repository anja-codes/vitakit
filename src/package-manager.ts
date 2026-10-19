/**
 * Commands as the user types them, for the package manager of their project.
 *
 * Help texts and error messages tell people what to run next; for an npm
 * project, `pnpm vitakit status` is a command that does not work.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

export type PackageManager = 'pnpm' | 'npm'

/**
 * The package manager that started this process, from the user agent npm and
 * pnpm set for everything they run (`npm run`, `npx`, `pnpm <script>`,
 * `pnpm exec`); anything but npm gets pnpm, the default, as in the creator.
 * A binary run directly has no user agent; the project's lockfile decides.
 */
export function detectPackageManager(rootDir: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): PackageManager {
  const userAgent = env.npm_config_user_agent
  if (userAgent) return userAgent.startsWith('npm/') ? 'npm' : 'pnpm'
  return existsSync(join(rootDir, 'package-lock.json')) && !existsSync(join(rootDir, 'pnpm-lock.yaml')) ? 'npm' : 'pnpm'
}

export interface Commands {
  /** A script from package.json: `pnpm pdf cv`, `npm run pdf -- cv`. */
  script: (name: string, args?: string) => string
  /** A binary of an installed package: `pnpm vitakit status`, `npx vitakit status`. */
  bin: (name: string, args?: string) => string
}

export function commands(packageManager: PackageManager = detectPackageManager()): Commands {
  const npm = packageManager === 'npm'
  const words = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ')
  return {
    // npm would take options meant for the script (--tex-only) as its own.
    script: (name, args) => npm ? words('npm run', name, args && `-- ${args}`) : words('pnpm', name, args),
    bin: (name, args) => words(npm ? 'npx' : 'pnpm', name, args),
  }
}

/** Lines of `command  # comment`, with the comments aligned. */
export function aligned(rows: [command: string, comment?: string][], indent = '  '): string {
  const width = Math.max(...rows.map(([command]) => command.length)) + 2
  return rows
    .map(([command, comment]) => `${indent}${comment ? command.padEnd(width) + comment : command}`)
    .join('\n')
}

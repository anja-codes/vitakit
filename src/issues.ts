/**
 * Strict for builds, lenient for development.
 *
 * A broken content file must fail `nuxt generate`, but must never take down the
 * dev server: a throw inside a Nuxt module's `setup()` is unrecoverable and
 * forces a manual restart. Both modes produce the same message, so what you fix
 * in the browser is what would have failed in CI.
 */
import { pathToFileURL } from 'node:url'
import type { ContentIssue } from './shared/types'

/** A content problem that knows which file it belongs to. */
export class ContentError extends Error {
  constructor(readonly where: string, message: string) {
    super(`${where}: ${message}`)
    this.name = 'ContentError'
  }
}

export function fail(where: string, message: string): never {
  throw new ContentError(where, message)
}

export function messageOf(error: unknown): string {
  if (error instanceof ContentError) return error.message.slice(error.where.length + 2)
  return error instanceof Error ? error.message : String(error)
}

export function whereOf(error: unknown, fallback: string): string {
  return error instanceof ContentError ? error.where : fallback
}

/**
 * Import a `schemas/*.ts` file from the project.
 *
 * Node runs TypeScript itself from 22.18 on; before that the import fails with
 * a bare "unknown file extension", which says nothing about what to do. The
 * modification time is part of the URL because ESM caches modules per URL for
 * the lifetime of the process: without it, an edit has no effect until the dev
 * server is restarted, which looks like the file being ignored.
 */
export async function importProjectModule(path: string, mtimeMs: number, where: string): Promise<Record<string, unknown>> {
  try {
    return await import(`${pathToFileURL(path).href}?mtime=${mtimeMs}`) as Record<string, unknown>
  } catch (error) {
    fail(where, importFailure(error))
  }
}

/** What to tell the user when importing a project module failed. */
export function importFailure(error: unknown, node: string = process.versions.node): string {
  if ((error as { code?: string } | null)?.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
    return `cannot load TypeScript on Node ${node}; vitakit needs Node 22.18 or newer`
  }
  return messageOf(error)
}

/** Compact rendering of a Zod error, one line per problem. */
export function formatZodIssues(error: { issues: { path: PropertyKey[], message: string }[] }): string {
  return error.issues
    .map(issue => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}

export class Issues {
  readonly list: ContentIssue[] = []

  constructor(readonly strict: boolean) {}

  /** Record a problem, or throw it when strict. */
  record(where: string, message: string): void {
    if (this.strict) fail(where, message)
    this.list.push({ where, message })
  }

  /** Run `run`; when lenient, record any failure and use `fallback` instead. */
  async attempt<T>(where: string, run: () => Promise<T> | T, fallback: T): Promise<T> {
    try {
      return await run()
    } catch (error) {
      if (this.strict) throw error
      this.list.push({ where: whereOf(error, where), message: messageOf(error) })
      return fallback
    }
  }
}

/**
 * What a writing command is about to do, shown before it is done.
 *
 * Every writing command builds a plan first; `--dry-run` prints it, otherwise
 * it is confirmed and applied exactly as shown. Predictable conflicts are found
 * while building the plan, so a refused plan has changed nothing.
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CommandError } from './command'
import type { Io, Style } from './io'

export type PlanItem
  = | { kind: 'create', path: string, content: string, reason: string, show?: boolean }
    | { kind: 'replace', path: string, content: string, reason: string, show?: boolean }
    | { kind: 'edit', path: string, before: string, after: string, reason: string }
    | { kind: 'keep', path: string, reason: string }
    | { kind: 'paste', path: string, snippet: string, reason: string }

export interface Plan {
  items: PlanItem[]
}

const writes = (plan: Plan) => plan.items.filter(item => item.kind === 'create' || item.kind === 'replace' || item.kind === 'edit')

/** A line diff, with a little context: enough to see what changes where. */
export function diff(before: string, after: string, context = 2): string[] {
  const a = before.split('\n')
  const b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const from = Math.max(0, start - context)
  return [
    ...a.slice(from, start).map(line => `    ${line}`),
    ...a.slice(start, endA).map(line => `  - ${line}`),
    ...b.slice(start, endB).map(line => `  + ${line}`),
    ...a.slice(endA, Math.min(a.length, endA + context)).map(line => `    ${line}`),
  ]
}

export function printPlan(io: Io, style: Style, _root: string, plan: Plan): void {
  const lines: string[] = []
  for (const item of plan.items) {
    if (item.kind === 'create') {
      lines.push(`${style.green('+')} ${item.path}   ${style.dim(item.reason)}`)
      if (item.show) lines.push(...item.content.trimEnd().split('\n').map(line => style.dim(`    ${line}`)))
    }
    else if (item.kind === 'replace') {
      lines.push(`${style.yellow('!')} ${item.path}   ${style.dim(item.reason)}`)
      if (item.show) lines.push(...item.content.trimEnd().split('\n').map(line => style.dim(`    ${line}`)))
    }
    else if (item.kind === 'keep') lines.push(`${style.dim('=')} ${item.path}   ${style.dim(item.reason)}`)
    else if (item.kind === 'edit') {
      lines.push(`${style.yellow('~')} ${item.path}   ${style.dim(item.reason)}`)
      lines.push(...diff(item.before, item.after).map(line =>
        line.startsWith('  +') ? style.green(line) : line.startsWith('  -') ? style.red(line) : style.dim(line)))
    } else {
      lines.push(`${style.yellow('?')} ${item.path}   ${item.reason}`)
      lines.push(...item.snippet.split('\n').map(line => `    ${line}`))
    }
  }
  io.out(`${lines.join('\n')}\n`)
}

/**
 * Whether to apply the plan: yes with `--yes`, otherwise ask. Without a
 * terminal there is nobody to ask, and nothing is written.
 */
export async function confirmPlan(io: Io, plan: Plan, yes: boolean): Promise<boolean> {
  if (!writes(plan).length || yes) return true
  if (!io.interactive) {
    throw new CommandError('nothing written: confirm with --yes, or only preview with --dry-run')
  }
  const answer = (await io.ask('\nWrite these changes? [Y/n] ')).trim().toLowerCase()
  if (answer === '' || answer === 'y' || answer === 'yes') return true
  io.out('Cancelled; nothing was written.\n')
  return false
}

/** Where a replaced file is kept: a name no tool picks up as the original. */
export function backupPath(path: string): string {
  let candidate = `${path}.backup`
  for (let index = 2; existsSync(candidate); index++) candidate = `${path}.backup-${index}`
  return candidate
}

export async function applyPlan(root: string, plan: Plan): Promise<string[]> {
  // Preflight: nothing is written if any target changed since planning.
  for (const item of writes(plan)) {
    const path = join(root, item.path)
    if (item.kind === 'create' && existsSync(path)) throw new CommandError(`${item.path} exists now; nothing was written`)
    if (item.kind !== 'create' && !existsSync(path)) throw new CommandError(`${item.path} is gone now; nothing was written`)
  }
  const written: string[] = []
  try {
    for (const item of writes(plan)) {
      const path = join(root, item.path)
      await mkdir(dirname(path), { recursive: true })
      if (item.kind === 'create') await writeFile(path, item.content, { flag: 'wx' })
      else if (item.kind === 'replace') {
        await rename(path, backupPath(path))
        await writeFile(path, item.content)
      } else await writeFile(path, item.after)
      written.push(item.path)
    }
  } catch (error) {
    throw new CommandError(`${error instanceof Error ? error.message : String(error)}${
      written.length ? `\n  Already written: ${written.join(', ')}` : '\n  Nothing was written.'}`)
  }
  return written
}

/**
 * The project as a command is about to change it. Operations read files
 * through it -- seeing what earlier operations of the same command already
 * planned -- and record what they would write; nothing touches the disk until
 * the plan is applied.
 */
export class Workspace {
  private readonly items: PlanItem[] = []

  constructor(readonly root: string) {}

  private find(path: string): PlanItem | undefined {
    return this.items.find(item => item.path === path && item.kind !== 'paste' && item.kind !== 'keep')
  }

  /** The file as it will be: planned contents first, the disk otherwise. */
  async read(path: string): Promise<string | undefined> {
    const planned = this.find(path)
    if (planned?.kind === 'create' || planned?.kind === 'replace') return planned.content
    if (planned?.kind === 'edit') return planned.after
    return readFile(join(this.root, path), 'utf8').catch(() => undefined)
  }

  exists(path: string): boolean {
    return Boolean(this.find(path)) || existsSync(join(this.root, path))
  }

  /** A new file; `show` prints its contents in the plan, for short files worth reading. */
  create(path: string, content: string, reason: string, { show = false }: { show?: boolean } = {}): void {
    if (this.exists(path)) throw new CommandError(`${path} exists already; nothing was written`)
    this.items.push({ kind: 'create', path, content, reason, ...(show ? { show } : {}) })
  }

  /** Replace an existing file; the old one is kept as a backup. */
  replace(path: string, content: string, reason: string, { show = false }: { show?: boolean } = {}): void {
    this.items.push({ kind: 'replace', path, content, reason, ...(show ? { show } : {}) })
  }

  /** Change a file; for a file this plan creates, the change becomes part of it. */
  async edit(path: string, after: string, reason: string): Promise<void> {
    const planned = this.find(path)
    if (planned?.kind === 'create' || planned?.kind === 'replace') {
      planned.content = after
      return
    }
    if (planned?.kind === 'edit') {
      planned.after = after
      planned.reason = `${planned.reason}; ${reason}`
      return
    }
    const before = await readFile(join(this.root, path), 'utf8')
    this.items.push({ kind: 'edit', path, before, after, reason })
  }

  keep(path: string, reason: string): void {
    this.items.push({ kind: 'keep', path, reason })
  }

  paste(path: string, snippet: string, reason: string): void {
    this.items.push({ kind: 'paste', path, snippet, reason })
  }

  plan(): Plan {
    return { items: [...this.items] }
  }
}

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

/**
 * A line diff, with a little context: enough to see what changes where. Each
 * change is shown on its own, so two edits far apart in a file do not show
 * everything between them as changed.
 */
export function diff(before: string, after: string, context = 2): string[] {
  const a = before.split('\n')
  const b = after.split('\n')
  // Common start and end first; the longest common subsequence of the rest.
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  const ops: { kind: ' ' | '-' | '+', line: string }[] = a.slice(0, start).map(line => ({ kind: ' ' as const, line }))
  if (midA.length * midB.length > 1_000_000) {
    ops.push(...midA.map(line => ({ kind: '-' as const, line })), ...midB.map(line => ({ kind: '+' as const, line })))
  } else {
    const lengths = Array.from({ length: midA.length + 1 }, () => new Array<number>(midB.length + 1).fill(0))
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lengths[i]![j] = midA[i] === midB[j] ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
      }
    }
    let i = 0
    let j = 0
    while (i < midA.length || j < midB.length) {
      if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
        ops.push({ kind: ' ', line: midA[i]! })
        i++
        j++
      } else if (i < midA.length && (j === midB.length || lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) {
        ops.push({ kind: '-', line: midA[i++]! })
      } else {
        ops.push({ kind: '+', line: midB[j++]! })
      }
    }
  }
  ops.push(...a.slice(endA).map(line => ({ kind: ' ' as const, line })))

  // Changed lines with `context` unchanged ones around them; a gap in between.
  const shown = ops.map((op, index) => op.kind !== ' '
    || ops.slice(Math.max(0, index - context), index + context + 1).some(near => near.kind !== ' '))
  const lines: string[] = []
  ops.forEach((op, index) => {
    if (!shown[index]) return
    if (lines.length && !shown[index - 1]) lines.push('    …')
    lines.push(`  ${op.kind === ' ' ? ' ' : op.kind} ${op.line}`)
  })
  return lines
}

export function printPlan(io: Io, style: Style, plan: Plan): void {
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

/**
 * Everything a command touches outside the file system: streams, environment,
 * working directory, terminal. Injected, so commands run in tests exactly as
 * from a terminal.
 */
import process from 'node:process'
import { createInterface } from 'node:readline/promises'

export interface Io {
  cwd: string
  env: NodeJS.ProcessEnv
  /** Write to stdout; text is written as is, add `\n` yourself. */
  out: (text: string) => void
  err: (text: string) => void
  /** Whether a person can answer questions: stdin and stdout are terminals. */
  interactive: boolean
  /** Whether stdout is a terminal, for colour. */
  tty: boolean
  /** Width of the terminal, when stdout is one. */
  columns?: number
  /** Ask a question and return the answer; only called when `interactive`. */
  ask: (question: string) => Promise<string>
}

export function processIo(): Io {
  return {
    cwd: process.cwd(),
    env: process.env,
    out: text => process.stdout.write(text),
    err: text => process.stderr.write(text),
    interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    tty: Boolean(process.stdout.isTTY),
    ...(process.stdout.columns ? { columns: process.stdout.columns } : {}),
    async ask(question) {
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        return await rl.question(question)
      } finally {
        rl.close()
      }
    },
  }
}

/** Terminal styling that disappears without colour. */
export interface Style {
  bold: (text: string) => string
  dim: (text: string) => string
  red: (text: string) => string
  green: (text: string) => string
  yellow: (text: string) => string
  /** The fox's orange, where the terminal has 256 colours. */
  orange: (text: string) => string
}

export function style(color: boolean): Style {
  const wrap = (open: number | string, close: number) => (text: string) => color ? `\u001B[${open}m${text}\u001B[${close}m` : text
  return {
    bold: wrap(1, 22),
    dim: wrap(2, 22),
    red: wrap(31, 39),
    green: wrap(32, 39),
    yellow: wrap(33, 39),
    orange: wrap('38;5;208', 39),
  }
}

/** Lines of columns, padded to the widest cell of each column but the last. */
export function table(rows: string[][], indent = '  ', gap = '   '): string {
  const visible = (text: string) => text.replace(/\u001B\[[\d;]+m/g, '').length
  const widths: number[] = []
  for (const row of rows) {
    row.forEach((cell, index) => { widths[index] = Math.max(widths[index] ?? 0, visible(cell)) })
  }
  return rows.map(row => indent + row.map((cell, index) =>
    index === row.length - 1 ? cell : cell + ' '.repeat(widths[index]! - visible(cell)),
  ).join(gap).trimEnd()).join('\n')
}

/**
 * A labelled block: the label in a fixed-width first column, the rows as a
 * table beside it. Blocks printed one after another line up.
 */
export function block(label: string, rows: string[][], width = 10): string {
  const lines = table(rows, '', '   ').split('\n')
  return lines.map((line, index) => `  ${(index === 0 ? label : '').padEnd(width)}${line}`).join('\n')
}

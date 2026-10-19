/** Run the vitakit command in-process, as from a terminal or a script. */
import { main } from '../../src/cli/main'
import type { Io } from '../../src/cli/io'

export interface CliResult {
  code: number
  out: string
  err: string
  /** Questions asked, in order. */
  asked: string[]
}

export interface CliOptions {
  cwd: string
  env?: NodeJS.ProcessEnv
  /** Answers to questions, in order; makes the session interactive. */
  answers?: string[]
  /** Terminal width. */
  columns?: number
}

export async function cli(args: string[], options: CliOptions): Promise<CliResult> {
  let out = ''
  let err = ''
  const asked: string[] = []
  const answers = [...(options.answers ?? [])]
  const io: Io = {
    cwd: options.cwd,
    env: { npm_config_user_agent: 'pnpm/10.29.1 npm/? node/?', ...options.env },
    out: (text) => { out += text },
    err: (text) => { err += text },
    interactive: options.answers !== undefined,
    tty: false,
    ...(options.columns ? { columns: options.columns } : {}),
    async ask(question) {
      asked.push(question)
      if (!answers.length) throw new Error(`unexpected question: ${question}`)
      return answers.shift()!
    },
  }
  const code = await main(args, io)
  return { code, out, err, asked }
}

/**
 * `vitakit <command>`: dispatch, help, errors and exit codes.
 *
 * Exit codes: 0 success, 1 a problem in the project or a failed build,
 * 2 a mistake in how the command was called.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { packageRoot } from '../assets'
import { commands, detectPackageManager, type Commands } from '../package-manager'
import { commandHelp, CommandError, parseCommandArgs, UsageError, type CommandSpec } from './command'
import { resolveRoot } from './context'
import { banner, BANNER_WIDTH } from './banner'
import { processIo, style, type Io } from './io'
import { COMMANDS, GROUPS } from './registry'

function version(): string {
  return (JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')) as { version: string }).version
}

function overview(run: Commands): string {
  const width = Math.max(...COMMANDS.map(command => command.name.length))
  const groups = GROUPS.map(({ title, names }) => [
    title,
    ...names.map((name) => {
      const command = COMMANDS.find(candidate => candidate.name === name)!
      return `  ${command.name.padEnd(width)}   ${command.summary}`
    }),
  ].join('\n'))
  return [
    'vitakit — your website and CV from the files in content/',
    '',
    'Usage',
    `  ${run.bin('vitakit', '<command> [options]')}`,
    '',
    ...groups.flatMap(group => [group, '']),
    `Start with \`${run.bin('vitakit', 'status')}\`. Every command has --help.`,
    '',
  ].join('\n')
}

/** Removed commands of vitakit 0.1, and what replaces them. */
const MOVED: Record<string, string> = {
  list: 'eject --list',
}

export async function main(argv: string[], io: Io = processIo()): Promise<number> {
  const [name, ...rest] = argv
  // Help texts use the invocation of the project the user is in, if any.
  const run = commands(detectPackageManager(io.cwd, io.env))
  const color = io.tty && !io.env.NO_COLOR && !argv.includes('--no-color')

  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    const topic = name === 'help' ? rest[0] : undefined
    const command = topic ? COMMANDS.find(candidate => candidate.name === topic) : undefined
    if (command) {
      io.out(commandHelp(command, run))
      return 0
    }
    // The overview comes with the fox, where the terminal is wide enough;
    // the help of a single command stays plain.
    const paint = style(color)
    const room = io.columns === undefined || io.columns >= BANNER_WIDTH
    io.out(`${room ? `${banner(version(), { fox: paint.orange, bold: paint.bold })}\n\n` : ''}${overview(run)}`)
    return topic ? 2 : 0
  }
  if (name === '--version' || name === '-v') {
    io.out(`${version()}\n`)
    return 0
  }

  const spec: CommandSpec | undefined = COMMANDS.find(candidate => candidate.name === name)
  try {
    if (!spec) {
      const moved = MOVED[name]
      throw new UsageError(moved
        ? `"${name}" is now \`${run.bin('vitakit', moved)}\``
        : `unknown command "${name}"`)
    }
    const args = parseCommandArgs(spec, rest)
    if (args.values.help) {
      io.out(commandHelp(spec, run))
      return 0
    }
    const root = spec.project ? resolveRoot(io.cwd, args.values.root as string | undefined) : io.cwd
    const projectRun = spec.project ? commands(detectPackageManager(root, io.env)) : run
    return await spec.run({ io, style: style(color), run: projectRun, root, json: args.values.json === true }, args)
  } catch (error) {
    if (error instanceof UsageError) {
      const help = error.command ? run.bin('vitakit', `${error.command} --help`) : run.bin('vitakit', '--help')
      io.err(`vitakit: ${error.message}\n  See \`${help}\`.\n`)
      return 2
    }
    const message = error instanceof Error ? error.message : String(error)
    io.err(`vitakit: ${message}\n`)
    if (!(error instanceof CommandError) && io.env.VITAKIT_DEBUG && error instanceof Error) io.err(`${error.stack}\n`)
    return 1
  }
}

/**
 * The shape of a command, and strict argument parsing for it.
 *
 * Each command declares its positionals and options; anything else is a usage
 * error (exit code 2), never silently ignored.
 */
import { parseArgs } from 'node:util'
import type { Commands } from '../package-manager'
import type { Io, Style } from './io'

export interface OptionSpec {
  type: 'boolean' | 'string'
  multiple?: boolean
  short?: string
  /** Placeholder in help: `--out <dir>`. */
  value?: string
  description: string
}

export interface PositionalSpec {
  name: string
  required?: boolean
  variadic?: boolean
}

/** What every command receives. */
export interface CommandContext {
  io: Io
  style: Style
  /** Commands as this project runs them: `pnpm vitakit …` or `npx vitakit …`. */
  run: Commands
  /** The project root; resolved for commands that need a project. */
  root: string
  json: boolean
}

export interface CommandSpec {
  name: string
  /** One line for the command list. */
  summary: string
  positionals: PositionalSpec[]
  options: Record<string, OptionSpec>
  /** Longer help after the usage line; receives the project's invocation. */
  help: (run: Commands) => string
  /** Whether the command needs a project root. */
  project: boolean
  /** Whether `--json` is accepted. */
  json?: boolean
  run: (context: CommandContext, args: ParsedArgs) => Promise<number>
}

export interface ParsedArgs {
  positionals: string[]
  values: Record<string, string | boolean | (string | boolean)[] | undefined>
}

/** A mistake in how a command was called: exit code 2. */
export class UsageError extends Error {
  constructor(message: string, readonly command?: string) {
    super(message)
    this.name = 'UsageError'
  }
}

/** A failure the user can act on, already explained: exit code 1. */
export class CommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommandError'
  }
}

export const COMMON_OPTIONS: Record<string, OptionSpec> = {
  'help': { type: 'boolean', short: 'h', description: 'this help' },
  'root': { type: 'string', value: '<dir>', description: 'the project directory; found from the current one otherwise' },
  'no-color': { type: 'boolean', description: 'plain output, also when NO_COLOR is set' },
}

export const JSON_OPTION: OptionSpec = { type: 'boolean', description: 'print one JSON result instead of text' }

export function optionsOf(spec: CommandSpec): Record<string, OptionSpec> {
  return { ...COMMON_OPTIONS, ...(spec.json ? { json: JSON_OPTION } : {}), ...spec.options }
}

export function parseCommandArgs(spec: CommandSpec, argv: string[]): ParsedArgs {
  const options = optionsOf(spec)
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: Object.fromEntries(Object.entries(options).map(([name, option]) => [name, {
        type: option.type,
        ...(option.multiple ? { multiple: true } : {}),
        ...(option.short ? { short: option.short } : {}),
      }])),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\. To specify a positional argument.*$/s, '') : String(error)
    throw new UsageError(message.replace(/^Unknown option/, 'unknown option'), spec.name)
  }
  if (parsed.values.help) return { positionals: parsed.positionals, values: parsed.values }

  const { positionals } = parsed
  const variadic = spec.positionals.some(positional => positional.variadic)
  if (!variadic && positionals.length > spec.positionals.length) {
    throw new UsageError(`unexpected argument "${positionals[spec.positionals.length]}"`, spec.name)
  }
  const missing = spec.positionals.find((positional, index) => positional.required && positionals[index] === undefined)
  if (missing) throw new UsageError(`missing <${missing.name}>`, spec.name)
  return { positionals, values: parsed.values }
}

export function usageLine(spec: CommandSpec, run: Commands): string {
  const positionals = spec.positionals.map(positional => {
    const name = `<${positional.name}>${positional.variadic ? '...' : ''}`
    return positional.required ? name : `[${name}]`
  })
  return run.bin('vitakit', [spec.name, ...positionals, '[options]'].join(' '))
}

export function commandHelp(spec: CommandSpec, run: Commands): string {
  const options = optionsOf(spec)
  const rows = Object.entries(options).map(([name, option]) => {
    const flag = `${option.short ? `-${option.short}, ` : ''}--${name}${option.value ? ` ${option.value}` : ''}`
    return [flag, option.description]
  })
  const width = Math.max(...rows.map(([flag]) => flag!.length))
  return [
    `vitakit ${spec.name} — ${spec.summary}`,
    '',
    'Usage',
    `  ${usageLine(spec, run)}`,
    '',
    spec.help(run).trim(),
    '',
    'Options',
    ...rows.map(([flag, description]) => `  ${flag!.padEnd(width)}  ${description}`),
    '',
  ].join('\n')
}

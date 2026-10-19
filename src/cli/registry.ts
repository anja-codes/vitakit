/** Every command, and how the overview groups them. */
import type { CommandSpec } from './command'
import { eject } from './commands/eject'
import { explain } from './commands/explain'
import { pdf } from './commands/pdf'
import { status } from './commands/status'
import { validate } from './commands/validate'
import { verify } from './commands/verify'

export const COMMANDS: CommandSpec[] = [status, explain, validate, pdf, verify, eject]

export const GROUPS: { title: string, names: string[] }[] = [
  { title: 'Look', names: ['status', 'explain', 'validate'] },
  { title: 'Build and check', names: ['pdf', 'verify'] },
  { title: 'Change', names: ['eject'] },
]

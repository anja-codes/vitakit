/** Every command, and how the overview groups them. */
import type { CommandSpec } from './command'
import { add } from './commands/add'
import { customize } from './commands/customize'
import { eject } from './commands/eject'
import { explain } from './commands/explain'
import { migrate } from './commands/migrate'
import { pdf } from './commands/pdf'
import { status } from './commands/status'
import { validate } from './commands/validate'
import { verify } from './commands/verify'

export const COMMANDS: CommandSpec[] = [status, explain, validate, add, customize, pdf, verify, eject, migrate]

export const GROUPS: { title: string, names: string[] }[] = [
  { title: 'Look', names: ['status', 'explain', 'validate'] },
  { title: 'Build and check', names: ['pdf', 'verify'] },
  { title: 'Change', names: ['add', 'customize', 'eject', 'migrate'] },
]

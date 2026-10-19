/**
 * The end of every writing command: show the plan, ask, write, say what next.
 */
import type { CommandContext, ParsedArgs } from './command'
import type { Workspace } from './plan'

type Values = ParsedArgs['values']

/** Ask the questions that `--yes` and scripts answer with flags. */
export const asking = (context: CommandContext, values: Values): boolean => context.io.interactive && values.yes !== true

/** Show the plan, ask, write; then say what is next. */
export async function finish(
  context: CommandContext,
  ws: Workspace,
  values: Values,
  { before = [], after = [] }: { before?: string[], after?: string[] },
): Promise<number> {
  const { io, style, root } = context
  const { applyPlan, confirmPlan, printPlan } = await import('./plan')
  const plan = ws.plan()
  const writes = plan.items.some(item => item.kind === 'create' || item.kind === 'edit' || item.kind === 'replace')
  io.out('\n')
  printPlan(io, style, root, plan)
  if (before.length) io.out(`\n${before.join('\n')}\n`)
  if (!writes) {
    io.out('\nNothing to write.\n')
    if (after.length) io.out(`\n${after.join('\n')}\n`)
    return 0
  }
  if (values['dry-run']) {
    io.out(`\n${style.dim('Dry run: nothing was written.')}\n`)
    return 0
  }
  if (!await confirmPlan(io, plan, values.yes === true)) return 1
  await applyPlan(root, plan)
  io.out(`\n${style.green('✓')} done.${after.length ? `\n\n${after.join('\n')}` : ''}\n`)
  return 0
}


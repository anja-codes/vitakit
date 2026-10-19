/**
 * `@anja.codes/vitakit/cli` — the `vitakit` command.
 *
 * `main(argv)` runs a command and resolves to its exit code. The commands are
 * described in docs/cli/; their implementation lives in `cli/`.
 */
export { main } from './cli/main'
export type { Io } from './cli/io'
export { aligned, commands, detectPackageManager, type Commands, type PackageManager } from './package-manager'

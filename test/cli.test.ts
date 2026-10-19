/** The `vitakit` command's shared ground: package managers, help texts, the binary. */
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aligned, commands, detectPackageManager } from '../src/package-manager'
import { COMMANDS } from '../src/cli/registry'
import { cli } from './support/cli'
import { project, ROOT } from './support/project'

describe('package manager', () => {
  it.each([
    ['npm/11.19.0 node/v24.21.0 darwin arm64 workspaces/false', 'npm'],
    ['pnpm/10.29.1 npm/? node/? darwin arm64', 'pnpm'],
    ['yarn/4.9.0 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
  ])('is taken from the user agent %j, whatever the lockfile', async (userAgent, expected) => {
    expect(detectPackageManager(await project({ 'package-lock.json': '{}' }), { npm_config_user_agent: userAgent })).toBe(expected)
  })

  it.each([
    [{ 'package-lock.json': '{}' }, 'npm'],
    [{ 'pnpm-lock.yaml': '' }, 'pnpm'],
    [{ 'package-lock.json': '{}', 'pnpm-lock.yaml': '' }, 'pnpm'],
    [{}, 'pnpm'],
  ])('is taken from the lockfiles %j when a binary runs directly', async (files, expected) => {
    expect(detectPackageManager(await project(files), {})).toBe(expected)
  })

  it('decides how scripts and binaries are run', () => {
    expect([commands('pnpm').script('pdf', 'cv --tex-only'), commands('pnpm').bin('vitakit', 'status')])
      .toEqual(['pnpm pdf cv --tex-only', 'pnpm vitakit status'])
    expect([commands('npm').script('pdf', 'cv --tex-only'), commands('npm').script('check'), commands('npm').bin('vitakit', 'status')])
      .toEqual(['npm run pdf -- cv --tex-only', 'npm run check', 'npx vitakit status'])
  })

  it('aligns the comments in a list of commands', () => {
    expect(aligned([['npx a', '# one'], ['npx abc', '# two'], ['npx b']])).toBe('  npx a    # one\n  npx abc  # two\n  npx b')
  })
})

describe('help texts', () => {
  const help = async (args: string[], userAgent: string) =>
    (await cli(args, { cwd: tmpdir(), env: { npm_config_user_agent: userAgent } })).out

  // Every command, from the registry, so a new one cannot be forgotten here.
  it.each([[['--help']], ...COMMANDS.map(command => [[command.name, '--help']])])('vitakit %j speaks npm when run by npm, pnpm when run by pnpm', async (args) => {
    const npm = await help(args, 'npm/11.19.0 node/v24.21.0')
    expect(npm).toMatch(/npm run |npx /)
    expect(npm).not.toMatch(/pnpm/)

    const pnpm = await help(args, 'pnpm/10.29.1 npm/? node/?')
    expect(pnpm).toMatch(/pnpm /)
    expect(pnpm).not.toMatch(/npm run |npx /)
  })

  // The installed binary runs the built package; `pnpm check` builds first.
  it('the binary runs the built command', () => {
    const output = execFileSync(process.execPath, [join(ROOT, 'src/bin/vitakit.mjs'), '--version'], { encoding: 'utf8' })
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

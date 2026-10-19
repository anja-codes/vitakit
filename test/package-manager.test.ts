import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { aligned, commands, detectPackageManager } from '../src/package-manager'
import { cli } from './cli'

const temporary: string[] = []

async function project(files: Record<string, string> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'vitakit-pm-'))
  temporary.push(root)
  for (const [name, contents] of Object.entries(files)) await writeFile(join(root, name), contents)
  return root
}

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('detectPackageManager', () => {
  it.each([
    ['npm/11.19.0 node/v24.21.0 darwin arm64 workspaces/false', 'npm'],
    ['pnpm/10.29.1 npm/? node/? darwin arm64', 'pnpm'],
    ['yarn/4.9.0 npm/? node/v22.18.0 darwin arm64', 'pnpm'],
  ])('trusts the user agent %j', async (userAgent, expected) => {
    // A lockfile pointing the other way does not matter when the user agent is known.
    const root = await project({ 'package-lock.json': '{}' })
    expect(detectPackageManager(root, { npm_config_user_agent: userAgent })).toBe(expected)
  })

  it('falls back to the lockfile for a binary run directly', async () => {
    expect(detectPackageManager(await project({ 'package-lock.json': '{}' }), {})).toBe('npm')
    expect(detectPackageManager(await project({ 'pnpm-lock.yaml': '' }), {})).toBe('pnpm')
    expect(detectPackageManager(await project({ 'package-lock.json': '{}', 'pnpm-lock.yaml': '' }), {})).toBe('pnpm')
    expect(detectPackageManager(await project(), {})).toBe('pnpm')
  })
})

describe('commands', () => {
  it('writes scripts and binaries for pnpm', () => {
    const run = commands('pnpm')
    expect(run.script('check')).toBe('pnpm check')
    expect(run.script('build:cv', 'cv --no-pdf')).toBe('pnpm build:cv cv --no-pdf')
    expect(run.bin('vitakit', 'eject teaching')).toBe('pnpm vitakit eject teaching')
  })

  it('writes scripts and binaries for npm, passing script arguments after --', () => {
    const run = commands('npm')
    expect(run.script('check')).toBe('npm run check')
    expect(run.script('build:cv', 'cv --no-pdf')).toBe('npm run build:cv -- cv --no-pdf')
    expect(run.bin('vitakit', 'eject teaching')).toBe('npx vitakit eject teaching')
  })

  it('aligns comments after commands of different lengths', () => {
    expect(aligned([['npx a', '# one'], ['npx abc', '# two'], ['npx b']])).toBe(
      '  npx a    # one\n  npx abc  # two\n  npx b',
    )
  })
})

describe('help texts', () => {
  const help = async (args: string[], userAgent: string) =>
    (await cli(args, { cwd: tmpdir(), env: { npm_config_user_agent: userAgent } })).out

  it.each([
    [['--help']],
    [['status', '--help']],
    [['explain', '--help']],
    [['validate', '--help']],
    [['pdf', '--help']],
    [['verify', '--help']],
    [['eject', '--help']],
    [['add', '--help']],
    [['customize', '--help']],
  ])('vitakit %s speaks npm when run by npm, pnpm when run by pnpm', async (args) => {
    const npm = await help(args, 'npm/11.19.0 node/v24.21.0')
    expect(npm).not.toMatch(/pnpm/)
    expect(npm).toMatch(/npm run |npx /)

    const pnpm = await help(args, 'pnpm/10.29.1 npm/? node/?')
    expect(pnpm).toMatch(/pnpm /)
    expect(pnpm).not.toMatch(/npm run |npx /)
  })

  // The installed binary runs the built package; `pnpm check` builds first.
  it('the binary runs the built command', () => {
    const bin = fileURLToPath(new URL('../src/bin/vitakit.mjs', import.meta.url))
    const output = execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' })
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+/)
  })
})

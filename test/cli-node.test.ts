/**
 * The command as installed: the built package, run by Node itself.
 *
 * The other CLI tests run in-process under the test runner, which resolves
 * modules more leniently than Node does -- an extensionless relative import in
 * a schema works there and fails in a project. Here, schemas the CLI writes
 * are loaded the way a project loads them. Needs a fresh `dist/` (`pnpm check`
 * builds before testing).
 */
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exampleProject } from './support/example'

const bin = join(process.cwd(), 'src/bin/vitakit.mjs')

/** A copy of the example in which `@anja.codes/vitakit` is this package, built. */
async function installedProject(changes: Record<string, string> = {}): Promise<string> {
  const root = await exampleProject(changes)
  await rm(join(root, 'node_modules/@anja.codes/vitakit'), { recursive: true })
  await mkdir(join(root, 'node_modules/@anja.codes'), { recursive: true })
  await symlink(process.cwd(), join(root, 'node_modules/@anja.codes/vitakit'), 'dir')
  return root
}

function vitakit(root: string, args: string[]): { code: number, out: string } {
  try {
    return { code: 0, out: execFileSync(process.execPath, [bin, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, npm_config_user_agent: 'pnpm/10' } }) }
  } catch (error) {
    const failed = error as { status: number, stdout: string, stderr: string }
    return { code: failed.status, out: failed.stdout + failed.stderr }
  }
}

// Every `vitakit` call here spawns Node and loads the built package (~1s each
// on CI), so the default 5s is too tight for a test that runs several.
describe('schemas written by the CLI, loaded by Node', { timeout: 30_000 }, () => {
  it('drafted, extended and shared schemas all load', async () => {
    const root = await installedProject({
      'content/grants.yml': '- { date: 2024, title: A grant, funder: FWF, amount: 1000 }\n',
      'content/grants-old.yml': '- { date: 2014, title: An old grant, funder: ÖMG, amount: 100 }\n',
      'content/talks-public.yml': '- { date: 2024, title: Maths night, kind: outreach }\n',
    })
    expect(vitakit(root, ['add', 'section', 'grants', '--yes']).code).toBe(0)
    expect(vitakit(root, ['add', 'section', 'grants-old', '--like', 'grants', '--yes']).code).toBe(0)
    expect(await readFile(join(root, 'schemas/grants-old.ts'), 'utf8')).toContain(`export { default } from './grants.ts'`)
    expect(vitakit(root, ['add', 'section', 'talks-public', '--like', 'talks', '--yes']).code).toBe(0)
    expect(vitakit(root, ['add', 'field', 'teaching', 'evaluation', '--type', 'number', '--yes']).code).toBe(0)

    const validate = vitakit(root, ['validate'])
    expect(validate.out).toContain('no problems')
    expect(validate.code).toBe(0)
    expect(vitakit(root, ['explain', 'grants-old']).out).toMatch(/schema\s+schemas\/grants-old\.ts, the same as grants/)
  })

  it('reports a schema Node cannot load, naming it', async () => {
    const root = await installedProject({
      'content/grants.yml': '- { date: 2024, title: A grant }\n',
      'schemas/grants.ts': `export { default } from './missing'\n`,
    })
    await writeFile(join(root, 'content/grants.yml'), '- { date: 2024, title: A grant }\n')
    const result = vitakit(root, ['validate'])
    expect(result.code).toBe(1)
    expect(result.out).toMatch(/schemas\/grants\.ts\n\s+Cannot find module/)
  })
})

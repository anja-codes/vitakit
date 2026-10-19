/**
 * Every temporary directory of a test run inside one, removed afterwards.
 *
 * Tests create projects with `mkdtemp(tmpdir())` freely; pointing TMPDIR at a
 * directory of this run (workers inherit it) means none of them can be left
 * behind, however a test ends.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export default function setup(): () => void {
  const directory = mkdtempSync(join(tmpdir(), 'vitakit-tests-'))
  process.env.TMPDIR = directory
  return () => rmSync(directory, { recursive: true, force: true })
}

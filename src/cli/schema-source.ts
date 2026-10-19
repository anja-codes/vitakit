/**
 * The source of a built-in schema, as a project would import it.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveAsset } from '../assets'

/**
 * `src/schemas/<id>.ts` with its relative imports rewritten to the package
 * name, which exports everything they use. The definition itself, not a
 * paraphrase of it.
 */
export async function builtinSchemaSource(id: string): Promise<string> {
  const source = await readFile(join(resolveAsset('schemas'), `${id}.ts`), 'utf8')
  return source.replace(/from '\.\.\/[\w-]+'/g, "from '@anja.codes/vitakit'")
}

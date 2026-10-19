/**
 * The files vitakit ships beside its code. `scripts/check-dist.mjs` checks the
 * built layout; this checks the resolver, running from source.
 */
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAsset } from '../src/assets'

describe('resolveAsset', () => {
  it.each([
    ['styles', 'vitakit-math.csl'],
    ['tex/templates', '_generic.eta'],
    ['tex', 'vitakit-cv.cls'],
    ['runtime/components', 'VitaSection.vue'],
    ['schemas', 'publications.ts'],
  ] as const)('finds %s, with %s in it, as an absolute path', (asset, file) => {
    const path = resolveAsset(asset)
    expect(isAbsolute(path)).toBe(true)
    expect(existsSync(join(path, file))).toBe(true)
  })

  it('names the paths it tried when an asset is missing', () => {
    expect(() => resolveAsset('tex/nope.cls' as never)).toThrow(/^vitakit: missing bundled asset "tex\/nope\.cls"; looked in\n {2}.+\n {2}.+\nRun `pnpm build`/)
  })
})

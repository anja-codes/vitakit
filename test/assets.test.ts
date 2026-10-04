/**
 * The bundled assets are read at build time in someone else's project, so a
 * wrong path fails there rather than here. `scripts/check-dist.mjs` asserts the
 * built layout; these assert the resolver's behaviour and its error.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAsset } from '../src/assets'

describe('resolveAsset', () => {
  it('resolves every asset the package ships', () => {
    for (const asset of ['styles', 'tex', 'tex/templates', 'tex/vitakit-cv.cls', 'runtime', 'runtime/components'] as const) {
      expect(existsSync(resolveAsset(asset)), asset).toBe(true)
    }
  })

  it('returns absolute paths, so callers can chdir freely', () => {
    expect(resolveAsset('tex')).toMatch(/^([/\\]|[A-Za-z]:)/)
  })

  it('finds the files the emitter and the CLI actually open', () => {
    expect(existsSync(join(resolveAsset('tex/templates'), '_generic.eta'))).toBe(true)
    expect(existsSync(join(resolveAsset('tex/templates'), 'publications.eta'))).toBe(true)
    expect(existsSync(join(resolveAsset('styles'), 'vitakit-math.csl'))).toBe(true)
    expect(existsSync(join(resolveAsset('runtime/components'), 'VitaSection.vue'))).toBe(true)
  })

  it('names the paths it tried when an asset is missing', () => {
    expect(() => resolveAsset('tex/nope.cls' as never))
      .toThrow(/missing bundled asset "tex\/nope\.cls"[\s\S]*pnpm build/)
  })
})

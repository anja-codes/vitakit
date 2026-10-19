import { cp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { defineBuildConfig } from 'unbuild'

/**
 * Two bundled Node entries, plus the runtime copied verbatim.
 *
 * `index` and `nuxt` run at build time and are bundled normally. `runtime/`
 * contains Vue SFCs and composables that Nuxt must process itself (auto-imports,
 * `#vitakit/content` alias, tree-shaking), so it is shipped as source and listed
 * in `build.transpile` by the module. Compiling it here would only add a second,
 * divergent toolchain for no benefit.
 */
export default defineBuildConfig({
  entries: ['src/index', 'src/nuxt', 'src/shared/index', 'src/tex', 'src/check', 'src/cli'],
  declaration: 'node16',
  clean: true,
  rollup: { emitCJS: false, inlineDependencies: false },
  // `dist/runtime` is produced by the hook below, after unbuild's own checks
  // run, so its "missing package.json files" warning is a false positive.
  failOnWarn: false,
  externals: ['#vitakit/content', 'vue', 'nuxt', '@nuxt/kit', '@nuxt/schema'],
  hooks: {
    async 'build:done'() {
      const copy = async (from: string, to: string) => {
        const target = fileURLToPath(new URL(to, import.meta.url))
        await rm(target, { recursive: true, force: true })
        await cp(fileURLToPath(new URL(from, import.meta.url)), target, { recursive: true })
      }
      await copy('src/runtime', 'dist/runtime')
      // Bundled code resolves the CSL style relative to its own chunk, whose
      // depth inside dist/ is not fixed, so the styles are copied next to it.
      await copy('styles', 'dist/styles')
      // Templates and the document class are read at build time by the
      // emitter; the source layout mirrors dist/ so that running from source
      // (tests) and from the package resolve identically.
      await copy('src/tex/templates', 'dist/tex/templates')
      // Section schema sources, copied by `vitakit customize <section> --schema --copy`.
      await copy('src/schemas', 'dist/schemas')
      await copy('src/tex/vitakit-cv.cls', 'dist/tex/vitakit-cv.cls')
    },
  },
})

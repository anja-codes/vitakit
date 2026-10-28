/**
 * The Nuxt module: compiles `content/` into a typed virtual module, registers
 * prerender routes, and reloads in place while developing.
 *
 * Design consequences:
 *   - no content runtime, no Markdown parser and no KaTeX in the browser bundle
 *   - a broken file fails `nuxt generate`, but only *reports* during `nuxt dev`
 *   - `useVitakit()` is a plain typed object, not a fetch
 */
import {
  addComponentsDir,
  addImportsDir,
  addPrerenderRoutes,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  updateTemplates,
} from '@nuxt/kit'
import { createRequire } from 'node:module'
import type { NuxtModule } from '@nuxt/schema'
import { loadContent } from './content'
import { sectionTypeSources, sectionTypesDeclaration } from './section-types'
import { fail } from './issues'
import { findWebPlacements, publicationPlacementProblems } from './placements'
import { watchComponentOverrides } from './dev-overrides'
import type { VitakitContent } from './shared/types'

export interface ModuleOptions {
  /** Where `content/` and `schemas/` live. Defaults to the Nuxt root. */
  rootDir?: string
  /**
   * Add KaTeX's stylesheet to every page. On by default; turn it off only to
   * load the stylesheet yourself, and then from the same KaTeX version.
   */
  katexCss?: boolean
}

/**
 * The stylesheet of the KaTeX that renders formulas at build time.
 *
 * KaTeX's markup changes between its 0.x releases, so the stylesheet must
 * come from exactly the version that wrote the markup: the one rehype-katex
 * depends on, not one a project installs on its own.
 */
function katexStylesheet(): string {
  const renderer = createRequire(createRequire(import.meta.url).resolve('rehype-katex'))
  return renderer.resolve('katex/dist/katex.min.css')
}

const TEMPLATE = 'vitakit/content.mjs'
const TYPES = 'vitakit/content.d.ts'
const SECTION_TYPES = 'vitakit/sections.d.ts'

function report(content: VitakitContent): void {
  if (!content.issues.length) return
  const lines = content.issues.map(issue => `  ${issue.where}: ${issue.message.replace(/\n/g, '\n  ')}`)
  console.error(`\n[vitakit] ${content.issues.length} content problem(s):\n${lines.join('\n')}\n`)
}

// The explicit annotation keeps the emitted .d.ts portable; without it the
// inferred type references a pnpm-internal path to @nuxt/schema.
const module: NuxtModule<ModuleOptions> = defineNuxtModule<ModuleOptions>({
  meta: {
    name: 'vitakit',
    configKey: 'vitakit',
    compatibility: { nuxt: '>=4.0.0' },
  },
  async setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const rootDir = options.rootDir ?? nuxt.options.rootDir

    const load = (strict: boolean) => loadContent(rootDir, {
      strict,
      baseURL: nuxt.options.app.baseURL,
      // The website never sees anything but public entries; `cv` and `private`
      // exist for the LaTeX side and must not reach the browser bundle.
      maxVisibility: 'public',
    })

    // Builds are strict so CI cannot publish broken content; dev is lenient so
    // a typo cannot kill the server (a throw in setup() is unrecoverable).
    let content = await load(!nuxt.options.dev)
    report(content)

    // Pages showing a list that does not exist, checked once per build. In
    // development the page itself says so, and no Vue file is watched for it.
    if (!nuxt.options.dev && !nuxt.options._prepare) {
      const { publications } = await findWebPlacements(rootDir)
      const [problem] = publicationPlacementProblems(publications, [], Object.keys(content.publications))
      if (problem) fail(problem.where, problem.message)
    }

    // The compiled content is a written file aliased as `#vitakit/content`, so
    // components import it like any other module and HMR can replace it.
    nuxt.options.alias['#vitakit/content'] = `${nuxt.options.buildDir}/${TEMPLATE}`

    addTemplate({
      filename: TEMPLATE,
      write: true,
      getContents: () => `export default ${JSON.stringify(content)}\n`,
    })

    addTypeTemplate({
      filename: TYPES,
      getContents: () => [
        `import type { VitakitContent } from '@anja.codes/vitakit'`,
        `declare module '#vitakit/content' {`,
        `  const content: VitakitContent`,
        `  export default content`,
        `}`,
        '',
      ].join('\n'),
    })

    // Section id -> entry type, from content/*.yml and each one's schema. The
    // schema is referenced, not copied: a field added to schemas/<id>.ts is
    // typed at once; which sections exist is rewritten as files come and go.
    let sections = await sectionTypeSources(rootDir)
    addTypeTemplate({
      filename: SECTION_TYPES,
      getContents: () => sectionTypesDeclaration(sections, nuxt.options.buildDir),
    })

    if (options.katexCss !== false) nuxt.options.css.push(katexStylesheet())

    // The runtime ships as source (Vue SFCs and TypeScript), so Nuxt has to
    // compile it rather than treating it as a prebuilt dependency.
    nuxt.options.build.transpile.push(resolver.resolve('./runtime'))

    addImportsDir(resolver.resolve('./runtime/composables'))
    await addComponentsDir({ path: resolver.resolve('./runtime/components'), prefix: 'Vita', pathPrefix: false })

    // Every Markdown page gets an explicit prerender route, so a page that is
    // not linked from anywhere is still generated.
    addPrerenderRoutes(content.pages.map(page => page.route))

    if (!nuxt.options.dev) return

    await watchComponentOverrides(nuxt, resolver.resolve('./runtime/components'))

    // Watch paths are relative to srcDir (`app/`).
    nuxt.options.watch.push('../content', '../schemas')

    // Recompile in place instead of restarting Nuxt, so that fixing a file
    // recovers without losing the dev server.
    nuxt.hook('builder:watch', async (event, path) => {
      if (!/[/\\](content|schemas)[/\\]/.test(path)) return
      // A section or a schema file added or removed: which sections are typed, and how.
      if (event === 'add' || event === 'unlink') {
        const found = await sectionTypeSources(rootDir)
        if (JSON.stringify(found) !== JSON.stringify(sections)) {
          sections = found
          await updateTemplates({ filter: item => item.filename === SECTION_TYPES })
        }
      }
      try {
        content = await load(false)
      } catch (error) {
        console.error(`\n[vitakit] ${error instanceof Error ? error.message : String(error)}\n`)
        return
      }
      report(content)
      await updateTemplates({ filter: item => item.filename === TEMPLATE })
    })
  },
})

export default module

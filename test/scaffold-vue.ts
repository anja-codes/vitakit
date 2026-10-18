import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { compileScript, parse } from 'vue/compiler-sfc'
import { createSSRApp, defineComponent, h, type Component } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { ModuleKind, transpileModule } from 'typescript'
import * as shared from '../src/shared'
import type { VitakitContent } from '../src/shared'

const require = createRequire(import.meta.url)
const compiled = new Map<string, string>()

/** Evaluate the real SFCs without a Nuxt build; only Nuxt's auto-import boundary is supplied. */
function evaluate(source: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): Record<string, unknown> {
  const exports: Record<string, unknown> = {}
  const code = transpileModule(source, { compilerOptions: { module: ModuleKind.CommonJS } }).outputText
  const localRequire = (id: string) => Object.hasOwn(imports, id) ? imports[id] : require(id)
  new Function('require', 'exports', ...Object.keys(globals), code)(localRequire, exports, ...Object.values(globals))
  return exports
}

export async function renderScaffold(
  page: string,
  content: VitakitContent,
  directory = 'create/template',
): Promise<{ html: string, heads: unknown[] }> {
  // Use the actual composables, including unknown-section fallback and route normalisation.
  const composables = evaluate(await readFile(resolve('src/runtime/composables/useVitakit.ts'), 'utf8'), {
    '#vitakit/content': { default: content },
  })
  const heads: unknown[] = []
  const globals = {
    ...composables,
    useHead: (head: unknown) => heads.push(head),
    createError: (options: { statusMessage: string }) => Object.assign(new Error(options.statusMessage), options),
  }
  const imports = { '#imports': composables, '@anja.codes/vitakit/shared': shared }

  async function component(file: string): Promise<Component> {
    const filename = resolve(file)
    let source = compiled.get(filename)
    if (!source) {
      const { descriptor, errors } = parse(await readFile(filename, 'utf8'), { filename })
      if (errors.length) throw errors[0]
      source = compileScript(descriptor, {
        id: filename,
        inlineTemplate: true,
        templateOptions: { ssr: true },
      }).content
      compiled.set(filename, source)
    }
    return evaluate(source, imports, globals).default as Component
  }

  const app = createSSRApp(await component(`${directory}/app/pages/${page}.vue`))
  for (const name of ['VitaDate', 'VitaEntry', 'VitaLinks', 'VitaMarkdown', 'VitaSection', 'VitaPublication', 'VitaPublications']) {
    app.component(name, await component(`src/runtime/components/${name}.vue`))
  }
  app.component('NuxtLink', defineComponent({
    props: ['to'],
    setup: (props, { slots }) => () => h('a', { href: props.to }, slots.default?.()),
  }))
  return { html: await renderToString(app), heads }
}

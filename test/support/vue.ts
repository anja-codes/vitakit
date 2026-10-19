/** Compile the actual SFCs for SSR without a Nuxt server or a full build. */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import type { Component, Slots } from 'vue'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const require = createRequire(import.meta.url)

/** Optional source lets tests compile real parent templates without temporary files. */
export function compileVue(file: URL, imports: Record<string, unknown> = {}, source?: string): Component {
  const filename = file.pathname
  const { descriptor, errors } = parse(source ?? readFileSync(file, 'utf8'), { filename })
  if (errors.length) throw errors[0]
  const script = compileScript(descriptor, { id: filename })
  const template = compileTemplate({
    source: descriptor.template!.content,
    filename,
    id: filename,
    ssr: true,
    ssrCssVars: descriptor.cssVars,
    compilerOptions: { bindingMetadata: script.bindings },
  })
  if (template.errors.length) throw template.errors[0]
  const code = ts.transpileModule(`${script.content}\n${template.code}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: `${filename}.ts`,
  }).outputText
  const exports: { default?: Component, ssrRender?: unknown } = {}
  const resolve = (id: string) => id in imports ? imports[id] : require(id)
  // Only trusted, repository-owned components are compiled here.
  new Function('require', 'exports', code)(resolve, exports)
  return Object.assign(exports.default!, { ssrRender: exports.ssrRender })
}

export async function renderVue(component: Component, props: Record<string, unknown>, components: Record<string, Component> = {}, slots?: Slots): Promise<string> {
  const app = createSSRApp({ render: () => h(component, props, slots) })
  for (const [name, child] of Object.entries(components)) app.component(name, child)
  return renderToString(app)
}

/**
 * An SFC as Nuxt compiles it: names Nuxt imports automatically (`useSection`,
 * `computed`, …) are imported explicitly from `from`.
 */
export function withAutoImports(source: string, names: string[], from = '#imports'): string {
  return source.replace(/<script setup( lang="ts")?>/, match => `${match}\nimport { ${names.join(', ')} } from '${from}'`)
}

/**
 * The Nuxt module's setup, against a stand-in Nuxt: how content is loaded, and
 * how development reacts to edits and to component overrides.
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Nuxt } from '@nuxt/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import vitakit from '../src/nuxt'
import { project } from './support/project'

const mocks = vi.hoisted(() => ({
  loadContent: vi.fn(async () => ({ pages: [{ route: '/research/' }], publications: {}, issues: [] })),
  addPrerenderRoutes: vi.fn(),
  updateTemplates: vi.fn(async () => {}),
}))
vi.mock('../src/content', () => ({ loadContent: mocks.loadContent }))
vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (module: unknown) => module,
  createResolver: (url: string) => ({ resolve: (path: string) => resolve(dirname(fileURLToPath(url)), path) }),
  addComponentsDir: vi.fn(async () => {}),
  addImportsDir: vi.fn(),
  addPrerenderRoutes: mocks.addPrerenderRoutes,
  addTemplate: vi.fn(),
  addTypeTemplate: vi.fn(),
  updateTemplates: mocks.updateTemplates,
}))

const packagedDir = fileURLToPath(new URL('../src/runtime/components', import.meta.url))
type Component = { pascalName: string, filePath: string }
const packaged = (name = 'VitaDate'): Component => ({ pascalName: name, filePath: resolve(packagedDir, `${name}.vue`) })
const local = (filePath: string, pascalName = 'VitaDate'): Component => ({ pascalName, filePath })
const DATE = local('/project/app/components/VitaDate.vue')
const ENTRY = local('/project/app/components/VitaEntry.vue', 'VitaEntry')

/** Run the module's setup against a stand-in Nuxt that records hooks. */
async function setup({ rootDir = '/project', srcDir = '/project/app', dev = true } = {}) {
  const hooks = new Map<string, ((...args: unknown[]) => unknown)[]>()
  const restart = vi.fn()
  const emit = async (name: string, ...args: unknown[]) => {
    for (const handler of hooks.get(name) ?? []) await handler(...args)
  }
  const nuxt = {
    options: { rootDir, srcDir, dev, buildDir: '/project/.nuxt', app: { baseURL: '/sub/' }, alias: {}, css: [], build: { transpile: [] }, watch: [] },
    hook: (name: string, handler: (...args: unknown[]) => unknown) => hooks.set(name, [...hooks.get(name) ?? [], handler]),
    callHook: async (name: string) => name === 'restart' ? restart() : undefined,
  }
  await (vitakit as unknown as { setup: (options: object, nuxt: Nuxt) => Promise<void> }).setup({ katexCss: false }, nuxt as unknown as Nuxt)
  return {
    nuxt,
    hooks,
    restart,
    /** Nuxt's component scan, as the `components:extend` hook sees it. */
    scan: (...components: Component[]) => emit('components:extend', components),
    watch: (event: string, path: string) => emit('builder:watch', event, path),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('loading content', () => {
  it('is strict and public-only for a build, and prerenders every page', async () => {
    const app = await setup({ dev: false })
    expect(mocks.loadContent).toHaveBeenCalledExactlyOnceWith('/project', { strict: true, baseURL: '/sub/', maxVisibility: 'public' })
    expect(mocks.addPrerenderRoutes).toHaveBeenCalledWith(['/research/'])
    expect([...app.hooks.keys()]).toEqual([])
    expect(app.nuxt.options.watch).toEqual([])
  })

  it('fails a build whose pages show a publication list that does not exist', async () => {
    const root = await project({ 'app/pages/index.vue': '<template>\n  <VitaPublications list="recnet" />\n</template>\n' })
    mocks.loadContent.mockResolvedValueOnce({ pages: [], publications: { recent: { count: 0, groups: [] } }, issues: [] } as never)
    await expect(setup({ rootDir: root, dev: false })).rejects.toThrow(/app\/pages\/index\.vue:2: no publication list "recnet"; the lists are recent/)
  })

  it('is lenient in development, and reloads in place when content/ or schemas/ change', async () => {
    const app = await setup()
    expect(mocks.loadContent).toHaveBeenLastCalledWith('/project', expect.objectContaining({ strict: false }))
    expect(app.nuxt.options.watch).toEqual(['../content', '../schemas'])

    await app.watch('change', '/project/content/talks.yml')
    await app.watch('add', '/project/schemas/outreach.ts')
    await app.watch('change', '/project/app/pages/index.vue')
    expect(mocks.loadContent).toHaveBeenCalledTimes(3)
    expect(mocks.updateTemplates).toHaveBeenCalledTimes(2)
    expect(app.restart).not.toHaveBeenCalled()
  })
})

describe('overriding a packaged component during development', () => {
  it('restarts Nuxt once when an override appears, without needing a watcher event', async () => {
    const app = await setup()
    await app.scan(packaged())
    await app.scan(DATE)
    await app.scan(DATE)
    expect(app.restart).toHaveBeenCalledOnce()
  })

  it('does not restart for the overrides that exist at startup', async () => {
    const app = await setup()
    await app.scan(DATE, ENTRY)
    await app.scan(ENTRY, DATE)
    await app.scan(ENTRY, DATE, local('/project/app/components/MyCard.vue', 'MyCard'))
    expect(app.restart).not.toHaveBeenCalled()
  })

  it.each([
    ['removed', [DATE], [packaged()]],
    ['moved', [DATE], [local('/project/ui/VitaDate.vue')]],
    ['several at once', [packaged(), packaged('VitaEntry')], [DATE, ENTRY]],
  ])('restarts once when overrides are %s', async (_change, before, after) => {
    const app = await setup()
    await app.scan(...before)
    await app.scan(...after)
    await app.scan(...before)
    expect(app.restart).toHaveBeenCalledOnce()
  })

  it.each([
    ['a different component in a Vita/ directory', local('/project/app/components/Other/VitaDate.vue', 'OtherVitaDate')],
    ['a Vita-prefixed component vitakit does not ship', local('/project/app/components/VitaNotPackaged.vue', 'VitaNotPackaged')],
    ['the packaged component itself', packaged()],
    ['a component from a dependency', local('/project/node_modules/other/VitaDate.vue')],
    ['a component outside the project', local('/project-other/VitaDate.vue')],
    ['a virtual component', local('virtual:VitaDate')],
  ])('ignores %s', async (_case, component) => {
    const app = await setup()
    await app.scan(packaged())
    await app.scan(packaged(), component)
    expect(app.restart).not.toHaveBeenCalled()
  })

  it.each([
    ['in the root', '/project', '/project/components/VitaDate.vue'],
    ['in srcDir', '/project/frontend', '/project/frontend/components/VitaDate.vue'],
    ['in srcDir outside the root', '/elsewhere/app', '/elsewhere/app/components/VitaDate.vue'],
    ['in a nested directory Nuxt resolved to the name', '/project/app', '/project/app/components/Vita/Date.vue'],
  ])('counts an override %s', async (_case, srcDir, filePath) => {
    const app = await setup({ srcDir })
    await app.scan(packaged())
    await app.scan(local(filePath))
    expect(app.restart).toHaveBeenCalledOnce()
  })
})

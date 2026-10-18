import { readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Nuxt } from '@nuxt/schema'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import vitakit from '../src/nuxt'

const mocks = vi.hoisted(() => ({
  load: vi.fn(async () => ({ pages: [], issues: [] })),
  updateTemplates: vi.fn(async () => {}),
}))
vi.mock('../src/content', () => ({ loadContent: mocks.load }))
vi.mock('@nuxt/kit', () => ({
  defineNuxtModule: (module: unknown) => module,
  createResolver: (url: string) => ({ resolve: (path: string) => resolve(dirname(fileURLToPath(url)), path) }),
  addComponentsDir: vi.fn(async () => {}),
  addImportsDir: vi.fn(),
  addPrerenderRoutes: vi.fn(),
  addTemplate: vi.fn(),
  addTypeTemplate: vi.fn(),
  updateTemplates: mocks.updateTemplates,
}))

const packagedDir = fileURLToPath(new URL('../src/runtime/components', import.meta.url))
const packaged = (name = 'VitaDate') => ({ pascalName: name, filePath: resolve(packagedDir, `${name}.vue`) })
const local = (filePath: string, pascalName = 'VitaDate') => ({ pascalName, filePath })
type Handler = (...args: any[]) => unknown

async function harness({ rootDir = '/project', srcDir = '/project/app', dev = true }: {
  rootDir?: string, srcDir?: string, dev?: boolean
} = {}) {
  const hooks = new Map<string, Handler[]>()
  const restart = vi.fn(async () => {})
  const emit = async (name: string, ...args: unknown[]) => {
    for (const handler of hooks.get(name) ?? []) await handler(...args)
  }
  const nuxt = {
    options: {
      rootDir, srcDir, dev, buildDir: resolve(rootDir, '.nuxt'),
      app: { baseURL: '/' }, alias: {}, css: [], build: { transpile: [] }, watch: [] as string[],
    },
    hook(name: string, handler: Handler) {
      hooks.set(name, [...hooks.get(name) ?? [], handler])
    },
    async callHook(name: string, ...args: unknown[]) {
      if (name === 'restart') await restart(...args as [])
      await emit(name, ...args)
    },
  }
  const module = vitakit as unknown as { setup: (options: { katexCss: boolean }, nuxt: Nuxt) => Promise<void> }
  await module.setup({ katexCss: false }, nuxt as unknown as Nuxt)
  return {
    ...nuxt, restart, hooks,
    watch: (event: string, path: string) => emit('builder:watch', event, path),
    scan: (...components: ReturnType<typeof local>[]) => emit('components:extend', components),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('dev component override restart (mocked Nuxt module/scanner lifecycle)', () => {
  it('restarts when a scan discovers an added override, without a preceding watcher event', async () => {
    const app = await harness()
    await app.scan(packaged())
    await app.scan(local('/project/app/components/VitaDate.vue'))
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
    // A backend may emit its watcher event only after the scan has finished.
    await app.watch('add', 'components/VitaDate.vue')
    await app.scan(local('/project/app/components/VitaDate.vue'))
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
    expect(mocks.load).toHaveBeenCalledTimes(1)
    expect(mocks.updateTemplates).not.toHaveBeenCalled()
  })

  it('seeds initial overrides without restarting, then restarts when one is removed', async () => {
    const app = await harness()
    await app.scan(local('/project/app/components/VitaDate.vue'))
    expect(app.restart).not.toHaveBeenCalled()
    await app.scan(packaged())
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
  })

  it('keeps ordinary edits and unrelated additions/removals on HMR when the override set is unchanged', async () => {
    const app = await harness()
    const date = local('/project/app/components/VitaDate.vue')
    await app.scan(date)
    await app.watch('change', 'components/VitaDate.vue')
    await app.scan(date)
    await app.watch('add', 'components/MyCard.vue')
    await app.scan(date, local('/project/app/components/MyCard.vue', 'MyCard'))
    await app.watch('unlink', 'components/MyCard.vue')
    await app.scan(date)
    expect(app.restart).not.toHaveBeenCalled()
    expect(mocks.updateTemplates).not.toHaveBeenCalled()
  })

  it('uses resolved Nuxt names, not basenames or a broad Vita prefix', async () => {
    const app = await harness()
    await app.scan(packaged())
    for (const [path, name] of [
      ['components/Other/VitaDate.vue', 'OtherVitaDate'],
      ['components/VitaNotPackaged.vue', 'VitaNotPackaged'],
      ['components/VitaDate.vue', 'CustomVitaDate'],
    ] as const) {
      await app.scan(packaged(), local(`/project/app/${path}`, name))
    }
    // A disabled/ignored component is absent from Nuxt's scan, even if its name matches.
    await app.watch('add', 'components/VitaDate.vue')
    await app.scan(packaged())
    expect(app.restart).not.toHaveBeenCalled()
  })

  it('supports a genuine nested/custom-dir override resolved by Nuxt', async () => {
    const app = await harness()
    await app.scan(packaged())
    await app.scan(local('/project/ui/Vita/Date.vue'))
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
  })

  it.each([
    { rootDir: '/project', srcDir: '/project' },
    { rootDir: '/project', srcDir: '/project/frontend/source' },
    { rootDir: '/project', srcDir: '/external/app' },
  ])('recognizes local overrides with srcDir=$srcDir', async ({ rootDir, srcDir }) => {
    const app = await harness({ rootDir, srcDir })
    await app.scan(packaged())
    await app.scan(local(resolve(srcDir, 'components/VitaDate.vue')))
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
  })

  it('ignores packaged/dependency components, relative IDs and files outside the local project', async () => {
    const app = await harness()
    await app.scan(packaged())
    for (const path of [
      packaged().filePath, '/project/node_modules/other/VitaDate.vue',
      '/elsewhere/VitaDate.vue', '/project-other/VitaDate.vue', 'virtual:VitaDate',
    ]) {
      await app.scan(local(path))
    }
    expect(app.restart).not.toHaveBeenCalled()
  })

  it('detects replacement of an override even if the number of overrides is unchanged', async () => {
    const app = await harness()
    await app.scan(local('/project/app/components/VitaDate.vue'))
    await app.scan(local('/project/ui/VitaDate.vue'))
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
  })

  it('coalesces multiple additions/removals and repeated scans into one normal soft restart', async () => {
    const app = await harness()
    await app.scan(packaged(), packaged('VitaEntry'))
    const date = local('/project/app/components/VitaDate.vue')
    const entry = local('/project/app/components/VitaEntry.vue', 'VitaEntry')
    await app.scan(date, entry)
    await app.scan(entry, date)
    await app.scan(packaged(), packaged('VitaEntry'))
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
  })

  it('handles a directory removal through the resolved scan alone', async () => {
    const app = await harness()
    await app.scan(local('/project/app/components/Vita/Date.vue'), local('/project/app/components/Vita/Entry.vue', 'VitaEntry'))
    await app.scan(packaged(), packaged('VitaEntry'))
    expect(app.restart).toHaveBeenCalledExactlyOnceWith()
  })

  it('does not depend on scan order when the override set stays the same', async () => {
    const app = await harness()
    const date = local('/project/app/components/VitaDate.vue')
    const entry = local('/project/app/components/VitaEntry.vue', 'VitaEntry')
    await app.scan(date, entry)
    await app.scan(entry, date)
    expect(app.restart).not.toHaveBeenCalled()
  })

  it('derives every known override name from the packaged SFCs', async () => {
    for (const file of (await readdir(packagedDir)).filter(file => file.endsWith('.vue'))) {
      const app = await harness()
      const name = file.slice(0, -4)
      await app.scan(packaged(name))
      await app.scan(local(`/project/app/components/${file}`, name))
      expect(app.restart).toHaveBeenCalledExactlyOnceWith()
    }
  })

  it('does not install development hooks in production', async () => {
    const app = await harness({ dev: false })
    expect(app.hooks.has('components:extend')).toBe(false)
    expect(app.hooks.has('builder:watch')).toBe(false)
    await app.scan(packaged())
    await app.scan(local('/project/app/components/VitaDate.vue'))
    expect(app.restart).not.toHaveBeenCalled()
    expect(app.options.watch).toEqual([])
  })

  it('leaves content/schema reloading on the existing single in-place watcher', async () => {
    const app = await harness()
    expect(app.hooks.get('builder:watch')).toHaveLength(1)
    expect(app.options.watch).toEqual(['../content', '../schemas'])
    await app.scan(packaged())
    await app.watch('change', '../content/profile.yml')
    await app.scan(packaged())
    expect(mocks.load).toHaveBeenCalledTimes(2)
    expect(mocks.updateTemplates).toHaveBeenCalledTimes(1)
    expect(app.restart).not.toHaveBeenCalled()
  })
})

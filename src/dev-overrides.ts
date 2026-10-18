import { readdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import type { Nuxt } from '@nuxt/schema'

function isWithin(directory: string, path: string): boolean {
  const child = relative(directory, path)
  return child === '' || (!isAbsolute(child) && child.split(/[/\\]/)[0] !== '..')
}

/** Restart only when Nuxt's scanner actually changes a packaged component override. */
export async function watchComponentOverrides(nuxt: Nuxt, packagedDir: string): Promise<void> {
  // These are the flat, Vita-prefixed SFCs registered by the module. Let Nuxt's
  // scanner resolve local names, prefixes, ignored files, priorities and modes;
  // a file merely named VitaDate.vue in a nested directory need not override it.
  const names = new Set((await readdir(packagedDir))
    .filter(file => file.endsWith('.vue'))
    .map(file => file.slice(0, -4)))
  let previous: Set<string> | undefined
  let restarting = false

  // Compare resolved overrides rather than watcher events: scanning can happen
  // before builder:watch. Initial overrides seed the snapshot; ordinary edits
  // and unrelated additions leave it unchanged and keep their usual HMR.
  nuxt.hook('components:extend', async (components) => {
    const overrides = new Set(components
      .filter(component => names.has(component.pascalName)
        && isAbsolute(component.filePath)
        && !isWithin(packagedDir, component.filePath)
        && !component.filePath.replace(/\\/g, '/').split('/').includes('node_modules')
        && (isWithin(nuxt.options.srcDir, component.filePath)
          || isWithin(nuxt.options.rootDir, component.filePath)))
      .map(component => resolve(component.filePath)))
    const before = previous
    previous = overrides
    if (!before || restarting
      || (before.size === overrides.size && [...before].every(path => overrides.has(path)))) return

    // One normal soft restart re-resolves all imports, including multiple files
    // added/removed together. A fresh module owns subsequent changes.
    restarting = true
    try {
      await nuxt.callHook('restart')
    } catch (error) {
      restarting = false
      throw error
    }
  })
}

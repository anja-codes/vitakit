/**
 * Local typecheck stub for the virtual module that the Nuxt module generates.
 *
 * Consumers get the real declaration from `addTypeTemplate` in `src/nuxt.ts`;
 * this file exists only so `pnpm typecheck` can resolve the import inside
 * `src/runtime/`. It is not shipped (see `files` in package.json).
 */
declare module '#vitakit/content' {
  // An `import()` type, because an ambient module cannot use a relative import
  // statement; `skipLibCheck` would hide that error and leave `content` as any.
  const content: import('../src/shared/types').VitakitContent
  export default content
}

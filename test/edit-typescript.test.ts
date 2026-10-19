import { describe, expect, it } from 'vitest'
import { addSchemaField, ensurePackageImports, propertyKey, recognizeSchema } from '../src/edit/typescript'

const value = <T>(result: { ok: true, value: T } | { ok: false, reason: string }): T => {
  if (!result.ok) throw new Error(result.reason)
  return result.value
}

describe('recognizing a schema module', () => {
  it('finds section(...) and extendSection(...), directly or through a const', () => {
    expect(value(recognizeSchema(`import { section, text } from '@anja.codes/vitakit'\nexport default section({ title: text })\n`)))
      .toMatchObject({ kind: 'section', fields: ['title'] })
    expect(value(recognizeSchema(`import { extendSection, schemas, z } from '@anja.codes/vitakit'\nexport default extendSection(schemas.teaching, { a: z.number(), 'b-c': z.string() })\n`)))
      .toMatchObject({ kind: 'extendSection', fields: ['a', 'b-c'] })
    expect(value(recognizeSchema(`import { section as s, text } from '@anja.codes/vitakit'\nconst outreach = s({ title: text })\nexport default outreach\n`)))
      .toMatchObject({ kind: 'section', fields: ['title'] })
    expect(value(recognizeSchema(`import { section, text } from '@anja.codes/vitakit'\nexport default (section({ title: text }) as unknown)\n`)))
      .toMatchObject({ fields: ['title'] })
  })

  it.each([
    ['a schema built elsewhere', `import { schemas } from '@anja.codes/vitakit'\nexport default schemas.talks\n`],
    ['a spread', `import { section, text } from '@anja.codes/vitakit'\nconst base = { a: text }\nexport default section({ ...base, b: text })\n`],
    ['a function of another package', `import { section } from 'elsewhere'\nexport default section({})\n`],
    ['a let binding', `import { section, text } from '@anja.codes/vitakit'\nlet s = section({ a: text })\nexport default s\n`],
    ['no default export', `export const schema = 1\n`],
    ['a syntax error', `export default section({`],
  ])('does not recognize %s', (_label, source) => {
    expect(recognizeSchema(source).ok).toBe(false)
  })
})

describe('adding a field', () => {
  it('keeps comments, blank lines and quotes exactly as written', () => {
    const source = [
      `import { dateRange, linked, section, text, z } from '@anja.codes/vitakit'`,
      ``,
      `export default section({`,
      `  date: dateRange,`,
      `  title: text, // the grant's title`,
      `  funder: linked,`,
      `  'institution-url': text.optional(),`,
      ``,
      `  // money`,
      `  amount: z.number(), /* in euros */`,
      `})`,
      ``,
    ].join('\n')
    expect(value(addSchemaField(source, 'students', 'z.number().optional()'))).toBe(source.replace(
      '  amount: z.number(), /* in euros */\n',
      '  amount: z.number(), /* in euros */\n  students: z.number().optional(),\n',
    ))
  })

  it('adds a comma when the last field has none, and none after the new one', () => {
    const source = `export default extendSection(schemas.teaching, {\n    a: z.number() // note\n})\n`
    const prelude = `import { extendSection, schemas, z } from '@anja.codes/vitakit'\n`
    expect(value(addSchemaField(prelude + source, 'b', 'z.string()')))
      .toBe(`${prelude}export default extendSection(schemas.teaching, {\n    a: z.number(), // note\n    b: z.string()\n})\n`)
  })

  it('adds to single-line and empty objects', () => {
    const prelude = `import { extendSection, schemas, section, text, z } from '@anja.codes/vitakit'\n`
    expect(value(addSchemaField(`${prelude}export default section({ a: text })\n`, 'b', 'text')))
      .toBe(`${prelude}export default section({ a: text, b: text })\n`)
    expect(value(addSchemaField(`${prelude}export default extendSection(schemas.talks, {})\n`, 'b', 'text')))
      .toBe(`${prelude}export default extendSection(schemas.talks, {\n  b: text,\n})\n`)
    expect(value(addSchemaField(`${prelude}export default extendSection(schemas.talks, {\n  // your fields\n})\n`, 'b', 'text')))
      .toBe(`${prelude}export default extendSection(schemas.talks, {\n  // your fields\n  b: text,\n})\n`)
  })

  it('quotes keys that are not identifiers and refuses duplicates', () => {
    const source = `import { section, text } from '@anja.codes/vitakit'\nexport default section({\n  a: text,\n})\n`
    expect(value(addSchemaField(source, 'research-stay', 'text'))).toContain(`  'research-stay': text,\n})`)
    expect(addSchemaField(source, 'a', 'text')).toEqual({ ok: false, reason: 'it already has a field "a"' })
    expect(propertyKey("it's")).toBe(`'it\\'s'`)
  })

  it('produces a module that still parses and is recognized with the new field', () => {
    const source = `import { section, text } from '@anja.codes/vitakit'\n\nexport default section({\n\ttitle: text,\n})\n`
    const result = value(addSchemaField(source, 'note', 'text.optional()'))
    expect(result).toContain('\ttitle: text,\n\tnote: text.optional(),\n})')
    expect(value(recognizeSchema(result)).fields).toEqual(['title', 'note'])
  })
})

describe('imports', () => {
  it('adds missing names to the existing import', () => {
    const source = `import { section, text } from '@anja.codes/vitakit'\nexport default section({})\n`
    expect(value(ensurePackageImports(source, ['text', 'z']))).toBe(source.replace('section, text }', 'section, text, z }'))
    expect(value(ensurePackageImports(source, ['text']))).toBe(source)
  })

  it('adds an import line after the last import when there is none from the package', () => {
    const source = `import { foo } from './foo'\n\nexport default foo\n`
    expect(value(ensurePackageImports(source, ['z']))).toBe(`import { foo } from './foo'\nimport { z } from '@anja.codes/vitakit'\n\nexport default foo\n`)
  })
})

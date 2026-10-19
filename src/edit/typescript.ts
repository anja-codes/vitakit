/**
 * Recognize and edit `schemas/<name>.ts` without reformatting it.
 *
 * The parser only *locates*: the default export's `section({...})` or
 * `extendSection(base, {...})`, directly or through a `const`. Edits are text
 * inserted at those positions, so comments, blank lines, quotes and
 * indentation stay exactly as the user wrote them. (A reprinting library
 * such as magicast/recast moves trailing comments and re-indents the object
 * it touched, which is what this module exists to avoid.)
 *
 * Anything else -- a spread, a schema built in a helper function, a
 * namespace import -- is not recognized, and callers print a snippet instead.
 */
import { parse } from '@babel/parser'
import type {
  CallExpression,
  Expression,
  ImportDeclaration,
  ObjectExpression,
  Statement,
} from '@babel/types'

const PACKAGE = '@anja.codes/vitakit'

/** A schema module the CLI can add fields to. */
export interface SchemaModule {
  kind: 'section' | 'extendSection'
  /** Field names already present, in source order. */
  fields: string[]
  /** Offsets of the object literal holding the fields: `{` and one past `}`. */
  start: number
  end: number
  /** Offsets of each field, in source order. */
  properties: { start: number, end: number }[]
}

export type Recognized<T> = { ok: true, value: T } | { ok: false, reason: string }

function parseModule(source: string) {
  return parse(source, { sourceType: 'module', plugins: ['typescript'] }).program
}

/** Strip `as`, `satisfies` and parentheses around an expression. */
function unwrap(expression: Expression): Expression {
  let current = expression
  while (current.type === 'TSAsExpression' || current.type === 'TSSatisfiesExpression'
    || current.type === 'ParenthesizedExpression' || current.type === 'TSNonNullExpression') {
    current = current.expression
  }
  return current
}

/** Local names of the package's imports: `{ localName: importedName }`. */
function packageImports(body: Statement[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const statement of body) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== PACKAGE) continue
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier') continue
      const imported = specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value
      names.set(specifier.local.name, imported)
    }
  }
  return names
}

/** The expression a default export stands for, following one `const`. */
function defaultExport(body: Statement[]): Expression | undefined {
  const exported = body.find(statement => statement.type === 'ExportDefaultDeclaration')
  if (!exported || exported.type !== 'ExportDefaultDeclaration') return undefined
  const declaration = exported.declaration
  if (declaration.type === 'Identifier') {
    for (const statement of body) {
      if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue
      for (const declarator of statement.declarations) {
        if (declarator.id.type === 'Identifier' && declarator.id.name === declaration.name && declarator.init) {
          return unwrap(declarator.init)
        }
      }
    }
    return undefined
  }
  if (declaration.type.endsWith('Declaration')) return undefined
  return unwrap(declaration as Expression)
}

function keyName(property: ObjectExpression['properties'][number]): string | undefined {
  if (property.type !== 'ObjectProperty' || property.computed) return undefined
  if (property.key.type === 'Identifier') return property.key.name
  if (property.key.type === 'StringLiteral') return property.key.value
  return undefined
}

/** Find the object literal that holds a schema module's fields. */
export function recognizeSchema(source: string): Recognized<SchemaModule> {
  let body: Statement[]
  try {
    body = parseModule(source).body
  } catch (error) {
    return { ok: false, reason: `cannot be parsed: ${error instanceof Error ? error.message : String(error)}` }
  }

  const expression = defaultExport(body)
  if (!expression || expression.type !== 'CallExpression' || expression.callee.type !== 'Identifier') {
    return { ok: false, reason: 'its default export is not a section(...) or extendSection(...) call' }
  }
  const call = expression as CallExpression & { callee: { name: string } }
  const kind = packageImports(body).get(call.callee.name)
  const object = kind === 'section' ? call.arguments[0] : kind === 'extendSection' ? call.arguments[1] : undefined
  const expected = kind === 'section' ? 1 : 2
  if ((kind !== 'section' && kind !== 'extendSection') || call.arguments.length !== expected
    || !object || object.type !== 'ObjectExpression') {
    return { ok: false, reason: `its default export is not section({ ... }) or extendSection(base, { ... }) from ${PACKAGE}` }
  }

  const fields: string[] = []
  for (const property of object.properties) {
    const name = keyName(property)
    if (name === undefined) return { ok: false, reason: 'its fields contain a spread or a computed key' }
    fields.push(name)
  }
  return {
    ok: true,
    value: {
      kind,
      fields,
      start: object.start!,
      end: object.end!,
      properties: object.properties.map(property => ({ start: property.start!, end: property.end! })),
    },
  }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** A field name as an object key: bare when possible, quoted otherwise. */
export function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function lineStart(source: string, offset: number): number {
  return source.lastIndexOf('\n', offset - 1) + 1
}

function indentationAt(source: string, offset: number): string {
  return /^[ \t]*/.exec(source.slice(lineStart(source, offset)))![0]
}

/** Past spaces, then a `//` or `/* *\/` comment on the same line. */
function endOfLineContent(source: string, offset: number): number {
  let position = offset
  for (;;) {
    while (source[position] === ' ' || source[position] === '\t') position++
    if (source.startsWith('//', position)) {
      const end = source.indexOf('\n', position)
      return end === -1 ? source.length : end
    }
    if (source.startsWith('/*', position)) {
      const end = source.indexOf('*/', position + 2)
      if (end === -1 || source.slice(position, end).includes('\n')) return position
      position = end + 2
      continue
    }
    return position
  }
}

/**
 * Add one field to a recognized schema module. `code` is the value expression,
 * e.g. `z.number().optional()`. Returns the new source text.
 */
export function addSchemaField(source: string, name: string, code: string): Recognized<string> {
  const recognized = recognizeSchema(source)
  if (!recognized.ok) return recognized
  const { fields, properties, start: open, end } = recognized.value
  if (fields.includes(name)) return { ok: false, reason: `it already has a field "${name}"` }

  const entry = `${propertyKey(name)}: ${code}`
  const close = end - 1

  if (!properties.length) {
    const inner = source.slice(open + 1, close)
    // `{}` or `{ }`: becomes a multi-line object, indented from its line.
    if (!inner.includes('\n')) {
      const indent = indentationAt(source, open)
      return { ok: true, value: `${source.slice(0, open)}{\n${indent}  ${entry},\n${indent}}${source.slice(close + 1)}` }
    }
    // Only whitespace and comments inside: add before the closing brace's line.
    const closeLine = lineStart(source, close)
    const indent = `${indentationAt(source, close)}  `
    if (source.slice(closeLine, close).trim() !== '') {
      return { ok: true, value: `${source.slice(0, close)}\n${indent}${entry},\n${source.slice(close)}` }
    }
    return { ok: true, value: `${source.slice(0, closeLine)}${indent}${entry},\n${source.slice(closeLine)}` }
  }

  const first = properties[0]!
  const last = properties[properties.length - 1]!
  const multiline = source.slice(open, close).includes('\n')
    && source.slice(lineStart(source, first.start), first.start).trim() === ''

  let afterLast = last.end
  while (source[afterLast] === ' ' || source[afterLast] === '\t') afterLast++
  const comma = source[afterLast] === ','

  if (!multiline) {
    // `{ a: x }` or `{ a: x, }`: add inline, keeping a trailing comma where it is.
    return { ok: true, value: `${source.slice(0, last.end)}, ${entry}${source.slice(last.end)}` }
  }

  const indent = indentationAt(source, first.start)
  const insertAt = endOfLineContent(source, comma ? afterLast + 1 : last.end)
  const head = comma ? source.slice(0, insertAt) : `${source.slice(0, last.end)},${source.slice(last.end, insertAt)}`
  return { ok: true, value: `${head}\n${indent}${entry}${comma ? ',' : ''}${source.slice(insertAt)}` }
}

/**
 * Make sure `names` are imported from the package. Adds them to an existing
 * named import, or adds an import after the last one. Returns the new source.
 */
export function ensurePackageImports(source: string, names: string[]): Recognized<string> {
  let body: Statement[]
  try {
    body = parseModule(source).body
  } catch (error) {
    return { ok: false, reason: `cannot be parsed: ${error instanceof Error ? error.message : String(error)}` }
  }
  const imported = packageImports(body)
  const local = new Set(imported.keys())
  const missing = names.filter(name => !local.has(name))
  if (!missing.length) return { ok: true, value: source }

  const declaration = body.find((statement): statement is ImportDeclaration =>
    statement.type === 'ImportDeclaration' && statement.source.value === PACKAGE
    && statement.importKind !== 'type'
    && statement.specifiers.some(specifier => specifier.type === 'ImportSpecifier'))
  if (declaration) {
    const specifiers = declaration.specifiers.filter(specifier => specifier.type === 'ImportSpecifier')
    const at = specifiers[specifiers.length - 1]!.end!
    return { ok: true, value: `${source.slice(0, at)}, ${missing.join(', ')}${source.slice(at)}` }
  }

  const imports = body.filter(statement => statement.type === 'ImportDeclaration')
  const line = `import { ${missing.join(', ')} } from '${PACKAGE}'\n`
  if (!imports.length) return { ok: true, value: line + source }
  const at = imports[imports.length - 1]!.end!
  const end = source.indexOf('\n', at)
  const position = end === -1 ? source.length : end + 1
  return { ok: true, value: `${source.slice(0, position)}${end === -1 ? '\n' : ''}${line}${source.slice(position)}` }
}

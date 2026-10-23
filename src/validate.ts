/**
 * Check a project's sources the way a build would, without building: content,
 * schemas, pages, PDF document settings, and every PDF template rendered in
 * memory. Collects every problem instead of stopping at the first.
 */
import { isAbsolute, join, relative, sep } from 'node:path'
import { parseExpression } from '@babel/parser'
import { loadContent } from './content'
import { inventory, type Inventory, type Problem } from './inventory'
import { messageOf, whereOf } from './issues'
import { assertTemplatesAreUsed, renderPublications, renderSection } from './tex/emit'

export interface ValidationProblem extends Problem {
  /** The section it concerns, when it concerns one. */
  section?: string
}

export interface ValidationResult {
  problems: ValidationProblem[]
  inventory: Inventory
}

/** Top-level keys of a literal object expression, or `undefined`. */
function literalKeys(expression: string): string[] | undefined {
  try {
    const node = parseExpression(expression, { plugins: ['typescript'] })
    if (node.type !== 'ObjectExpression') return undefined
    const keys: string[] = []
    for (const property of node.properties) {
      if (property.type !== 'ObjectProperty' || property.computed) return undefined
      if (property.key.type === 'Identifier') keys.push(property.key.name)
      else if (property.key.type === 'StringLiteral') keys.push(property.key.value)
      else return undefined
    }
    return keys
  } catch {
    return undefined
  }
}

export async function validateProject(rootDir: string, { sections: only }: { sections?: string[] } = {}): Promise<ValidationResult> {
  const inv = await inventory(rootDir)
  const problems: ValidationProblem[] = []
  const seen = new Set<string>()
  const add = (problem: ValidationProblem) => {
    const key = `${problem.where}\n${problem.message}`
    if (seen.has(key)) return
    seen.add(key)
    problems.push(problem)
  }
  const local = (where: string) => isAbsolute(where) ? relative(rootDir, where) : where

  for (const problem of inv.problems) {
    const section = inv.sections.find(candidate => candidate.problems.includes(problem))
    add({ ...problem, ...(section ? { section: section.id } : {}) })
  }

  const valid = new Map(inv.sections.filter(section => !section.problems.length).map(section => [section.id, section]))
  const known = new Set(inv.sections.map(section => section.id))

  // Website: sections that do not exist, and `where` fields they do not have.
  for (const placement of inv.web.placements) {
    const where = `${placement.file}:${placement.line}`
    if (!known.has(placement.section)) {
      add({ where, section: placement.section, message: `no section called "${placement.section}" (no content/${placement.section}.yml)` })
      continue
    }
    const fields = valid.get(placement.section)?.fields
    if (placement.where === undefined || !fields) continue
    const keys = literalKeys(placement.where)
    if (!keys) continue
    const names = new Set(['year', ...fields.map(field => field.path)])
    for (const key of keys.filter(key => !names.has(key))) {
      add({ where, section: placement.section, message: `where.${key}: ${placement.section} has no field "${key}"; its fields are ${[...names].join(', ')}` })
    }
  }

  // PDF: every included section rendered with its template, in memory.
  if (inv.documents.length) {
    const templateDir = join(rootDir, 'cv-tex', 'templates')
    try {
      await assertTemplatesAreUsed(templateDir, [...known])
    } catch (error) {
      add({ where: local(whereOf(error, 'cv-tex/templates/')), message: messageOf(error) })
    }

    const content = await loadContent(rootDir, { strict: false, maxVisibility: 'private', target: 'pdf' })
    for (const document of inv.documents) {
      for (const placement of document.placements) {
        try {
          if (valid.has(placement.section)) {
            await renderSection(placement.section, content.sections[placement.section] ?? [], document.options, templateDir)
          }
        } catch (error) {
          add({
            where: local(whereOf(error, `cv-tex/templates/${placement.section}.eta`)),
            section: placement.section,
            message: `${messageOf(error)} (in ${document.tex})`,
          })
        }
      }
      for (const placement of document.publications) {
        const list = content.publications[placement.list]
        if (!list) continue
        try {
          await renderPublications(list, templateDir, content.profile.url)
        } catch (error) {
          add({ where: local(whereOf(error, 'cv-tex/templates/publications.eta')), message: `${messageOf(error)} (in ${document.tex})` })
        }
      }
    }
  }

  // Messages from templates name them by absolute path.
  const { realpath } = await import('node:fs/promises')
  const roots = [...new Set([rootDir, await realpath(rootDir).catch(() => rootDir)])]
  for (const problem of problems) {
    for (const root of roots) problem.message = problem.message.replaceAll(`${root}${sep}`, '')
    problem.message = problem.message.replace(/^(template [\w-]+\.eta: )cv-tex\/templates\/[\w-]+\.eta: /, '$1')
  }

  const relevant = only?.length
    ? problems.filter(problem => (problem.section !== undefined && only.includes(problem.section))
      || problem.where === 'content/profile.yml')
    : problems
  return { problems: relevant, inventory: inv }
}

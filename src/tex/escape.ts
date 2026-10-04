/**
 * LaTeX escaping.
 *
 * This is the single most error-prone part of generating `.tex` from data, so
 * it is centralised, tested, and applied by every helper a template can call
 * (see `emit.ts`).
 *
 * Content fields may contain inline mathematics (`$k$-ary`), which must survive
 * unescaped while the surrounding prose is escaped.
 */

/** Characters that cannot appear literally in LaTeX text mode. */
const REPLACEMENTS: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '&': '\\&',
  '%': '\\%',
  $: '\\$',
  '#': '\\#',
  _: '\\_',
  '{': '\\{',
  '}': '\\}',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
}

/**
 * Typographic replacements applied after escaping.
 *
 * These map characters the user actually wrote to their LaTeX spelling. There
 * is deliberately *no* inference: a rule turning `2019-2023` into `2019--2023`
 * also turns `2024-03-15` into `2024--03--15` and mangles grant numbers, so
 * date ranges are formatted by `formatDateRange` instead, which emits a real
 * en dash that the rule below then converts.
 */
const TYPOGRAPHY: [RegExp, string][] = [
  // Directional quotes: "..." -> ``...''
  [/"([^"]*)"/g, '``$1\'\''],
  // An en dash written literally
  [/\u2013/g, '--'],
  [/\u2014/g, '---'],
  [/\u2026/g, '\\ldots{}'],
  [/\u00a0/g, '~'],
]

export interface EscapeOptions {
  typography?: boolean
  /**
   * Original field value, set by `escapeRichTex`. A `$` reaching this function
   * from rich text means a formula was never closed, which would otherwise
   * produce silently wrong output.
   */
  source?: string
}

/** Escape a string for LaTeX text mode, without touching mathematics. */
export function escapeTex(value: string, { typography = true, source }: EscapeOptions = {}): string {
  if (source !== undefined && /(?<!\\)\$/.test(value)) {
    throw new Error(`unbalanced math delimiters in: ${source}`)
  }
  let result = value.replace(/[\\&%$#_{}~^]/g, character => REPLACEMENTS[character]!)
  if (typography) {
    for (const [pattern, replacement] of TYPOGRAPHY) result = result.replace(pattern, replacement)
  }
  return result
}

/**
 * Escape prose while preserving `$...$` and `$$...$$` spans verbatim.
 *
 * Used for `richText` fields, where a mathematician writes `Random $k$-ary
 * trees` and expects the formula to reach LaTeX untouched.
 */
export function escapeRichTex(value: string): string {
  const parts: string[] = []
  const pattern = /\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\\])*\$/g
  let index = 0

  for (const match of value.matchAll(pattern)) {
    const start = match.index!
    parts.push(escapeTex(value.slice(index, start), { source: value }))
    // Mathematics is already LaTeX; pass it through unchanged.
    parts.push(match[0])
    index = start + match[0].length
  }
  parts.push(escapeTex(value.slice(index), { source: value }))

  return parts.join('')
}

/**
 * Make a URL safe as the first argument of `\href`, inside the argument of
 * another macro such as `\vitaentry`.
 *
 * `&`, `#` and `%` mean something in a URL, so they must not be
 * percent-encoded: `?a=1%26b=2` is one parameter, not two, and `%23` is part
 * of the path, not an anchor. hyperref turns `\&`, `\#` and `\%` back into the
 * plain character in the link target, so those are backslash-escaped; `%` also
 * when it is already part of an escape such as `%20`, because a bare `%` starts
 * a comment. Characters that cannot appear in a valid URL anyway (`\ { } ^`,
 * space) are percent-encoded. `~` passes through unchanged.
 */
const URL_SPECIAL = /%[0-9A-Fa-f]{2}|[%\\{}^ #&]/g

export function escapeUrl(value: string): string {
  return value.replace(URL_SPECIAL, (match) => {
    if (match.length === 3 || match === '#' || match === '&') return `\\${match}`
    return `\\%${match.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`
  })
}

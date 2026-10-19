/** LaTeX escaping: text, rich text and URLs. */
import { describe, expect, it } from 'vitest'
import { escapeRichTex, escapeTex, escapeUrl } from '../src/tex/escape'
import { createRenderer } from '../src/render'

describe('escapeTex', () => {
  it('escapes every character special in text mode', () => {
    expect(escapeTex('\\ & % $ # _ { } ~ ^')).toBe(
      '\\textbackslash{} \\& \\% \\$ \\# \\_ \\{ \\} \\textasciitilde{} \\textasciicircum{}',
    )
  })

  it('does not re-escape the output of an earlier replacement', () => {
    expect(escapeTex('\\&')).toBe('\\textbackslash{}\\&')
  })

  it('converts the typography the user actually wrote', () => {
    expect(escapeTex('He said "hello"')).toBe('He said ``hello\'\'')
    expect(escapeTex('a\u2013b\u2014c\u2026\u00a0d')).toBe('a--b---c\\ldots{}~d')
  })

  it('never turns a hyphen into a dash: dates and grant numbers must survive', () => {
    for (const value of ['2024-03-15', 'FWF P 12345-N35', 'pages 201-240', 'well-known']) {
      expect(escapeTex(value)).toBe(value)
    }
  })

  it('can leave typography alone', () => {
    expect(escapeTex('"a"\u2013b', { typography: false })).toBe('"a"\u2013b')
  })
})

describe('escapeRichTex', () => {
  it('escapes prose and passes inline and display mathematics through', () => {
    expect(escapeRichTex('$a_1$ & $$\\sum_{i=1}^n i$$ 100%')).toBe('$a_1$ \\& $$\\sum_{i=1}^n i$$ 100\\%')
  })

  it('rejects an unclosed formula instead of emitting broken TeX', () => {
    expect(() => escapeRichTex('unbalanced $k')).toThrow('unbalanced math delimiters in: unbalanced $k')
  })

  // BUG: `\$` is how a rich field writes a literal dollar (a bare `$` opens a
  // formula). The website shows "costs $5"; the PDF prints "costs \$5", with
  // the backslash, because the backslash is escaped as text.
  it.fails('prints an escaped dollar as a dollar, as the website does', () => {
    expect(createRenderer().inline('costs \\$5')).toBe('costs $5')
    expect(escapeRichTex('costs \\$5')).toBe('costs \\$5')
  })
})

describe('escapeUrl', () => {
  it('keeps ordinary URL characters, including ~ and _', () => {
    const url = 'https://doi.org/10.1000/a_b-c~d?e=1;f=2+3'
    expect(escapeUrl(url)).toBe(url)
  })

  it('backslash-escapes & # and %XX, which hyperref turns back into themselves', () => {
    // Percent-encoding these would change the link: %26 merges two query
    // parameters, %23 turns an anchor into part of the path.
    expect(escapeUrl('https://x.org/a%20b?c=1&d=2#e')).toBe('https://x.org/a\\%20b?c=1\\&d=2\\#e')
  })

  it('percent-encodes characters that cannot appear in a URL, and a lone %', () => {
    expect(escapeUrl('https://x.org/{a} b\\c^d/100%')).toBe('https://x.org/\\%7Ba\\%7D\\%20b\\%5Cc\\%5Ed/100\\%25')
  })
})

import { describe, expect, it } from 'vitest'
import { escapeRichTex, escapeTex, escapeUrl } from '../src/tex/escape'

describe('escapeTex', () => {
  it('escapes every special character', () => {
    expect(escapeTex('100% of {a & b}')).toBe('100\\% of \\{a \\& b\\}')
    expect(escapeTex('a_b^c')).toBe('a\\_b\\textasciicircum{}c')
    expect(escapeTex('C:\\path')).toBe('C:\\textbackslash{}path')
    expect(escapeTex('#1 ~ $5')).toBe('\\#1 \\textasciitilde{} \\$5')
  })

  it('does not double-escape its own output', () => {
    // The backslash replacement must not be re-processed by later rules.
    expect(escapeTex('\\&')).toBe('\\textbackslash{}\\&')
  })

  it('applies typographic conventions', () => {
    expect(escapeTex('He said "hello"')).toBe("He said ``hello''")
    expect(escapeTex('a\u2013b')).toBe('a--b')
    expect(escapeTex('a\u2014b')).toBe('a---b')
  })

  it('never guesses at hyphens', () => {
    // A date-range rule would corrupt all of these.
    expect(escapeTex('Talk on 2024-03-15')).toBe('Talk on 2024-03-15')
    expect(escapeTex('grant P 12345-N25')).toBe('grant P 12345-N25')
    expect(escapeTex('well-known')).toBe('well-known')
    // Ranges reach LaTeX as an en dash, from formatDateRange.
    expect(escapeTex('2019\u20132023')).toBe('2019--2023')
  })

  it('can be told to leave typography alone', () => {
    expect(escapeTex('a\u2013b', { typography: false })).toBe('a\u2013b')
  })
})

describe('escapeRichTex', () => {
  it('escapes prose but preserves mathematics', () => {
    expect(escapeRichTex('Random $k$-ary trees & more'))
      .toBe('Random $k$-ary trees \\& more')
  })

  it('handles several formulas and display math', () => {
    expect(escapeRichTex('$a_1$ and $b^2$')).toBe('$a_1$ and $b^2$')
    expect(escapeRichTex('see $$\\sum_{i=1}^n i$$ here')).toBe('see $$\\sum_{i=1}^n i$$ here')
  })

  it('does not treat an escaped dollar as math', () => {
    expect(escapeRichTex('costs \\$5')).toBe('costs \\textbackslash{}\\$5')
  })

  it('rejects unbalanced delimiters instead of emitting broken TeX', () => {
    expect(() => escapeRichTex('unbalanced $k')).toThrow(/unbalanced math/)
  })
})

describe('escapeUrl', () => {
  it('keeps ordinary URL characters intact', () => {
    expect(escapeUrl('https://doi.org/10.1000/a_b')).toBe('https://doi.org/10.1000/a_b')
    expect(escapeUrl('https://e.org/a?b=1;c=2+3')).toBe('https://e.org/a?b=1;c=2+3')
  })

  it('backslash-escapes the characters that mean something in a URL', () => {
    // Percent-encoding these would change the link: %26 merges two query
    // parameters, %23 turns an anchor into part of the path. hyperref turns
    // \& \# \% back into the plain character in the link target.
    expect(escapeUrl('https://x.org/a?b=1&c=2')).toBe('https://x.org/a?b=1\\&c=2')
    expect(escapeUrl('https://x.org/a#b')).toBe('https://x.org/a\\#b')
  })

  it('percent-encodes characters that cannot appear in a valid URL', () => {
    // The % itself is escaped: a bare one would start a LaTeX comment.
    expect(escapeUrl('https://x.org/{a}')).toBe('https://x.org/\\%7Ba\\%7D')
    expect(escapeUrl('https://x.org/a b')).toBe('https://x.org/a\\%20b')
    expect(escapeUrl('https://x.org/a\\b^c')).toBe('https://x.org/a\\%5Cb\\%5Ec')
  })

  it('leaves a tilde alone', () => {
    expect(escapeUrl('https://x.org/~user')).toBe('https://x.org/~user')
  })

  it('does not double-encode an already-encoded URL', () => {
    // A bare % would start a LaTeX comment, so even a valid escape needs \%.
    expect(escapeUrl('https://e.org/a%20b')).toBe('https://e.org/a\\%20b')
    // A lone percent is not an escape and must be encoded.
    expect(escapeUrl('https://e.org/100%done')).toBe('https://e.org/100\\%25done')
  })
})

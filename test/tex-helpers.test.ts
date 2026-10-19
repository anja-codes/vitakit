import { describe, expect, it } from 'vitest'
import { Eta } from 'eta'
import { dateRange } from '../src/primitives'
import { createTemplateHelpers } from '../src/tex/helpers'

const h = createTemplateHelpers('cv-tex/templates/teaching.eta', 'content/teaching.yml')
const rich = (text: string) => ({ text, html: '<span>rendered on the website</span>' })

describe('text', () => {
  it('escapes literal strings, including currency, without interpreting them as math', () => {
    expect(String(h.text('R&D: $500, 50% #1_a'))).toBe('R\\&D: \\$500, 50\\% \\#1\\_a')
    expect(String(h.text('$k$'))).toBe('\\$k\\$')
  })

  it('reads normalized text fields and preserves their mathematics', () => {
    expect(String(h.text(rich('Random $k$-ary trees & more')))).toBe('Random $k$-ary trees \\& more')
    // Markdown conversion is not part of this helper rework.
    expect(String(h.text(rich('**bold**')))).toBe('**bold**')
  })

  it.each([undefined, null, ''])('returns an actually falsy value for missing input %j', (value) => {
    expect(h.text(value)).toBe('')
    expect(h.text(value) || h.date(dateRange.parse(2025))).toEqual(h.date(dateRange.parse(2025)))
  })

  it.each([0, false, 4.8])('keeps the value %j', (value) => {
    expect(String(h.text(value))).toBe(String(value))
  })

  it('does not escape its own output a second time', () => {
    const value = h.text('A & B')
    expect(h.text(value)).toBe(value)
    expect(String(h.text(value))).toBe('A \\& B')
  })

  it('reports unsupported structures instead of emitting [object Object]', () => {
    expect(() => h.text({ from: 2025 })).toThrow(/teaching\.eta: text expects.*date/)
    expect(() => h.text(['A', 'B'])).toThrow(/text expects/)
  })

  it('names the template on malformed mathematics', () => {
    expect(() => h.text(rich('broken $k'))).toThrow(/teaching\.eta: unbalanced math/)
  })
})

describe('linked and url', () => {
  it('renders institution and link shapes through the same operation', () => {
    const expected = '\\href{https://example.org/?a=1\\&b=2}{A \\& B}'
    expect(String(h.linked({ name: 'A & B', url: 'https://example.org/?a=1&b=2' }))).toBe(expected)
    expect(String(h.linked({ label: 'A & B', url: 'https://example.org/?a=1&b=2' }))).toBe(expected)
    expect(String(h.linked('A & B', 'https://example.org/?a=1&b=2'))).toBe(expected)
  })

  it('supports rich labels and explicitly composed labels', () => {
    expect(String(h.linked(rich('$k$-ary trees'), 'https://example.org')))
      .toBe('\\href{https://example.org}{$k$-ary trees}')
    expect(String(h.linked(h.optional`\emph{${'A & B'}}`, 'https://example.org')))
      .toBe('\\href{https://example.org}{\\emph{A \\& B}}')
  })

  it('falls back to unlinked text and never infers a URL from a label string', () => {
    expect(String(h.linked({ name: 'A & B' }))).toBe('A \\& B')
    expect(String(h.linked({ label: 'A & B' }))).toBe('A \\& B')
    expect(String(h.linked('https://example.org'))).toBe('https://example.org')
    expect(h.linked(undefined)).toBe('')
    expect(h.linked({ name: '' })).toBe('')
  })

  it('rejects unsupported objects and non-string URL targets', () => {
    expect(() => h.linked({ title: 'A title' })).toThrow(/linked expects/)
    expect(() => h.linked('Label', { url: 'https://example.org' })).toThrow(/url expects/)
    expect(() => h.url(123)).toThrow(/url expects/)
  })

  it('keeps URL-target escaping distinct from visible-text escaping', () => {
    expect(String(h.url('https://example.org/a_b?x=1&y=2#part')))
      .toBe('https://example.org/a_b?x=1\\&y=2\\#part')
    expect(h.url(null)).toBe('')
    expect(h.url('')).toBe('')
  })

  it('retains actionable diagnostics for unresolved paths on the website', () => {
    expect(() => h.url('/slides/talk.pdf')).toThrow(/content\/teaching\.yml:.*content\/profile\.yml/)
    expect(() => h.linked({ name: 'Slides', url: '/slides/talk.pdf' })).toThrow(/content\/profile\.yml/)
  })
})

describe('date', () => {
  it('formats normalized points and ranges', () => {
    expect(String(h.date(dateRange.parse(2025)))).toBe('2025')
    expect(String(h.date(dateRange.parse({ from: 2020, to: 2025 })))).toBe('2020--2025')
    expect(String(h.date(dateRange.parse({ from: 2020, to: 'present' })))).toBe('2020--present')
    expect(h.date(undefined)).toBe('')
  })

  it('explains how to fix an unnormalized date', () => {
    expect(() => h.date('2025')).toThrow(/dateRange.*schema/)
  })
})

describe('join', () => {
  it('skips absent values, not zero or false', () => {
    expect(String(h.join([undefined, null, '', 0, false, 'A & B']))).toBe('0, false, A \\& B')
    expect(h.join([])).toBe('')
    expect(h.join([undefined, ''])).toBe('')
  })

  it('preserves formatted pieces and escapes literal separators', () => {
    expect(String(h.join([h.text('A & B'), h.linked('C', 'https://example.org')], ' & ')))
      .toBe('A \\& B \\& \\href{https://example.org}{C}')
    expect(String(h.join(['P', 123], h.optional`~`))).toBe('P~123')
  })

  it('requires an array rather than accidentally joining characters', () => {
    expect(() => h.join('abc' as never)).toThrow(/join expects an array/)
  })
})

describe('optional fragments', () => {
  it('preserves raw LaTeX backslashes while escaping interpolated data', () => {
    expect(String(h.optional`\textbf{${'A & B'}}`)).toBe('\\textbf{A \\& B}')
    expect(String(h.optional`\vitanote{${'100% #1'}}`)).toBe('\\vitanote{100\\% \\#1}')
    expect(String(h.optional`\emph{A fixed label}`)).toBe('\\emph{A fixed label}')
  })

  it.each([undefined, null, '', h.text(undefined)])('omits the whole fragment for missing input %j', (value) => {
    expect(h.optional`Evaluation: ${value}/5`).toBe('')
    expect(h.optional`Known ${'A'}, missing ${value}.`).toBe('')
  })

  it('retains zero and false, and accepts other formatted helpers', () => {
    expect(String(h.optional`Score ${0}; flag ${false}`)).toBe('Score 0; flag false')
    expect(String(h.optional`At ${h.linked('A & B', 'https://example.org')}`))
      .toBe('At \\href{https://example.org}{A \\& B}')
    expect(String(h.optional`\href{${h.url('https://example.org/a_b')}}{${'A & B'}}`))
      .toBe('\\href{https://example.org/a_b}{A \\& B}')
  })

  it('requires a tag, not an already interpolated string', () => {
    expect(() => h.optional('Evaluation: undefined/5' as never)).toThrow(/tagged template/)
  })
})

describe('vita macros', () => {
  it('renders field notes and tagged notes with the same escaping and omission rules', () => {
    expect(String(h.vita.note('A & B'))).toBe('\\vitanote{A \\& B}')
    expect(String(h.vita.note(rich('$k$-ary trees')))).toBe('\\vitanote{$k$-ary trees}')
    expect(String(h.vita.note`Evaluation: ${0}/5`)).toBe('\\vitanote{Evaluation: 0/5}')
    expect(String(h.vita.note(false))).toBe('\\vitanote{false}')
    expect(h.vita.note(undefined)).toBe('')
    expect(h.vita.note`Evaluation: ${undefined}/5`).toBe('')
    expect(h.vita.note`A ${'known'} and ${null}`).toBe('')
  })

  it('composes independent optional clauses without dropping the main note', () => {
    expect(String(h.vita.note(h.join([
      h.optional`\emph{${'A & B'}}`,
      h.optional`, supervised by ${undefined}`,
    ], '')))).toBe('\\vitanote{\\emph{A \\& B}}')
  })

  it('does not suppress an entry with missing date or context', () => {
    expect(String(h.vita.entry({ title: 'A & B' }))).toBe('\\vitaentry{}{A \\& B}{}')
    expect(String(h.vita.entry({ title: undefined }))).toBe('\\vitaentry{}{}{}')
    expect(String(h.vita.entry({ title: 0, context: false }))).toBe('\\vitaentry{}{0}{false}')
  })

  it('preserves formatted entry slots without escaping them twice', () => {
    expect(String(h.vita.entry({
      date: h.date(dateRange.parse({ from: 2020, to: 2025 })),
      title: rich('Random $k$-ary trees'),
      context: h.linked({ name: 'A & B', url: 'https://example.org' }),
    }))).toBe('\\vitaentry{2020--2025}{Random $k$-ary trees}{\\href{https://example.org}{A \\& B}}')
  })

  it('reports missing or misspelled entry slots', () => {
    expect(() => h.vita.entry({} as never)).toThrow(/vita.entry expects/)
    expect(() => h.vita.entry({ title: 'A', contex: 'B' } as never)).toThrow(/vita.entry expects/)
  })
})

describe('Eta integration', () => {
  it('stringifies fragments, invokes tags, and supports empty-output fallbacks', () => {
    const eta = new Eta({ autoEscape: false })
    const template = [
      '<%~ it.vita.entry({ date: it.text(undefined) || it.date(it.when), title: it.title }) %>',
      '<%~ it.vita.note`Evaluation: ${it.score}/5` %>',
      '<%~ it.vita.note`Absent: ${it.absent}` %>',
      '<%~ it.optional`\\textbf{${it.label}}` %>',
    ].join('\n')
    const result = eta.renderString(template, { ...h, when: dateRange.parse(2025), title: rich('$k$-ary trees'), score: 0, label: 'A & B' })
    expect(result).toContain('\\vitaentry{2025}{$k$-ary trees}{}')
    expect(result).toContain('\\vitanote{Evaluation: 0/5}')
    expect(result).toContain('\\textbf{A \\& B}')
    expect(result).not.toContain('Absent:')
    expect(result).not.toContain('[object Object]')
  })

  it('does not expose the former domain-specific or duplicate helper names', () => {
    for (const name of ['tex', 'rich', 'inst', 'linkOrText', 'term', 'titleOf', 'secondaryOf', 'bibgroup']) {
      expect(h).not.toHaveProperty(name)
    }
  })
})

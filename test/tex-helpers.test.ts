/** The helpers Eta templates use to write LaTeX: `it.text`, `it.linked`, `it.vita.entry`, … */
import { describe, expect, it } from 'vitest'
import { Eta } from 'eta'
import { dateRange } from '../src/primitives'
import { createTemplateHelpers } from '../src/tex/helpers'

const h = createTemplateHelpers('cv-tex/templates/teaching.eta', 'content/teaching.yml')
const rich = (text: string) => ({ text, html: '<span>rendered on the website</span>' })
const tex = (value: unknown) => String(value)

describe('text', () => {
  it('escapes a plain string literally: $ is currency, not mathematics', () => {
    expect(tex(h.text('R&D: $500, 50% #1_a'))).toBe('R\\&D: \\$500, 50\\% \\#1\\_a')
  })

  it('keeps the mathematics of a rich-text field', () => {
    expect(tex(h.text(rich('Random $k$-ary trees & more')))).toBe('Random $k$-ary trees \\& more')
  })

  // Documented limitation (docs/content/field-types.md): only mathematics is
  // carried over; other Markdown reaches the PDF as written.
  it('prints other Markdown in a rich-text field as written', () => {
    expect(tex(h.text(rich('**bold**')))).toBe('**bold**')
  })

  it.each([0, false, 4.8])('prints %j', (value) => {
    expect(tex(h.text(value))).toBe(String(value))
  })

  it.each([undefined, null, ''])('is empty, and falsy, for %j', (value) => {
    expect(h.text(value)).toBe('')
  })

  it('does not escape its own output again', () => {
    expect(tex(h.text(h.text('A & B')))).toBe('A \\& B')
  })

  it('rejects structured values, naming the template', () => {
    expect(() => h.text({ from: 2025 })).toThrow(/^cv-tex\/templates\/teaching\.eta: text expects text or a number; use date\(\.\.\.\) or linked\(\.\.\.\)/)
    expect(() => h.text(['A', 'B'])).toThrow(/text expects/)
    expect(() => h.text(rich('broken $k'))).toThrow(/^cv-tex\/templates\/teaching\.eta: unbalanced math/)
  })
})

describe('linked', () => {
  it('links a linked value, or a label and a URL alike', () => {
    const expected = '\\href{https://example.org/?a=1\\&b=2}{A \\& B}'
    expect(tex(h.linked({ label: 'A & B', url: 'https://example.org/?a=1&b=2' }))).toBe(expected)
    expect(tex(h.linked('A & B', 'https://example.org/?a=1&b=2'))).toBe(expected)
  })

  it('accepts rich text and composed fragments as the label', () => {
    expect(tex(h.linked(rich('$k$-ary'), 'https://e.org'))).toBe('\\href{https://e.org}{$k$-ary}')
    expect(tex(h.linked(h.optional`\emph{${'A & B'}}`, 'https://e.org'))).toBe('\\href{https://e.org}{\\emph{A \\& B}}')
  })

  it('is plain text without a URL, and never takes a label for one', () => {
    expect(tex(h.linked({ label: 'A & B' }))).toBe('A \\& B')
    expect(tex(h.linked('https://example.org'))).toBe('https://example.org')
    expect(h.linked(undefined)).toBe('')
    expect(h.linked({ label: '' })).toBe('')
  })

  it('rejects other objects, a name that did not go through linked, and URLs that are not strings', () => {
    expect(() => h.linked({ title: 'A title' })).toThrow(/linked expects text or \{ label, url\? \}; use `linked` in the section schema/)
    expect(() => h.linked({ name: 'A & B' })).toThrow(/use `linked` in the section schema/)
    expect(() => h.linked('Label', { url: 'https://example.org' })).toThrow(/url expects a URL string/)
  })
})

describe('url', () => {
  it('escapes a link target, not visible text', () => {
    expect(tex(h.url('https://example.org/a_b?x=1&y=2#part'))).toBe('https://example.org/a_b?x=1\\&y=2\\#part')
    expect(h.url(undefined)).toBe('')
  })

  it('refuses a path on the site, naming the content file and what to add to the profile', () => {
    expect(() => h.url('/slides/talk.pdf')).toThrow(/^content\/teaching\.yml: \/slides\/talk\.pdf is a path on the website.*content\/profile\.yml/)
    expect(() => h.linked({ label: 'Slides', url: '/slides/talk.pdf' })).toThrow(/^content\/teaching\.yml: /)
  })
})

describe('date', () => {
  it('formats a normalised date with a LaTeX en dash', () => {
    expect(tex(h.date(dateRange.parse('2025-03')))).toBe('Mar 2025')
    expect(tex(h.date(dateRange.parse({ from: 2020, to: 2025 })))).toBe('2020--2025')
    expect(tex(h.date(dateRange.parse({ from: 2020, to: 'present' })))).toBe('2020--present')
    expect(h.date(undefined)).toBe('')
  })

  it('explains that the field needs dateRange in its schema', () => {
    expect(() => h.date('2025')).toThrow(/date expects a normalized date; use dateRange in the collection schema/)
  })
})

describe('join', () => {
  it('skips empty values but keeps zero and false', () => {
    expect(tex(h.join([undefined, null, '', 0, false, 'A & B']))).toBe('0, false, A \\& B')
    expect(h.join([undefined, ''])).toBe('')
  })

  it('escapes a text separator and keeps a fragment separator', () => {
    expect(tex(h.join(['A', h.linked('C', 'https://e.org')], ' & '))).toBe('A \\& \\href{https://e.org}{C}')
    expect(tex(h.join(['P', 123], h.optional`~`))).toBe('P~123')
  })

  it('requires an array', () => {
    expect(() => h.join('abc' as never)).toThrow(/join expects an array/)
  })
})

describe('optional', () => {
  it('keeps its literal LaTeX and escapes what is interpolated', () => {
    expect(tex(h.optional`\textbf{${'A & B'}} ${0} ${h.url('https://e.org/a_b')}`)).toBe('\\textbf{A \\& B} 0 https://e.org/a_b')
  })

  it.each([undefined, null, '', h.text(undefined), rich('')])('is empty as a whole when any value is %j', (value) => {
    expect(h.optional`Known ${'A'}, missing ${value}.`).toBe('')
  })

  it('must be used as a tagged template', () => {
    expect(() => h.optional('Evaluation: undefined/5' as never)).toThrow(/optional must be used as a tagged template/)
  })
})

describe('vita.note', () => {
  it('wraps a value or a tagged template, and is empty for absent input', () => {
    expect(tex(h.vita.note(rich('$k$ & more')))).toBe('\\vitanote{$k$ \\& more}')
    expect(tex(h.vita.note`Evaluation: ${0}/5`)).toBe('\\vitanote{Evaluation: 0/5}')
    expect(h.vita.note(undefined)).toBe('')
    expect(h.vita.note`Evaluation: ${undefined}/5`).toBe('')
  })

  it('keeps the main clause when an optional clause is missing', () => {
    expect(tex(h.vita.note(h.join([h.optional`\emph{${'A'}}`, h.optional`, supervised by ${undefined}`], ''))))
      .toBe('\\vitanote{\\emph{A}}')
  })
})

describe('vita.entry', () => {
  it('writes every slot, formatted ones as they are', () => {
    expect(tex(h.vita.entry({
      date: h.date(dateRange.parse({ from: 2020, to: 2025 })),
      title: rich('Random $k$-ary trees'),
      context: h.linked({ label: 'A & B', url: 'https://e.org' }),
    }))).toBe('\\vitaentry{2020--2025}{Random $k$-ary trees}{\\href{https://e.org}{A \\& B}}')
  })

  it('keeps the row when slots are empty', () => {
    expect(tex(h.vita.entry({ title: undefined }))).toBe('\\vitaentry{}{}{}')
  })

  it('rejects a missing title slot and misspelt slots', () => {
    expect(() => h.vita.entry({} as never)).toThrow(/vita\.entry expects \{ title, date\?, context\? \}/)
    expect(() => h.vita.entry({ title: 'A', contex: 'B' } as never)).toThrow(/vita\.entry expects/)
  })
})

it('works in an Eta template: fragments print, tags work, empty output falls through ||', () => {
  const template = [
    '<%~ it.vita.entry({ date: it.text(it.term) || it.date(it.when), title: it.title }) %>',
    '<%~ it.vita.note`Evaluation: ${it.score}/5` %>',
    '<%~ it.vita.note`Absent: ${it.absent}` %>',
  ].join('\n')
  expect(new Eta({ autoEscape: false, autoTrim: [false, false] }).renderString(template, { ...h, when: dateRange.parse(2025), title: rich('$k$'), score: 0 }))
    .toBe('\\vitaentry{2025}{$k$}{}\n\\vitanote{Evaluation: 0/5}\n')
})

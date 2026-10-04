/**
 * Rich-text fields are read in four places (the emitter, the static check, the
 * generic component, and the leak heuristic). They all use these two helpers,
 * so the shapes they tolerate are pinned here rather than in each consumer.
 */
import { describe, expect, it } from 'vitest'
import { richHtml, richSource } from '../src/shared/rich'
import { isRichMarker, MARKER_KEY, richMarker, renderRichFields } from '../src/rich'
import { richText } from '../src/primitives'
import { createRenderer } from '../src/render'

const renderer = createRenderer()

describe('richSource / richHtml', () => {
  const rendered = { text: 'Random $k$-ary trees', html: '<span class="katex"/>' }

  it('reads a rendered field', () => {
    expect(richSource(rendered)).toBe('Random $k$-ary trees')
    expect(richHtml(rendered)).toBe('<span class="katex"/>')
  })

  it('accepts a plain string, for schemas that used z.string()', () => {
    expect(richSource('Plain title')).toBe('Plain title')
    expect(richHtml('Plain title')).toBe('Plain title')
  })

  it('is total: anything unusable reads as empty, never as "[object Object]"', () => {
    for (const value of [undefined, null, 42, {}, { html: '<b/>' }, []]) {
      expect(richSource(value), JSON.stringify(value) ?? 'undefined').toBe('')
      expect(richHtml(value), JSON.stringify(value) ?? 'undefined').toBeUndefined()
    }
    expect(richHtml('')).toBeUndefined()
  })
})

describe('the marker', () => {
  it('is what the richText primitive produces', () => {
    const parsed = richText.parse('A $k$-ary title')
    expect(isRichMarker(parsed)).toBe(true)
    expect(parsed).toEqual(richMarker('A $k$-ary title'))
    expect(MARKER_KEY in parsed).toBe(true)
  })

  it('is never mistaken for a rendered field', () => {
    // A marker that reaches a consumer must not silently read as text; the
    // build-time check for MARKER_KEY in the output is the backstop.
    expect(richSource(richMarker('x'))).toBe('')
  })

  it('is replaced at any depth, and cannot survive rendering', () => {
    const value = {
      title: richMarker('$k$-ary'),
      list: [{ nested: richMarker('deep $x$') }],
      untouched: 'plain',
    }
    const result = renderRichFields(value, renderer, '', 'content/x.yml') as typeof value
    expect(JSON.stringify(result)).not.toContain(MARKER_KEY)
    expect(richHtml(result.title)).toContain('katex')
    expect(richSource(result.list[0]!.nested)).toBe('deep $x$')
    expect(result.untouched).toBe('plain')
  })

  it('reports the field that failed, not just the file', () => {
    expect(() => renderRichFields(
      { thesis: { title: richMarker('$\\href{https://e.example}{x}$') } },
      renderer,
      '0',
      'content/education.yml',
    )).toThrow(/content\/education\.yml: 0\.thesis\.title:/)
  })
})

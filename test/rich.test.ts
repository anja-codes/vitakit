/**
 * The build-side half of rich text: `richText` validates to a marker, and
 * `renderRichFields` replaces every marker with `{ text, html }`.
 */
import { describe, expect, it } from 'vitest'
import { MARKER_KEY, richMarker, renderRichFields } from '../src/rich'
import { richText } from '../src/primitives'
import { richSource } from '../src/shared/rich'
import { createRenderer } from '../src/render'

const renderer = createRenderer()

describe('richText', () => {
  it('validates to a marker, which readers do not mistake for text', () => {
    const parsed = richText.parse('  A $k$-ary title ')
    expect(parsed).toEqual(richMarker('A $k$-ary title'))
    expect(richSource(parsed)).toBe('')
  })
})

describe('renderRichFields', () => {
  it('replaces markers at any depth and leaves everything else alone', () => {
    const result = renderRichFields({
      title: richMarker('*k*-ary'),
      list: [{ nested: richMarker('deep') }],
      untouched: 'plain',
      count: 3,
    }, renderer, '', 'content/x.yml')

    expect(result).toEqual({
      title: { text: '*k*-ary', html: '<em>k</em>-ary' },
      list: [{ nested: { text: 'deep', html: 'deep' } }],
      untouched: 'plain',
      count: 3,
    })
    expect(JSON.stringify(result)).not.toContain(MARKER_KEY)
  })

  it('names the file and the field that failed', () => {
    expect(() => renderRichFields(
      { thesis: { title: richMarker('$\\kk$') }, tags: [richMarker('$\\kk$')] },
      renderer,
      '0',
      'content/education.yml',
    )).toThrow(/^content\/education\.yml: 0\.thesis\.title: invalid TeX/)

    expect(() => renderRichFields({ tags: [richMarker('ok'), richMarker('$\\kk$')] }, renderer, '2', 'content/x.yml'))
      .toThrow(/^content\/x\.yml: 2\.tags\[1\]: /)
  })
})

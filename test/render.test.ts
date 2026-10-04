import { describe, expect, it } from 'vitest'
import { createRenderer } from '../src/render'

const renderer = createRenderer()

describe('display mathematics', () => {
  it('accepts both spellings of display math', () => {
    const block = renderer.markdown('$$\n\\zeta(s)\n$$')
    const inline = renderer.markdown('$$\\zeta(s)$$')
    expect(block).toContain('katex-display')
    // Written on one line, it must still be display math.
    expect(inline).toContain('katex-display')
  })

  it('leaves genuine inline math alone', () => {
    expect(renderer.markdown('a $x$ b')).not.toContain('katex-display')
  })

  it('leaves fenced code blocks alone', () => {
    const html = renderer.markdown(['```', '$$x^2$$', '```'].join('\n'))
    expect(html).toContain('<code>')
    expect(html).not.toContain('katex')
    // The literal source survives, delimiters included.
    expect(html).toContain('$$x^2$$')
  })

  it('does not disturb display math with surrounding prose', () => {
    const html = renderer.markdown('before\n\n$$x^2$$\n\nafter')
    expect(html).toContain('katex-display')
    expect(html).toContain('before')
    expect(html).toContain('after')
  })
})

describe('renderer trust', () => {
  it('refuses commands that would emit markup, instead of silently colouring them red', () => {
    // Rendered math is inserted after sanitization, so KaTeX must not be able
    // to produce markup of its own -- and a refusal must not pass unnoticed.
    expect(() => renderer.markdown('$\\href{https://evil.example}{click}$'))
      .toThrow(/KaTeX refused to render/)
  })

  it('still renders ordinary mathematics', () => {
    expect(renderer.markdown('$\\sqrt{x^2 + 1}$')).toContain('katex')
  })

  it('fails on every command that could emit markup', () => {
    // KaTeX reports nothing for these: it colours them instead. The guarantee
    // is that they fail the build, whatever mechanism detects them.
    for (const command of ['\\href{https://e.example}{x}', '\\url{https://e.example}', '\\includegraphics{x}']) {
      expect(() => renderer.markdown(`$${command}$`), command).toThrow()
    }
  })

  it('never emits the detection sentinel', () => {
    expect(renderer.markdown('$x^2$')).not.toContain('c0ffee')
  })
})

describe('base URL rewriting', () => {
  const sub = createRenderer({ baseURL: '/sub/' })

  it('rewrites Markdown links, reference links and images', () => {
    const html = sub.markdown('[a](/cv/) [b][ref] ![c](/img/c.png)\n\n[ref]: /files/paper.pdf\n')
    expect(html).toContain('href="/sub/cv/"')
    expect(html).toContain('href="/sub/files/paper.pdf"')
    expect(html).toContain('src="/sub/img/c.png"')
  })

  it('rewrites every URL attribute of raw HTML, not only href and src', () => {
    const html = sub.markdown([
      '<img src="/img/a.png" srcset="/img/a.png 1x, /img/a@2x.png 2x">',
      '<picture><source srcset="/img/b.webp" type="image/webp"><img src="/img/b.png"></picture>',
      '<video src="/media/v.mp4" poster="/media/v.png"><track src="/media/v.vtt"></video>',
      '<audio src="/media/a.mp3"></audio>',
      '<iframe src="/embed/"></iframe>',
      '<object data="/files/doc.pdf"></object>',
      "<a href='/single/'>single quotes</a>",
    ].join('\n'))
    for (const path of ['/img/a.png 1x', '/img/a@2x.png 2x', '/img/b.webp', '/img/b.png', '/media/v.mp4',
      '/media/v.png', '/media/v.vtt', '/media/a.mp3', '/embed/', '/files/doc.pdf', '/single/']) {
      expect(html).toContain(`/sub${path}`)
    }
    expect(html).not.toMatch(/(?:src|href|poster|data|srcset)="\/(?!sub\/)/)
  })

  it('leaves external URLs, anchors, relative and protocol-relative paths alone', () => {
    const html = sub.markdown('[a](https://e.org/x) [b](#top) [c](notes/) [d](//cdn.example/x) [e](mailto:x@e.org)')
    expect(html).toContain('href="https://e.org/x"')
    expect(html).toContain('href="#top"')
    expect(html).toContain('href="notes/"')
    expect(html).toContain('href="//cdn.example/x"')
    expect(html).toContain('href="mailto:x@e.org"')
  })

  it('does nothing at the root', () => {
    expect(renderer.markdown('<img src="/a.png" srcset="/a.png 1x">')).toContain('src="/a.png" srcset="/a.png 1x"')
  })
})

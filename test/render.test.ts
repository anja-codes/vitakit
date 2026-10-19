/** Markdown and TeX to HTML, at build time. */
import { describe, expect, it } from 'vitest'
import { createRenderer } from '../src/render'

const renderer = createRenderer()

describe('markdown', () => {
  it('renders GitHub-flavoured Markdown: tables, strikethrough, task lists', () => {
    const html = renderer.markdown('| a |\n| - |\n| 1 |\n\n~~gone~~\n\n- [x] done\n')
    expect(html).toContain('<table>')
    expect(html).toContain('<del>gone</del>')
    expect(html).toContain('type="checkbox"')
  })

  it('renders inline and display mathematics', () => {
    expect(renderer.markdown('a $x$ b')).toMatch(/class="katex"/)
    expect(renderer.markdown('a $x$ b')).not.toContain('katex-display')
    expect(renderer.markdown('$$\n\\zeta(s)\n$$')).toContain('katex-display')
  })

  it('treats a one-line $$…$$ as display mathematics, as people write it', () => {
    const html = renderer.markdown('before\n\n$$x^2$$\n\nafter')
    expect(html).toMatch(/^<p>before<\/p>\n<span class="katex-display">[\s\S]*<p>after<\/p>$/)
  })

  it('leaves a one-line $$…$$ in a fenced code block as written', () => {
    for (const fence of ['```', '~~~~']) {
      const html = renderer.markdown([fence, '$$x^2$$', fence, '', '$$y$$'].join('\n'))
      expect(html).toContain('<code>$$x^2$$\n</code>')
      expect(html).toContain('katex-display')
    }
  })

  it('fails on invalid TeX, naming the line', () => {
    expect(() => renderer.markdown('ok\n\n$\\kk$')).toThrow(/^invalid TeX\n {2}- line 3: .*Undefined control sequence/)
  })

  it.each(['\\href{https://e.example}{x}', '\\url{https://e.example}', '\\includegraphics{x}'])(
    'fails on %s, which could emit markup after sanitization',
    (command) => {
      expect(() => renderer.markdown(`$${command}$`)).toThrow(/KaTeX refused to render/)
    },
  )
})

describe('inline', () => {
  it('renders one line without the wrapping paragraph', () => {
    expect(renderer.inline('*k*-ary $x$')).toMatch(/^<em>k<\/em>-ary <span class="katex">/)
  })

  it('rejects more than one paragraph', () => {
    expect(() => renderer.inline('one\n\ntwo')).toThrow(/expected a single paragraph/)
  })
})

describe('base URL rewriting', () => {
  const sub = createRenderer({ baseURL: '/sub/' })

  it('prefixes Markdown links, reference links and images', () => {
    const html = sub.markdown('[a](/cv/) [b][ref] ![c](/img/c.png)\n\n[ref]: /files/paper.pdf\n')
    expect(html).toContain('href="/sub/cv/"')
    expect(html).toContain('href="/sub/files/paper.pdf"')
    expect(html).toContain('src="/sub/img/c.png"')
  })

  it('prefixes every URL attribute of raw HTML, srcset candidates included', () => {
    const html = sub.markdown([
      '<img src="/img/a.png" srcset="/img/a.png 1x, /img/a@2x.png 2x">',
      '<video src="/media/v.mp4" poster="/media/v.png"><track src="/media/v.vtt"></video>',
      '<object data="/files/doc.pdf"></object>',
      '<form action="/search/"><button formaction="/other/">go</button></form>',
    ].join('\n'))
    const urls = [...html.matchAll(/(?:src|href|poster|data|srcset|action|formaction)="([^"]*)"/gi)].map(match => match[1])
    expect(urls).toEqual([
      '/sub/img/a.png', '/sub/img/a.png 1x, /sub/img/a@2x.png 2x',
      '/sub/media/v.mp4', '/sub/media/v.png', '/sub/media/v.vtt',
      '/sub/files/doc.pdf',
      '/sub/search/', '/sub/other/',
    ])
  })

  it('leaves external URLs, anchors, relative and protocol-relative paths alone', () => {
    const html = sub.markdown('[a](https://e.org/x) [b](#top) [c](notes/) [d](//cdn.example/x) [e](mailto:x@e.org)')
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map(match => match[1])
    expect(hrefs).toEqual(['https://e.org/x', '#top', 'notes/', '//cdn.example/x', 'mailto:x@e.org'])
  })

  it('does nothing at the root', () => {
    expect(renderer.markdown('<img src="/a.png" srcset="/a.png 1x">')).toContain('src="/a.png" srcset="/a.png 1x"')
  })
})

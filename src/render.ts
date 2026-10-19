/**
 * Markdown + TeX -> HTML, entirely at build time.
 *
 * Nothing here reaches the browser: pages ship as prerendered HTML and KaTeX
 * contributes only its stylesheet. Invalid TeX fails the build rather than
 * rendering in red on the live site.
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeStringify from 'rehype-stringify'
import { visit } from 'unist-util-visit'
import type { Root } from 'hast'

/**
 * hast property names that hold a single URL, on any element: `href` (a, area,
 * link, svg), `src` (img, source, video, audio, track, iframe, embed, script),
 * `poster` (video), `data` (object), `action`/`formAction` (forms).
 */
const URL_PROPERTIES = ['href', 'src', 'poster', 'data', 'action', 'formAction'] as const

/** Root-relative, i.e. `/x` but not protocol-relative `//host/x`. */
const isRootRelative = (value: string) => value.startsWith('/') && !value.startsWith('//')

/**
 * Rewrites root-relative paths so they survive a deployment base URL.
 *
 * Write paths as if the site were served from `/`; this prefixes them with the
 * base. Every URL-bearing attribute counts, not only `<a href>` and `<img src>`:
 * a `srcset` or a `<video poster>` that escapes the base is just as broken.
 */
export function prefixRootRelative(value: string, prefix: string): string {
  return prefix && isRootRelative(value) ? `${prefix}${value}` : value
}

function baseUrlPlugin(baseURL: string) {
  const prefix = baseURL.replace(/\/$/, '')
  return () => (tree: Root) => {
    if (!prefix) return
    visit(tree, 'element', (node) => {
      const properties = node.properties
      if (!properties) return
      for (const name of URL_PROPERTIES) {
        const value = properties[name]
        if (typeof value === 'string') properties[name] = prefixRootRelative(value, prefix)
      }
      // `srcset` is a comma-separated list of "url [descriptor]" candidates.
      // Parsed HTML keeps it as one string; a plugin may have split it already.
      const srcSet = properties.srcSet
      if (typeof srcSet === 'string' || Array.isArray(srcSet)) {
        const candidates = typeof srcSet === 'string' ? srcSet.split(/\s*,\s+|\s*,(?=\/)/) : srcSet
        properties.srcSet = candidates
          .map(candidate => String(candidate).trim())
          .filter(Boolean)
          .map(candidate => prefixRootRelative(candidate, prefix))
          .join(', ')
      }
    })
  }
}

/**
 * Improbable colour used to detect formulas KaTeX refused to render. It never
 * reaches the output: any occurrence fails the build.
 */
const ERROR_COLOR = '#c0ffee'

export interface Renderer {
  /** Render a Markdown document to HTML. */
  markdown: (source: string) => string
  /** Render a single line, without the wrapping `<p>`. */
  inline: (source: string) => string
}

/**
 * Put a single-line `$$…$$` on its own lines.
 *
 * remark-math only treats `$$` as display mathematics when it forms its own
 * block; written on one line it silently becomes inline math, which looks
 * wrong and is hard to diagnose. Both spellings are common, so accept both.
 *
 * Fenced code blocks are left untouched: a line inside ``` is not mathematics,
 * and rewriting it would change what the reader wrote.
 */
const ONE_LINE_DISPLAY = /^([ \t]*)\$\$[ \t]*(\S[^\n]*?)[ \t]*\$\$[ \t]*$/
const FENCE = /^[ \t]*(`{3,}|~{3,})/

function normaliseDisplayMath(source: string): string {
  let fence: string | undefined
  return source.split('\n').map((line) => {
    const marker = FENCE.exec(line)?.[1]
    if (fence === undefined) {
      if (marker) fence = marker
    } else if (marker && marker.startsWith(fence[0]!) && marker.length >= fence.length) {
      fence = undefined
      return line
    }
    if (fence !== undefined) return line
    return line.replace(ONE_LINE_DISPLAY, '$1$$$$\n$2\n$1$$$$')
  }).join('\n')
}

export function createRenderer({ baseURL = '/' }: { baseURL?: string } = {}): Renderer {
  const processor = unified()
    .use(remarkParse)
    // Tables, strikethrough and task lists: plain CommonMark has none of these,
    // and a table would otherwise render silently as paragraph text.
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    // Parse embedded HTML into real elements. Without this, `<img src="/img/x">`
    // written directly in Markdown stays an opaque string, and the base-URL
    // rewriting below silently skips it.
    .use(rehypeRaw)
    // `trust: false` is the KaTeX default and is set explicitly because it is
    // load-bearing: rendered math is inserted into the bibliography *after*
    // sanitization, so a permissive renderer (\href, \includegraphics, \url)
    // could reintroduce markup the sanitizer would have removed.
    //
    // A refused command is not a parse error: KaTeX renders it in `errorColor`
    // and reports nothing, so the sentinel below turns that silent failure into
    // a build failure (see `markdown`).
    .use(rehypeKatex, { strict: 'error', trust: false, errorColor: ERROR_COLOR })
    .use(baseUrlPlugin(baseURL))
    .use(rehypeStringify, { allowDangerousHtml: true })

  function markdown(source: string): string {
    const file = processor.processSync(normaliseDisplayMath(source))
    // rehype-katex reports bad TeX as a vfile message and renders it in red
    // instead of throwing, which is useless in a static build.
    if (file.messages.length) {
      const details = file.messages
        .map(message => `  - line ${message.line ?? '?'}: ${(message.cause as Error | undefined)?.message ?? message.reason}`)
        .join('\n')
      throw new Error(`invalid TeX\n${details}`)
    }

    const html = String(file).trim()
    if (html.includes(ERROR_COLOR)) {
      const refused = /<annotation[^>]*>([^<]*)<\/annotation>/.exec(html)?.[1] ?? source
      throw new Error(
        `KaTeX refused to render: ${refused.trim()}\n`
        + '  commands such as \\href, \\url and \\includegraphics are disabled, because\n'
        + '  rendered mathematics is inserted into the page without further sanitization.',
      )
    }
    return html
  }

  function inline(source: string): string {
    const html = markdown(source)
    // Exactly one paragraph: `<p>a</p>\n<p>b</p>` must not unwrap to `a</p>\n<p>b`.
    const unwrapped = /^<p>((?:(?!<\/p>)[\s\S])*)<\/p>$/.exec(html)
    if (!unwrapped) throw new Error(`expected a single paragraph, got: ${html}`)
    return unwrapped[1]!
  }

  return { markdown, inline }
}

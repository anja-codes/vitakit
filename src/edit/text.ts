/** Small helpers for editing source text at known positions. */

export type Recognized<T> = { ok: true, value: T } | { ok: false, reason: string }

export function lineStart(source: string, offset: number): number {
  return source.lastIndexOf('\n', offset - 1) + 1
}

export function lineEnd(source: string, offset: number): number {
  const end = source.indexOf('\n', offset)
  return end === -1 ? source.length : end
}

export function indentationAt(source: string, offset: number): string {
  return /^[ \t]*/.exec(source.slice(lineStart(source, offset)))![0]
}

/** Insert whole lines after the line containing `offset`, keeping the file's ending. */
export function insertLinesAfter(source: string, offset: number, lines: string[]): string {
  const end = lineEnd(source, offset)
  return `${source.slice(0, end)}\n${lines.join('\n')}${source.slice(end)}`
}

/** Insert whole lines before the line containing `offset`. */
export function insertLinesBefore(source: string, offset: number, lines: string[]): string {
  const start = lineStart(source, offset)
  return `${source.slice(0, start)}${lines.join('\n')}\n${source.slice(start)}`
}

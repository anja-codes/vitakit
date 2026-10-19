/**
 * Add lines to a section's PDF template, inside its loop over the entries.
 */
import { type Recognized } from './text'

/**
 * Insert `lines` before the line that closes the template's last loop
 * (`<% } %>` on a line of its own): the end of each entry, where its notes go.
 */
export function addToEntryLoop(source: string, lines: string[]): Recognized<string> {
  const all = source.split('\n')
  let close = -1
  for (let index = all.length - 1; index >= 0; index--) {
    if (/^\s*<%\s*}\s*%>\s*$/.test(all[index]!)) {
      close = index
      break
    }
  }
  if (close === -1) return { ok: false, reason: 'it has no `<% } %>` line ending its loop over the entries' }
  const fresh = lines.filter(line => !source.includes(line))
  if (!fresh.length) return { ok: true, value: source }
  return { ok: true, value: [...all.slice(0, close), ...fresh, ...all.slice(close)].join('\n') }
}

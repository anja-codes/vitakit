/**
 * A publication group laid out as `VitaPublications` does, so that tests can
 * assert on the markup a reader gets without rendering Vue.
 */
import type { PublicationGroup } from '../src/shared/types'

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function renderGroup(group: PublicationGroup): string {
  const items = group.entries.map((entry) => {
    const badges = entry.badges.map(badge =>
      `<a${badge.className ? ` class="${escapeHtml(badge.className)}"` : ''} href="${escapeHtml(badge.url)}">${escapeHtml(badge.label)}</a>`)
    return `<li class="csl-entry" data-csl-entry-id="${escapeHtml(entry.key)}">`
      + `<span class="vita-bib__text">${entry.html}</span>`
      + (badges.length ? ` <span class="bib-links">${badges.join(' ')}</span>` : '')
      + '</li>'
  })
  return `<ol class="vita-bib csl-bib-body">\n${items.join('\n')}\n</ol>`
}

export const renderGroups = (groups: PublicationGroup[]): string => groups.map(renderGroup).join('\n')

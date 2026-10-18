/**
 * Keeps every code group on the reader's last choice: picking the npm tab once
 * switches all pnpm/npm examples, on every page, and is remembered for the
 * next visit.
 *
 * VitePress switches only the clicked group, and scrolls its tab into view.
 * The other groups are switched by setting their state directly; simulated
 * clicks would scroll the page to each of them in turn.
 */
import { onContentUpdated } from 'vitepress'
import { onMounted } from 'vue'

const KEY = 'vitakit:code-group'

function titleOf(input: HTMLInputElement): string | undefined {
  return input.parentElement?.querySelector(`label[for="${CSS.escape(input.id)}"]`)?.textContent?.trim()
}

function select(title: string) {
  for (const group of document.querySelectorAll('.vp-code-group')) {
    const inputs = Array.from(group.querySelectorAll<HTMLInputElement>(':scope > .tabs > input'))
    const index = inputs.findIndex(input => titleOf(input) === title)
    if (index < 0) continue // a group without this tab keeps its own state
    inputs[index]!.checked = true
    const blocks = group.querySelector(':scope > .blocks')?.children ?? []
    Array.from(blocks).forEach((block, i) => block.classList.toggle('active', i === index))
  }
}

export function useSyncedCodeGroups() {
  // On first load and after every navigation, once the page content is in place.
  onContentUpdated(() => {
    const title = localStorage.getItem(KEY)
    if (title) select(title)
  })

  onMounted(() => {
    window.addEventListener('click', (event) => {
      const input = event.target
      if (!(input instanceof HTMLInputElement) || !input.matches('.vp-code-group input')) return
      const title = titleOf(input)
      if (!title) return
      localStorage.setItem(KEY, title)
      select(title)
    })
  })
}

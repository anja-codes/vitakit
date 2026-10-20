/** Hosting choices, comparison facts and actionable setup steps. */
export const DEPLOYMENTS = {
  'github-pages': {
    label: 'GitHub Pages',
    description: 'Static hosting built into GitHub.',
    details: {
      URL: 'https://<user>.github.io/<repo>/ or a custom domain.',
      Source: 'Public on Free; private needs GitHub Pro (personal) or Team/Enterprise (org).',
      CI: 'GitHub Actions.',
    },
    setup: [
      'In GitHub Settings → Pages, select GitHub Actions as the source.',
      'Check .github/workflows/deploy.yml:\n- Project site: keep NUXT_APP_BASE_URL=/<repo>/.\n- User site (<user>.github.io) or root custom domain: remove that setting.',
      'Commit pnpm-lock.yaml and push to main.',
    ],
    notes: ['Private source needs GitHub Pro (personal) or Team/Enterprise (org).'],
    files: ['.github/workflows/deploy.yml', '.github/workflows/cv.yml'],
  },
  'cloudflare-workers': {
    label: 'Cloudflare Workers (recommended)',
    description: 'Cloudflare’s current platform, serving static files without server code.',
    details: {
      URL: 'https://<worker>.<account>.workers.dev/ or a custom domain.',
      Source: 'Private repos supported on Free; hosting/CI limits apply.',
      CI: 'GitHub Actions.',
    },
    setup: [
      'Enable a workers.dev subdomain in your Cloudflare account.',
      'Set the Worker name in wrangler.json.',
      'Add GitHub Actions repository secrets:\n- CLOUDFLARE_ACCOUNT_ID\n- CLOUDFLARE_API_TOKEN (Workers Scripts: Edit permission)',
      'Commit pnpm-lock.yaml and push to main.',
    ],
    files: ['.github/workflows/workers.yml', '.github/workflows/cv.yml', 'wrangler.json'],
  },
  'cloudflare': {
    label: 'Cloudflare Pages (legacy)',
    description: 'Legacy Cloudflare option. Still available; use Workers for new projects.',
    details: {
      URL: 'https://<project>.pages.dev/ or a custom domain.',
      Source: 'Private repos supported on Free; hosting/CI limits apply.',
      CI: 'GitHub Actions, uploading a prebuilt site (Direct Upload).',
    },
    setup: [
      'Create a Cloudflare Pages Direct Upload project; production branch: main.',
      'Set --project-name in .github/workflows/cloudflare.yml to match.',
      'Add GitHub Actions repository secrets:\n- CLOUDFLARE_ACCOUNT_ID\n- CLOUDFLARE_API_TOKEN (Cloudflare Pages: Edit permission)',
      'Commit pnpm-lock.yaml and push to main.',
    ],
    files: ['.github/workflows/cloudflare.yml', '.github/workflows/cv.yml'],
  },
  'gitlab-pages': {
    label: 'GitLab Pages',
    description: 'Static hosting on GitLab.com or a university’s GitLab instance.',
    details: {
      URL: 'https://<project>-<id>.gitlab.io/; project paths/custom domains also work.',
      Source: 'Private repos supported on Free; CI quotas apply.',
      CI: 'GitLab CI/CD. Self-managed instances need GitLab 17.10+.',
    },
    setup: [
      'Enable CI runners and Pages in your GitLab project.',
      'For a public site, set Pages access to Everyone in project settings.',
      'Check .gitlab-ci.yml: the base path comes from CI_PAGES_URL.\nFor a root custom domain, set CI/CD variable NUXT_APP_BASE_URL=/.',
      'Commit pnpm-lock.yaml and push to the default branch.',
    ],
    files: ['.gitlab-ci.yml'],
  },
  'codeberg-pages': {
    label: 'Codeberg Pages (git-pages)',
    description: 'Static hosting on Codeberg, powered by git-pages.',
    details: {
      URL: 'https://<owner>.codeberg.page/<repo>/ or a custom domain.',
      Source: 'Hosted CI needs public, freely licensed source; private needs your own runner.',
      CI: 'Forgejo Actions, using the automatic token; no publishing branch needed.',
    },
    setup: [
      'Enable Actions in your Codeberg repository.',
      'Choose a Docker-capable runner in .forgejo/workflows/codeberg.yml.\nUse your own runner for private source.',
      'Check site and NUXT_APP_BASE_URL in that workflow.\nFor root/custom domains, update both; custom domains also need DNS authorization.',
      'Commit pnpm-lock.yaml and push to main.',
    ],
    notes: ['Codeberg-hosted runners require a public, freely licensed repository.'],
    files: ['.forgejo/workflows/codeberg.yml'],
  },
  'rsync': {
    label: 'Existing web space (SSH/rsync)',
    description: 'Upload to university web space or a server you already control.',
    details: {
      URL: 'Your server’s URL, e.g. https://www.example.edu/~username/.',
      Needs: 'SSH/rsync access and a writable web directory; not SFTP-only hosting.',
      CI: 'GitHub Actions.',
    },
    setup: [
      'Open .github/workflows/rsync.yml.',
      'Set the SSH user, host, destination path and NUXT_APP_BASE_URL.',
      'Add SSH_DEPLOY_KEY as a GitHub Actions repository secret.',
      'Configure SSH host-key verification; the template currently disables it.',
      'Commit pnpm-lock.yaml and push to main.',
    ],
    notes: ['Check the destination: rsync --delete removes files absent from the build.'],
    files: ['.github/workflows/rsync.yml'],
  },
  'none': {
    label: 'Decide later / deploy manually',
    description: 'Choose a host later; nothing is published.',
    details: {
      Local: 'Website and LaTeX CV work as usual.',
      CI: 'No deployment or PDF-build workflows added.',
    },
    setup: [
      'When ready to publish, run pnpm check.',
      'Upload only .output/public to a static host, not the source or cv-tex/.',
    ],
    files: [],
  },
}

/** Wrap CLI prose with hanging indents, preserving explicit sublists. */
function wrap(text, prefix = '', width = 80) {
  const continuation = ' '.repeat(prefix.length)
  return text.split('\n').flatMap((paragraph, index) => {
    const lines = []
    let line = index === 0 ? prefix : continuation
    for (const word of paragraph.split(/\s+/)) {
      if (line.trim() && line.length + 1 + word.length > width) {
        lines.push(line)
        line = continuation
      }
      line += (line.trim() && line !== prefix ? ' ' : '') + word
    }
    lines.push(line)
    return lines
  }).join('\n')
}

export function deploymentHelp() {
  const sections = Object.values(DEPLOYMENTS).map(({ label, description, details }, index) => [
    `${index + 1}. ${label}`,
    wrap(description, '   '),
    ...Object.entries(details).map(([name, value]) => wrap(value, `   ${name}: `)),
  ].join('\n'))
  return [
    'Choosing a deployment target',
    'Keep sensitive CV source private. Publish only .output/public.',
    ...sections,
    'Setup steps are shown after selection.',
  ].join('\n\n')
}

export function deploymentInstructions(key, packageManager = 'pnpm') {
  const { label, setup, notes = [] } = DEPLOYMENTS[key]
  const commandText = text => packageManager === 'npm'
    ? text.replace(/pnpm-lock\.yaml/g, 'package-lock.json').replace(/pnpm check/g, 'npm run check')
    : text
  return [
    `Deployment: ${label}`,
    ...notes.map(note => wrap(note, '  ')),
    ...setup.map((step, index) => wrap(commandText(step), `  ${index + 1}. `)),
  ].join('\n')
}

/** Keep help and invalid input in the selection loop, without losing answers. */
export async function chooseDeployment(ask, log = console.log) {
  const keys = Object.keys(DEPLOYMENTS)
  log('\nDeployment target (you can change this later):')
  keys.forEach((key, index) => log(`  ${index + 1}. ${DEPLOYMENTS[key].label}`))
  log('  ?. Help choosing — URLs, requirements and setup')

  while (true) {
    const choice = (await ask('Choose a number, or ? for help:', '1')).trim()
    if (/^(\?|h|help)$/i.test(choice)) {
      log(`\n${deploymentHelp()}\n`)
      continue
    }
    const key = /^[1-9]\d*$/.test(choice) ? keys[Number(choice) - 1] : undefined
    if (key) return key
    log(`Please choose a number from 1 to ${keys.length}, or ? for help.`)
  }
}

/** The creator's modules (`create/*.mjs`, untyped JavaScript), typed for tests. */
export interface Answers {
  name: string
  title: string
  affiliation: string
  email: string
  slug: string
  deployment: string
  packageManager?: string
}

export interface Deployment {
  label: string
  description: string
  details: Record<string, string>
  setup: string[]
  notes?: string[]
  files: string[]
}

type Ask = (question: string, fallback: string) => Promise<string>

export const { scaffold, detectPackageManager, DEPLOYMENTS } = await import(new URL('../../create/scaffold.mjs', import.meta.url).href) as {
  scaffold: (target: string, answers: Answers) => Promise<void>
  detectPackageManager: (userAgent?: string) => 'pnpm' | 'npm'
  DEPLOYMENTS: Record<string, Deployment>
}

export const { chooseDeployment, deploymentHelp, deploymentInstructions } = await import(new URL('../../create/deployments.mjs', import.meta.url).href) as {
  chooseDeployment: (ask: Ask, log?: (message: string) => void) => Promise<string>
  deploymentHelp: () => string
  deploymentInstructions: (key: string, packageManager?: string) => string
}

export const DEFAULTS: Answers = {
  name: 'Your Name',
  title: 'Postdoctoral Researcher',
  affiliation: 'Department of Mathematics, University of Graz',
  email: 'you@example.org',
  slug: 'my-site',
  deployment: 'github-pages',
}

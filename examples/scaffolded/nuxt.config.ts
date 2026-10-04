import tailwindcss from '@tailwindcss/vite'

const baseURL = process.env.NUXT_APP_BASE_URL || '/'
if (!baseURL.startsWith('/') || !baseURL.endsWith('/') || baseURL.includes('//')) {
  throw new Error('NUXT_APP_BASE_URL must be a path with leading and trailing slashes, e.g. /my-site/')
}

export default defineNuxtConfig({
  compatibilityDate: '2026-09-06',
  devtools: { enabled: false },

  modules: ['@nuxt/fonts', '@anja.codes/vitakit/nuxt'],

  // Formulas are rendered at build time; vitakit adds the matching KaTeX
  // stylesheet itself, so no KaTeX is installed here.
  css: ['~/assets/css/main.css'],

  vite: { plugins: [tailwindcss()] },

  app: {
    baseURL,
    head: { htmlAttrs: { lang: 'en' } },
  },

  nitro: {
    prerender: {
      failOnError: true,
      // Routes come from vitakit, so an unlinked page is still generated.
      crawlLinks: false,
    },
  },
})

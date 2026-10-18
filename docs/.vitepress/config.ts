import { slug } from "github-slugger";
import { defineConfig } from "vitepress";
import { katex } from "@mdit/plugin-katex";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";

export default defineConfig({
  title: "vitakit",
  description: "Structured CV data in, academic website and LaTeX CV out.",
  cleanUrls: true,
  // Generated from an icon in assets/logo/ by `pnpm --filter ./docs favicons`.
  head: [
    ["link", { rel: "icon", href: "/favicon.ico", sizes: "32x32" }],
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    ["link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }],
  ],
  sitemap: { hostname: "https://vitakit.anja.codes" },
  // docs/README.md stays the folder index on GitHub and becomes / on the site
  rewrites: { "README.md": "index.md" },
  // same heading IDs as GitHub, so existing #anchors keep working
  markdown: {
    anchor: { slugify: slug },
    codeTransformers: [transformerTwoslash()],
    config: (md) => {
      md.use(katex);
    },
  },
  themeConfig: {
    // The logo is the wordmark, so the text title would repeat it.
    logo: { light: "/logo/logo_black.svg", dark: "/logo/logo.svg", alt: "vitakit" },
    siteTitle: false,
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Getting started", link: "/getting-started" },
          { text: "Content reference", link: "/content-reference" },
          { text: "Commands", link: "/cli" },
          { text: "Customising", link: "/customising" },
          { text: "CV documents", link: "/cv-documents" },
          { text: "Privacy", link: "/privacy" },
          { text: "Troubleshooting", link: "/troubleshooting" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/anja-codes/vitakit" },
    ],
  },
});

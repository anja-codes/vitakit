import { readFileSync } from "node:fs";
import { slug } from "github-slugger";
import { defineConfig, type DefaultTheme } from "vitepress";
import { katex } from "@mdit/plugin-katex";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";

// The released version, shown in the nav; the docs are rebuilt when it changes.
const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as { version: string };

const guide: DefaultTheme.SidebarItem[] = [
  {
    text: "Guide",
    items: [
      { text: "Concepts", link: "/guide/concepts" },
      { text: "How do I …?", link: "/guide/how-do-i" },
      { text: "Publishing", link: "/guide/publishing" },
      { text: "Privacy", link: "/guide/privacy" },
      { text: "Troubleshooting", link: "/guide/troubleshooting" },
    ],
  },
  {
    text: "Tutorial",
    items: [
      { text: "Overview", link: "/guide/tutorial/" },
      { text: "1. Create and run", link: "/guide/tutorial/create" },
      { text: "2. Make it yours", link: "/guide/tutorial/make-it-yours" },
      { text: "3. Your CV entries", link: "/guide/tutorial/entries" },
      { text: "4. Publications", link: "/guide/tutorial/publications" },
      { text: "5. A section of your own", link: "/guide/tutorial/own-section" },
      { text: "6. Showing more", link: "/guide/tutorial/showing-more" },
      { text: "7. The PDF", link: "/guide/tutorial/pdf" },
      { text: "8. Check and publish", link: "/guide/tutorial/publish" },
    ],
  },
];

const cli: DefaultTheme.SidebarItem[] = [
  {
    text: "Commands",
    items: [
      { text: "How it works", link: "/cli/" },
      { text: "status, explain, validate", link: "/cli/looking" },
      { text: "add", link: "/cli/add" },
      { text: "customize", link: "/cli/customize" },
      { text: "pdf, check, verify", link: "/cli/building" },
      { text: "eject", link: "/cli/eject" },
      { text: "Updating vitakit", link: "/cli/migrating" },
    ],
  },
];

const content: DefaultTheme.SidebarItem[] = [
  {
    text: "Content",
    items: [
      { text: "The content folder", link: "/content/" },
      { text: "Publications and lists", link: "/content/publications" },
      { text: "Field types", link: "/content/field-types" },
      { text: "Built-in sections", link: "/content/sections" },
      { text: "Profile and pages", link: "/content/profile-and-pages" },
      { text: "Schemas", link: "/content/schemas" },
    ],
  },
];

const website: DefaultTheme.SidebarItem[] = [
  {
    text: "Website",
    items: [
      { text: "Pages and routes", link: "/website/" },
      { text: "Placing sections", link: "/website/sections" },
      { text: "Customising entries", link: "/website/entries" },
      { text: "Styling", link: "/website/styling" },
      { text: "Publications", link: "/website/publications" },
      { text: "Components and composables", link: "/website/components" },
    ],
  },
];

const pdf: DefaultTheme.SidebarItem[] = [
  {
    text: "PDF",
    items: [
      { text: "Documents", link: "/pdf/" },
      { text: "Variants and prose", link: "/pdf/variants" },
      { text: "Templates", link: "/pdf/templates" },
      { text: "Styling", link: "/pdf/styling" },
      { text: "Bibliography", link: "/pdf/bibliography" },
      { text: "Building", link: "/pdf/building" },
    ],
  },
];

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
  // docs/README.md is the folder index on GitHub; the site has its own home.
  srcExclude: ["README.md"],
  // same heading IDs as GitHub, so #anchors work in both places
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
    nav: [
      { text: "Guide", link: "/guide/tutorial/", activeMatch: "^/guide/" },
      { text: "CLI", link: "/cli/", activeMatch: "^/cli/" },
      { text: "Content", link: "/content/", activeMatch: "^/content/" },
      { text: "Website", link: "/website/", activeMatch: "^/website/" },
      { text: "PDF", link: "/pdf/", activeMatch: "^/pdf/" },
      {
        text: `v${version}`,
        items: [
          { text: "Changelog", link: "/changelog" },
          { text: "Updating vitakit", link: "/cli/migrating" },
          { text: "Releases on GitHub", link: "https://github.com/anja-codes/vitakit/releases" },
        ],
      },
    ],
    sidebar: {
      "/guide/": guide,
      "/cli/": cli,
      "/content/": content,
      "/website/": website,
      "/pdf/": pdf,
    },
    outline: [2, 3],
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: "https://github.com/anja-codes/vitakit" },
    ],
  },
});

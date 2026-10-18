import { slug } from "github-slugger";
import { defineConfig } from "vitepress";
import { katex } from "@mdit/plugin-katex";
import { transformerTwoslash } from "@shikijs/vitepress-twoslash";

export default defineConfig({
  title: "vitakit",
  description: "Structured CV data in, academic website and LaTeX CV out.",
  cleanUrls: true,
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

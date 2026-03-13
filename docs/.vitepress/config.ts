import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ffmpeg-kit",
  description:
    "Type-safe TypeScript SDK for FFmpeg. Fluent builders, hardware acceleration, probe caching.",
  base: "/",
  srcExclude: [
    "designs/**",
    "ARCH.md",
    "INTERFACE.md",
    "TESTING.md",
    "ROADMAP.md",
    "CLAUDE.md",
    "design-phase-*.md",
  ],
  head: [
    ["script", { async: "", src: "https://www.googletagmanager.com/gtag/js?id=G-9G2GF3HBBB" }],
    [
      "script",
      {},
      "window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', 'G-9G2GF3HBBB');",
    ],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }],
    ["meta", { name: "theme-color", content: "#10B981" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Type-safe TypeScript SDK for FFmpeg with fluent builders, hardware acceleration, and batch processing.",
      },
    ],
  ],
  themeConfig: {
    logo: "/logo.svg",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      { text: "Operations", link: "/operations/extract" },
      { text: "API Reference", link: "/api/core" },
      {
        text: "v0.1.6",
        items: [
          { text: "Changelog", link: "/changelog" },
          { text: "GitHub", link: "https://github.com/nklisch/ffmpeg-kit" },
        ],
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Why ffmpeg-kit?", link: "/guide/why" },
            { text: "Architecture", link: "/guide/architecture" },
          ],
        },
        {
          text: "Essentials",
          items: [
            { text: "Tri-Modal Execution", link: "/guide/execution" },
            { text: "Error Handling", link: "/guide/errors" },
            { text: "Hardware Acceleration", link: "/guide/hardware" },
            { text: "Custom Instances", link: "/guide/instances" },
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Pipeline", link: "/guide/pipeline" },
            { text: "Batch Processing", link: "/guide/batch" },
            { text: "Filter Graph", link: "/guide/filters" },
            { text: "Presets", link: "/guide/presets" },
          ],
        },
      ],
      "/operations/": [
        {
          text: "Operations",
          items: [
            { text: "Extract", link: "/operations/extract" },
            { text: "Transform", link: "/operations/transform" },
            { text: "Audio", link: "/operations/audio" },
            { text: "Concat", link: "/operations/concat" },
            { text: "Export", link: "/operations/export" },
            { text: "Overlay", link: "/operations/overlay" },
            { text: "Text", link: "/operations/text" },
            { text: "Subtitle", link: "/operations/subtitle" },
            { text: "Image", link: "/operations/image" },
            { text: "Streaming", link: "/operations/streaming" },
            { text: "GIF", link: "/operations/gif" },
          ],
        },
        {
          text: "Convenience",
          items: [
            { text: "Smart Transcode", link: "/operations/smart-transcode" },
            { text: "Thumbnail Sheet", link: "/operations/thumbnail-sheet" },
            { text: "Waveform", link: "/operations/waveform" },
            { text: "Silence Detection", link: "/operations/silence" },
            { text: "Quick Helpers", link: "/operations/quick" },
          ],
        },
      ],
      "/api/": [
        {
          text: "API Reference",
          items: [
            { text: "Core", link: "/api/core" },
            { text: "Probe", link: "/api/probe" },
            { text: "Hardware", link: "/api/hardware" },
            { text: "Encoding", link: "/api/encoding" },
            { text: "Types", link: "/api/types" },
            { text: "Errors", link: "/api/errors" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/nklisch/ffmpeg-kit" },
      { icon: "npm", link: "https://www.npmjs.com/package/ffmpeg-kit" },
    ],
    search: {
      provider: "local",
    },
    editLink: {
      pattern: "https://github.com/nklisch/ffmpeg-kit/edit/main/docs/:path",
    },
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026-present",
    },
  },
});

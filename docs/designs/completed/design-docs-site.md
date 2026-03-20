# Design: Documentation Site (VitePress)

## Overview

Comprehensive documentation site for ffmpeg-kit using VitePress with a warm professional theme, code-first hero, and vibrant green accent (`#10B981`). Deploys to GitHub Pages at `https://nklisch.github.io/ffmpeg-kit`.

### Style Decisions

| Decision | Choice |
|----------|--------|
| Framework | VitePress |
| Visual style | Warm professional — light default, dark toggle, rounded cards, gradient hero |
| Landing page | Code-first — hero shows real code immediately |
| Accent color | Vibrant green `#10B981` (emerald-500) |

---

## Implementation Units

### Unit 1: VitePress Project Scaffolding

**Files:**
- `docs/.vitepress/config.ts` — VitePress configuration
- `docs/.vitepress/theme/index.ts` — Custom theme entry
- `docs/.vitepress/theme/style.css` — Custom CSS overrides

#### `docs/.vitepress/config.ts`

```typescript
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "ffmpeg-kit",
  description:
    "Type-safe TypeScript SDK for FFmpeg. Fluent builders, hardware acceleration, probe caching.",
  base: "/ffmpeg-kit/",
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/ffmpeg-kit/logo.svg" }],
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
        text: "v0.1.0",
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
      copyright: "Copyright © 2024-present",
    },
  },
});
```

#### `docs/.vitepress/theme/index.ts`

```typescript
import DefaultTheme from "vitepress/theme";
import "./style.css";

export default DefaultTheme;
```

#### `docs/.vitepress/theme/style.css`

```css
/**
 * ffmpeg-kit docs — Warm professional theme with vibrant green accent
 *
 * Color palette:
 *   Primary: #10B981 (emerald-500)
 *   Hover:   #059669 (emerald-600)
 *   Soft:    #D1FAE5 (emerald-100)  /  #065F46 (emerald-800, dark mode)
 */

:root {
  /* Brand green */
  --vp-c-brand-1: #10B981;
  --vp-c-brand-2: #059669;
  --vp-c-brand-3: #047857;
  --vp-c-brand-soft: rgba(16, 185, 129, 0.14);

  /* Warm background tint */
  --vp-c-bg: #fafaf9;
  --vp-c-bg-alt: #f5f5f4;
  --vp-c-bg-soft: #f5f5f4;

  /* Hero gradient */
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(
    135deg,
    #10B981 0%,
    #059669 50%,
    #047857 100%
  );

  --vp-home-hero-image-background-image: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.25) 0%,
    rgba(5, 150, 105, 0.15) 100%
  );
  --vp-home-hero-image-filter: blur(44px);
}

.dark {
  --vp-c-bg: #1a1a1a;
  --vp-c-bg-alt: #161616;
  --vp-c-bg-soft: #222222;

  --vp-home-hero-image-background-image: linear-gradient(
    135deg,
    rgba(16, 185, 129, 0.15) 0%,
    rgba(5, 150, 105, 0.08) 100%
  );
}

/* Rounded feature cards */
.VPFeature {
  border-radius: 12px !important;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.VPFeature:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
}
.dark .VPFeature:hover {
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

/* Softer code block styling */
.vp-doc div[class*="language-"] {
  border-radius: 10px;
}

/* Hero action buttons — rounded */
.VPButton.medium {
  border-radius: 8px;
}

/* Custom badge for operation pages */
.operation-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}
```

**Acceptance Criteria:**
- [ ] `pnpm docs:dev` starts VitePress dev server
- [ ] Green accent color renders in nav, links, and hero
- [ ] Light/dark mode toggle works
- [ ] Feature cards have rounded corners and hover lift
- [ ] Warm off-white background in light mode

---

### Unit 2: Landing Page (Code-First Hero)

**File:** `docs/index.md`

```markdown
---
layout: home

hero:
  name: ffmpeg-kit
  text: FFmpeg, typed.
  tagline: >-
    A fluent TypeScript SDK for FFmpeg —
    extract, transform, mix, stream, and export
    with type safety and smart defaults.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/nklisch/ffmpeg-kit

features:
  - icon: 🔗
    title: Fluent Builders
    details: >-
      11 operation builders with chainable APIs.
      Every method returns <code>this</code> — compose complex pipelines
      in a single expression.
    link: /operations/extract
    linkText: See operations

  - icon: 🎯
    title: Tri-Modal Execution
    details: >-
      <code>.toArgs()</code> for inspection,
      <code>.execute()</code> for direct use,
      <code>.tryExecute()</code> for Result types.
      Choose your error handling style.
    link: /guide/execution
    linkText: Learn more

  - icon: ⚡
    title: Hardware Acceleration
    details: >-
      Auto-detect NVENC, VAAPI, and QSV.
      Falls back to CPU transparently —
      no conditional logic in your code.
    link: /guide/hardware
    linkText: Hardware guide

  - icon: 📦
    title: Zero Config
    details: >-
      Import <code>ffmpeg</code> and go.
      Smart defaults for quality, codecs, and presets.
      Custom instances when you need control.
    link: /guide/instances
    linkText: Configuration

  - icon: 🔍
    title: Probe & Cache
    details: >-
      Zod-validated <code>ffprobe</code> output with
      LRU caching keyed by path + mtime.
      No redundant probes, ever.
    link: /api/probe
    linkText: Probe API

  - icon: 🛠️
    title: Convenience Layer
    details: >-
      Pipeline chaining, batch processing, smart transcode,
      thumbnail sheets, waveform extraction, silence detection —
      common workflows as one-liners.
    link: /operations/smart-transcode
    linkText: Convenience functions
---

<div class="vp-doc" style="max-width: 688px; margin: 0 auto; padding: 48px 24px 64px;">

## Write FFmpeg like TypeScript

Every operation is a typed builder. Autocomplete guides you —
no memorizing FFmpeg flags.

```typescript
import { ffmpeg } from "ffmpeg-kit";

// Extract a thumbnail at the 5-second mark
const { outputPath, width, height } = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .size({ width: 640 })
  .format("jpg")
  .output("thumb.jpg")
  .execute();

// Scale, trim, and export with a YouTube preset
await ffmpeg.transform()
  .input("raw.mp4")
  .scale({ width: 1920, height: 1080 })
  .trimStart("00:01:00")
  .duration(120)
  .output("clip.mp4")
  .execute();

// Normalize audio loudness
await ffmpeg.audio()
  .input("podcast.wav")
  .normalize({ targetLUFS: -16 })
  .fadeIn({ duration: 0.5 })
  .fadeOut({ duration: 1 })
  .output("normalized.wav")
  .execute();
```

## Result types, not just exceptions

```typescript
// Traditional try/catch
try {
  await ffmpeg.extract().input("video.mp4")
    .timestamp(5).output("frame.png").execute();
} catch (e) {
  if (e instanceof FFmpegError) {
    console.log(e.code);   // FFmpegErrorCode.INPUT_NOT_FOUND
    console.log(e.stderr);
  }
}

// Or use Result types — no try/catch needed
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .tryExecute();

if (!result.success) {
  console.error(result.error.code);
}
```

## One-liners for common tasks

```typescript
await ffmpeg.remux("input.mp4", "output.mkv");
await ffmpeg.compress("input.mp4", "small.mp4", { crf: 28 });
await ffmpeg.extractAudio("video.mp4", "audio.mp3");
await ffmpeg.resize("input.mp4", "720p.mp4", { width: 1280 });
```

</div>
```

**Implementation Notes:**
- The `<div class="vp-doc">` wrapper after the frontmatter features section renders the code examples in VitePress's standard doc styling below the feature grid
- This creates the "code-first" feel — features are brief, then immediately dive into real code
- All code examples are real, working API calls (not pseudocode)

**Acceptance Criteria:**
- [ ] Hero shows gradient green title "ffmpeg-kit" with tagline
- [ ] Two CTA buttons: "Get Started" (green) and "View on GitHub" (outline)
- [ ] 6 feature cards in a 3x2 grid with icons, descriptions, and links
- [ ] Below features: 3 code blocks showing real usage patterns
- [ ] Page renders correctly in both light and dark mode

---

### Unit 3: Guide Pages

#### `docs/guide/getting-started.md`

```markdown
---
outline: deep
---

# Getting Started

## Prerequisites

- **Node.js** >= 22
- **FFmpeg** and **ffprobe** installed and available on `PATH`

::: tip Check your installation
Run `ffmpeg -version` and `ffprobe -version` to verify.
:::

## Installation

::: code-group
```bash [npm]
npm install ffmpeg-kit
```
```bash [pnpm]
pnpm add ffmpeg-kit
```
```bash [yarn]
yarn add ffmpeg-kit
```
:::

## Your first operation

{Extract example + explanation}

## What's next?

- [Tri-modal execution](/guide/execution) — understand `.toArgs()`, `.execute()`, `.tryExecute()`
- [Operations](/operations/extract) — browse all 11 builders
- [Error handling](/guide/errors) — handle failures gracefully
```

**Implementation Notes:**
- VitePress `code-group` component shows tabbed install commands
- `outline: deep` enables right-side table of contents for all heading levels
- Keep this page short and focused — link out to deeper guides

#### `docs/guide/why.md`

Content: Comparison with alternatives (raw child_process, fluent-ffmpeg), design philosophy (agent-friendly, layered architecture, typed results). Pull key points from `docs/ARCH.md` design goals section.

#### `docs/guide/execution.md`

Content: Deep dive on the tri-modal pattern. Show same operation three ways: `.toArgs()` for testing/debugging, `.execute()` for happy-path, `.tryExecute()` for Result types. Include `ProgressInfo` callback and `AbortSignal` cancellation examples.

#### `docs/guide/errors.md`

Content: `FFmpegError` class, all `FFmpegErrorCode` values with descriptions, classification logic, how to handle specific error codes. Code examples for common error scenarios.

#### `docs/guide/hardware.md`

Content: Hardware detection, `hwAccel()` modes, auto-fallback behavior, NVENC/VAAPI/QSV specifics, session management for NVENC limits.

#### `docs/guide/instances.md`

Content: `createFFmpeg()` config options, when to use custom instances vs the default `ffmpeg` singleton, per-operation option overrides.

#### `docs/guide/pipeline.md`

Content: Pipeline builder API, `$tmp` and `$prev` placeholders, auto temp file cleanup, multi-step workflows.

#### `docs/guide/batch.md`

Content: `batch()` API, concurrency control, per-item callbacks, `BatchResult` handling.

#### `docs/guide/filters.md`

Content: `filter()`, `chain()`, `filterGraph()` APIs, filter expression helpers, building complex filter graphs.

#### `docs/guide/presets.md`

Content: YouTube, social, web, and archive preset listings with their parameters. How to use `preset()` on export builder.

**Acceptance Criteria for all guide pages:**
- [ ] Each page has `outline: deep` frontmatter
- [ ] Code examples are real, working API calls
- [ ] Pages link to related operations and API reference
- [ ] VitePress containers (`::: tip`, `::: warning`) used for callouts

---

### Unit 4: Operation Pages (1 per builder)

**Files:** `docs/operations/{extract,transform,audio,concat,export,overlay,text,subtitle,image,streaming,gif}.md`

Each operation page follows this template:

```markdown
# {Operation Name}

{One-line description.}

## Quick Example

\`\`\`typescript
{Minimal working example}
\`\`\`

## API

### `.method(param)`

{Description, parameter types, default value.}

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| ... | ... | ... | ... |

## Examples

### {Use Case 1}
\`\`\`typescript
{Complete example}
\`\`\`

### {Use Case 2}
\`\`\`typescript
{Complete example}
\`\`\`

## Result Type

\`\`\`typescript
interface {Operation}Result {
  ...
}
\`\`\`

## Related

- [{Related operation}](/operations/{name})
- [{Relevant guide}](/guide/{name})
```

**Implementation Notes:**
- Content for each page is extracted from the existing README.md examples and INTERFACE.md type definitions
- Parameter tables provide the precise TypeScript types
- "Related" section cross-links to adjacent operations

**Acceptance Criteria:**
- [ ] All 11 operation builders have a dedicated page
- [ ] Each page has a quick example, full API table, multiple examples, and result type
- [ ] Cross-links between related operations

---

### Unit 5: Convenience Function Pages

**Files:** `docs/operations/{smart-transcode,thumbnail-sheet,waveform,silence,quick}.md`

Same template as operation pages but simpler (these are functions, not builders). Show function signature, parameters table, return type, and 2-3 examples each.

**Acceptance Criteria:**
- [ ] All 5 convenience function groups have a dedicated page
- [ ] Each page shows function signature, parameter table, and examples

---

### Unit 6: API Reference Pages

**Files:** `docs/api/{core,probe,hardware,encoding,types,errors}.md`

These are the dense reference pages — full TypeScript interface definitions, every exported function, every type. Content is migrated from `docs/INTERFACE.md` and split into focused pages.

```markdown
# Core API

## `execute()`

\`\`\`typescript
function execute(args: string[], options?: ExecuteOptions): Promise<ExecuteResult>;
\`\`\`

### ExecuteOptions

\`\`\`typescript
interface ExecuteOptions {
  cwd?: string;
  timeout?: number;
  onProgress?: (progress: ProgressInfo) => void;
  signal?: AbortSignal;
  env?: Record<string, string>;
  logLevel?: FFmpegLogLevel;
  overwrite?: boolean;
}
\`\`\`

{... full interface definitions for every export ...}
```

**Acceptance Criteria:**
- [ ] Every public export from `src/index.ts` is documented in an API reference page
- [ ] Full TypeScript interfaces are shown (not prose descriptions)
- [ ] Organized into logical groupings matching the source structure

---

### Unit 7: Package Scripts & GitHub Actions Update

#### `package.json` — new scripts

```jsonc
{
  "scripts": {
    // ... existing scripts ...
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  },
  "devDependencies": {
    // ... existing ...
    "vitepress": "^1.6.3"
  }
}
```

#### `.github/workflows/docs.yml` — updated for VitePress build

```yaml
name: Deploy docs to GitHub Pages

on:
  push:
    branches: [main]
    paths: ['docs/**', 'README.md']

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm docs:build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

#### `.gitignore` additions

```
docs/.vitepress/dist
docs/.vitepress/cache
```

**Acceptance Criteria:**
- [ ] `pnpm docs:dev` starts local dev server
- [ ] `pnpm docs:build` produces static site in `docs/.vitepress/dist`
- [ ] GitHub Actions workflow builds VitePress and deploys to Pages
- [ ] Build artifacts are gitignored

---

### Unit 8: Logo SVG

**File:** `docs/public/logo.svg`

A simple, clean SVG logo — a stylized film frame or play button in the brand green (`#10B981`). Should be recognizable at 32x32 (favicon) and 128x128 (sidebar).

**Implementation Notes:**
- Keep it minimal — geometric shapes, no gradients that break at small sizes
- Monochrome green works for both light and dark themes

**Acceptance Criteria:**
- [ ] SVG renders cleanly at 32px and 128px
- [ ] Uses brand green color
- [ ] Works on both light and dark backgrounds

---

## Implementation Order

1. **Unit 7** — Package scripts, deps, gitignore, CI update (unblocks everything)
2. **Unit 1** — VitePress config + theme (unblocks all content)
3. **Unit 8** — Logo SVG (small, independent)
4. **Unit 2** — Landing page (first visible result)
5. **Unit 3** — Guide pages (core documentation)
6. **Unit 4** — Operation pages (builder references)
7. **Unit 5** — Convenience function pages
8. **Unit 6** — API reference pages (migrate from INTERFACE.md)

Units 3-6 can be parallelized once Unit 1 and 2 are done.

---

## Testing

### Manual Verification
```bash
pnpm docs:dev          # Start dev server, visually verify each page
pnpm docs:build        # Ensure clean build with no warnings
```

### Build Verification
```bash
pnpm docs:build 2>&1 | grep -i "error\|warn"  # Should be empty
ls docs/.vitepress/dist/index.html              # Landing page exists
ls docs/.vitepress/dist/guide/getting-started.html  # Guide page exists
```

### Link Checking
- All internal links resolve (VitePress warns on broken links during build)
- All code examples use real API names from `src/index.ts`

---

## Verification Checklist

- [ ] `pnpm install` adds vitepress
- [ ] `pnpm docs:dev` starts without errors
- [ ] Landing page renders with green gradient hero
- [ ] Feature cards display in 3x2 grid with hover effect
- [ ] Code examples below hero render with syntax highlighting
- [ ] Light/dark mode toggle works throughout
- [ ] All sidebar navigation links resolve
- [ ] Search finds content across all pages
- [ ] `pnpm docs:build` completes without warnings
- [ ] GitHub Actions workflow builds and deploys successfully

---

## File Tree (New/Modified)

```
docs/
├── .vitepress/
│   ├── config.ts              ← NEW
│   └── theme/
│       ├── index.ts           ← NEW
│       └── style.css          ← NEW
├── public/
│   └── logo.svg               ← NEW
├── index.md                   ← REWRITE (landing page)
├── guide/
│   ├── getting-started.md     ← NEW
│   ├── why.md                 ← NEW
│   ├── architecture.md        ← NEW (adapted from ARCH.md)
│   ├── execution.md           ← NEW
│   ├── errors.md              ← NEW
│   ├── hardware.md            ← NEW
│   ├── instances.md           ← NEW
│   ├── pipeline.md            ← NEW
│   ├── batch.md               ← NEW
│   ├── filters.md             ← NEW
│   └── presets.md             ← NEW
├── operations/
│   ├── extract.md             ← NEW
│   ├── transform.md           ← NEW
│   ├── audio.md               ← NEW
│   ├── concat.md              ← NEW
│   ├── export.md              ← NEW
│   ├── overlay.md             ← NEW
│   ├── text.md                ← NEW
│   ├── subtitle.md            ← NEW
│   ├── image.md               ← NEW
│   ├── streaming.md           ← NEW
│   ├── gif.md                 ← NEW
│   ├── smart-transcode.md     ← NEW
│   ├── thumbnail-sheet.md     ← NEW
│   ├── waveform.md            ← NEW
│   ├── silence.md             ← NEW
│   └── quick.md               ← NEW
├── api/
│   ├── core.md                ← NEW
│   ├── probe.md               ← NEW
│   ├── hardware.md            ← NEW
│   ├── encoding.md            ← NEW
│   ├── types.md               ← NEW
│   └── errors.md              ← NEW
├── changelog.md               ← NEW (placeholder)
├── ARCH.md                    ← KEEP (internal reference)
├── INTERFACE.md               ← KEEP (source for API pages)
├── TESTING.md                 ← KEEP (internal reference)
└── ROADMAP.md                 ← KEEP (internal reference)
.github/workflows/docs.yml    ← MODIFY (VitePress build)
package.json                   ← MODIFY (add scripts + dep)
.gitignore                     ← MODIFY (add vitepress artifacts)
```

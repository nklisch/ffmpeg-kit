# Design: Phase 12 — Polish & Publish

## Overview

Final hardening, metadata, documentation, and npm publish for `ffmpeg-kit` v0.1.0. Stress tests are deferred to a future release.

This phase covers:
1. ROADMAP.md checkbox cleanup (Phases 7–11 are done but unchecked)
2. Package metadata for npm publish
3. LICENSE file (MIT)
4. Full README.md with comprehensive API documentation
5. GitHub Pages documentation site
6. Build verification and test hardening
7. Version bump and npm publish

---

## Implementation Units

### Unit 1: Update ROADMAP.md Checkboxes

**File**: `docs/ROADMAP.md`

Check all items in Phases 7–11 that are currently `[ ]` but are fully implemented. Every source file, builder test, and E2E test file exists. Flip them all to `[x]`.

Phase 12 items completed so far should also be checked:
- `[x]` Full TESTING.md coverage matrix audit — every row green
- `[x]` `pnpm build` — clean build, verify `dist/` output
- `[x]` Verify `dist/index.d.ts` exports all public types correctly
- `[x]` Package size audit — no accidental bundling of test fixtures or dev deps
- `[x]` Final biome pass — zero warnings

Items to leave unchecked until actually done:
- `[ ]` Run all tests 3x consecutively to verify no flakiness
- `[ ]` Add `workspace:*` support for monorepo consumption
- `[ ]` Stress tests (deferred)
- `[ ]` Tag `v0.1.0`

**Acceptance Criteria**:
- [ ] All Phase 7 items checked
- [ ] All Phase 8 items checked
- [ ] All Phase 9 items checked
- [ ] All Phase 10 items checked
- [ ] All Phase 11 items checked
- [ ] Phase 12 items reflect actual completion status

---

### Unit 2: Package Metadata

**File**: `package.json`

Update metadata fields to match npm publish requirements. Keep the name `ffmpeg-kit` (unscoped, public npm).

```typescript
// Fields to add/update in package.json:
{
  "name": "ffmpeg-kit",
  "version": "0.1.0",
  "description": "TypeScript SDK wrapping the FFmpeg CLI — fluent builders, hardware acceleration, probe caching, batch processing",
  "license": "MIT",
  "author": "nklisch",
  "repository": {
    "type": "git",
    "url": "https://github.com/nklisch/ffmpeg-kit.git"
  },
  "homepage": "https://nklisch.github.io/ffmpeg-kit",
  "bugs": {
    "url": "https://github.com/nklisch/ffmpeg-kit/issues"
  },
  "keywords": [
    "ffmpeg",
    "ffprobe",
    "video",
    "audio",
    "transcoding",
    "streaming",
    "hls",
    "gif",
    "typescript",
    "sdk"
  ],
  "scripts": {
    // Add prepublishOnly to ensure build before publish
    "prepublishOnly": "pnpm build"
  }
}
```

**Implementation Notes**:
- Keep `"main"` absent — the `"exports"` field is sufficient for ESM-only packages
- Keep `"type": "module"`, `"sideEffects": false`, `"files": ["dist"]`
- Keep `"engines": { "node": ">=22.0.0" }`

**Acceptance Criteria**:
- [ ] `npm pack --dry-run` shows only `dist/` files, package.json, and LICENSE
- [ ] All metadata fields present: name, version, description, license, author, repository, homepage, bugs, keywords
- [ ] `prepublishOnly` script runs build

---

### Unit 3: LICENSE File

**File**: `LICENSE` (project root)

```text
MIT License

Copyright (c) 2025 nklisch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

**Acceptance Criteria**:
- [ ] LICENSE file exists at project root
- [ ] MIT license text with correct year and author
- [ ] `npm pack` includes LICENSE in the tarball

---

### Unit 4: README.md

**File**: `README.md` (project root)

Full README covering installation, quick start, all operations, and API reference. This is the primary documentation surface for npm and GitHub.

**Structure**:

```markdown
# ffmpeg-kit

TypeScript SDK wrapping the FFmpeg CLI. Fluent builders, hardware acceleration,
probe caching, batch processing.

## Features

- **Fluent builders** for all FFmpeg operations — extract, transform, audio,
  concat, export, overlay, text, subtitle, image, streaming, GIF
- **Tri-modal execution** — `.toArgs()` for inspection, `.execute()` for
  direct use, `.tryExecute()` for Result types
- **Hardware acceleration** — auto-detect NVENC/VAAPI/QSV with CPU fallback
- **Probe caching** — LRU cache keyed by (path, mtime)
- **Convenience layer** — pipeline, batch, smart transcode, thumbnail sheets,
  waveform, silence detection
- **Type-safe** — strict TypeScript, Zod-validated probe output
- **ESM only** — tree-shakeable named exports

## Requirements

- Node.js >= 22
- FFmpeg and ffprobe installed on PATH

## Installation

\```bash
npm install ffmpeg-kit
\```

## Quick Start

\```typescript
import { ffmpeg } from "ffmpeg-kit";

// Extract a frame
await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .execute();

// Probe a file
const info = await ffmpeg.probe("video.mp4");
console.log(info.format.duration);

// Scale and trim
await ffmpeg.transform()
  .input("video.mp4")
  .scale({ width: 1280 })
  .trimStart(10)
  .duration(30)
  .output("clip.mp4")
  .execute();
\```

## Operations

### Extract
{Brief description + code example}

### Transform
{Brief description + code example}

### Audio
{Brief description + code example}

### Concat
{Brief description + code example}

### Export
{Brief description + code example}

### Overlay
{Brief description + code example}

### Text
{Brief description + code example}

### Subtitle
{Brief description + code example}

### Image
{Brief description + code example}

### Streaming (HLS / DASH)
{Brief description + code example}

### GIF
{Brief description + code example}

## Convenience Functions

### Pipeline
### Batch Processing
### Smart Transcode
### Thumbnail Sheet
### Waveform
### Silence Detection
### Quick Conversions (remux, compress, extractAudio, resize, imageToVideo)

## Custom Instances

\```typescript
import { createFFmpeg } from "ffmpeg-kit";

const ff = createFFmpeg({
  ffmpegPath: "/usr/local/bin/ffmpeg",
  tempDir: "/tmp/my-app",
  defaultTimeout: 300_000,
  defaultHwAccel: "cpu",
});
\```

## Filter Graph

\```typescript
import { filter, chain, filterGraph } from "ffmpeg-kit";

const f = filter("scale", { w: 1920, h: -2 });
const c = chain(filter("scale", { w: 1920, h: -2 }), filter("fps", { fps: 30 }));
\```

## Error Handling

\```typescript
import { FFmpegError, FFmpegErrorCode } from "ffmpeg-kit";

try {
  await ffmpeg.extract().input("missing.mp4").timestamp(0).output("out.png").execute();
} catch (e) {
  if (e instanceof FFmpegError) {
    console.log(e.code);    // FFmpegErrorCode.INPUT_NOT_FOUND
    console.log(e.stderr);  // Full ffmpeg stderr
    console.log(e.command); // The args that were passed
  }
}
\```

## Hardware Acceleration

\```typescript
const hw = await ffmpeg.detectHardware();
// { nvidia: true, vaapi: false, qsv: false, ... }

await ffmpeg.exportVideo()
  .input("video.mp4")
  .hwAccel("auto") // tries GPU, falls back to CPU
  .preset("youtube_hd")
  .output("output.mp4")
  .execute();
\```

## License

MIT
```

**Implementation Notes**:
- Each operation section should include a realistic 3–5 line code example using `ffmpeg.*` namespace
- Code examples must use actual API signatures from `src/sdk.ts` — verify against the real SDK methods
- Keep prose minimal, let code speak
- Use the INTERFACE.md as the source of truth for method signatures

**Acceptance Criteria**:
- [ ] README.md exists at project root
- [ ] All 11 operations have code examples
- [ ] Convenience functions section covers all 9 functions
- [ ] Installation, quick start, custom instances, error handling, and hardware sections present
- [ ] All code examples use correct API signatures (verified against src/sdk.ts)
- [ ] No broken markdown formatting

---

### Unit 5: GitHub Pages Site

**Files**:
- `.github/workflows/docs.yml` — GitHub Actions workflow for Pages deployment
- `docs/index.html` or equivalent — redirect or landing page

**Approach**: Use a simple GitHub Pages deployment from `docs/` branch or `docs/` folder. Since we already have comprehensive markdown docs in `docs/`, the simplest approach is to use a static site generator.

**Option A (Recommended)**: Use GitHub's built-in Jekyll support with `docs/` as source.

```yaml
# .github/workflows/docs.yml
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
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs
      - id: deployment
        uses: actions/deploy-pages@v4
```

**File**: `docs/index.md`

```markdown
---
title: ffmpeg-kit
---

# ffmpeg-kit

TypeScript SDK wrapping the FFmpeg CLI.

- [Architecture](ARCH.md)
- [Public API Reference](INTERFACE.md)
- [Testing](TESTING.md)
- [Roadmap](ROADMAP.md)

## Installation

\```bash
npm install ffmpeg-kit
\```

See the [README](https://github.com/nklisch/ffmpeg-kit#readme) for full documentation.
```

**Implementation Notes**:
- GitHub Pages needs to be enabled in repo settings (source: GitHub Actions)
- The `docs/` directory already contains ARCH.md, INTERFACE.md, TESTING.md, ROADMAP.md — these become the site
- Add a `docs/_config.yml` for Jekyll theme if desired

**Acceptance Criteria**:
- [ ] `.github/workflows/docs.yml` exists and is valid
- [ ] `docs/index.md` exists as the landing page
- [ ] After push to main, docs deploy to `https://nklisch.github.io/ffmpeg-kit`

---

### Unit 6: Build Verification & Test Hardening

No new files. This is a verification unit.

**Steps**:
1. `pnpm build` — verify clean build, no warnings
2. `pnpm check` — biome lint + typecheck, zero issues
3. `pnpm test` — all tests pass (run 3x consecutively to check flakiness)
4. `npm pack --dry-run` — verify tarball contents (only dist/, package.json, LICENSE, README.md)
5. Verify `dist/index.d.ts` exports all public types (spot check key types)
6. Verify `dist/index.js` bundle size is reasonable (< 200 KB)

**Acceptance Criteria**:
- [ ] `pnpm build` exits 0, no warnings
- [ ] `pnpm check` exits 0, zero warnings
- [ ] `pnpm test` passes 3 consecutive runs with 0 failures
- [ ] `npm pack --dry-run` shows only expected files
- [ ] Bundle size under 200 KB

---

### Unit 7: CI Update for Publish

**File**: `.github/workflows/ci.yml` (update existing)

Add a publish job triggered on git tags matching `v*`.

```yaml
# Add to existing ci.yml:
  publish:
    needs: [lint, typecheck, test]
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Implementation Notes**:
- Requires `NPM_TOKEN` secret configured in GitHub repo settings
- Uses `--provenance` for npm provenance attestation (requires `id-token: write`)
- `--access public` needed since it's not a scoped package (unscoped packages default to public, but explicit is safer)
- The publish job only runs when a `v*` tag is pushed, after lint/typecheck/test pass

**Acceptance Criteria**:
- [ ] CI publish job configured for tag-triggered releases
- [ ] Publish requires passing lint, typecheck, and test jobs
- [ ] Uses `--provenance` for supply chain security

---

### Unit 8: Version Tag & Publish

No files to write. This is the final manual step after all other units pass.

**Steps**:
1. Ensure all tests pass: `pnpm test`
2. Ensure build is clean: `pnpm build`
3. Verify pack output: `npm pack --dry-run`
4. Commit all Phase 12 changes
5. Tag: `git tag v0.1.0`
6. Push: `git push origin main --tags`
7. CI picks up the tag and publishes to npm

**Acceptance Criteria**:
- [ ] Git tag `v0.1.0` exists
- [ ] Package published to npm as `ffmpeg-kit@0.1.0`
- [ ] `npm info ffmpeg-kit` shows correct metadata

---

## Implementation Order

1. **Unit 3**: LICENSE — quick, unblocks `npm pack`
2. **Unit 2**: Package metadata — sets up package.json for publish
3. **Unit 1**: ROADMAP checkboxes — documentation accuracy
4. **Unit 4**: README.md — primary documentation (largest unit)
5. **Unit 5**: GitHub Pages — depends on README and docs being finalized
6. **Unit 7**: CI publish workflow — depends on package metadata
7. **Unit 6**: Build verification & test hardening — validates everything
8. **Unit 8**: Version tag & publish — final step after all verification

## Testing

No new test files required for Phase 12. Verification is:
- 3x consecutive `pnpm test` with 0 failures
- `npm pack --dry-run` tarball audit
- Manual verification of README code examples against actual API

## Verification Checklist

```bash
# Build
pnpm build

# Lint + typecheck
pnpm check

# Tests (run 3x)
pnpm test && pnpm test && pnpm test

# Pack audit
npm pack --dry-run

# Bundle size
ls -lh dist/index.js

# Verify key exports
node -e "import('ffmpeg-kit').then(m => console.log(Object.keys(m).length, 'exports'))"
```

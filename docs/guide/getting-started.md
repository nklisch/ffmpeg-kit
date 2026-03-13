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

Import the `ffmpeg` singleton and call any builder method:

```typescript
import { ffmpeg } from "ffmpeg-kit";

// Extract a frame at 5 seconds
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .execute();

console.log(result.outputPath); // "frame.png"
console.log(result.width, result.height); // dimensions from probe
```

The builder pattern guides you with autocomplete — no FFmpeg flags to memorize.

## Probing files

```typescript
const info = await ffmpeg.probe("video.mp4");

console.log(info.format.duration);  // duration in seconds
console.log(info.format.size);      // file size in bytes

const videoStream = info.streams.find(s => s.codec_type === "video");
console.log(videoStream?.width, videoStream?.height);
console.log(videoStream?.codec_name); // "h264"
```

Probe results are automatically cached by `(path, mtime)` — calling `probe()` twice
on the same unchanged file costs only a cache lookup.

## Error handling

Two styles are available:

```typescript
// Style 1: throw / catch
try {
  await ffmpeg.extract().input("missing.mp4").timestamp(0).output("out.png").execute();
} catch (e) {
  if (e instanceof FFmpegError) {
    console.log(e.code);    // FFmpegErrorCode.INPUT_NOT_FOUND
    console.log(e.stderr);  // raw FFmpeg stderr
  }
}

// Style 2: Result type — no try/catch
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .tryExecute();

if (result.success) {
  console.log(result.data.outputPath);
} else {
  console.error(result.error.code);
}
```

## What's next?

- [Tri-modal execution](/guide/execution) — understand `.toArgs()`, `.execute()`, `.tryExecute()`
- [Operations](/operations/extract) — browse all 11 builders
- [Error handling](/guide/errors) — handle failures gracefully
- [Hardware acceleration](/guide/hardware) — use GPU encoding

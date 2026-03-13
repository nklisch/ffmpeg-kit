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

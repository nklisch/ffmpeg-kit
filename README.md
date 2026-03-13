# ffmpeg-kit

TypeScript SDK wrapping the FFmpeg CLI. Fluent builders, hardware acceleration,
probe caching, batch processing.

**[Documentation](https://ffmpegkit.dev)** | **[GitHub](https://github.com/nklisch/ffmpeg-kit)**

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

```bash
npm install ffmpeg-kit
```

## Quick Start

```typescript
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
```

## Operations

### Extract

Extract frames or thumbnails from video.

```typescript
// Extract frame at timestamp (seconds, "HH:MM:SS", or percentage)
await ffmpeg.extract()
  .input("video.mp4")
  .timestamp("00:01:30")
  .size({ width: 640 })
  .format("jpg")
  .output("thumb.jpg")
  .execute();

// Best-representative thumbnail (scene detect)
await ffmpeg.extract()
  .input("video.mp4")
  .thumbnail()
  .output("thumb.png")
  .execute();
```

### Transform

Scale, crop, trim, speed, and apply video effects.

```typescript
await ffmpeg.transform()
  .input("video.mp4")
  .scale({ width: 1920, height: 1080 })
  .fit("contain")
  .trimStart("00:00:10")
  .duration(60)
  .fps(30)
  .output("out.mp4")
  .execute();

// Speed up, flip, rotate
await ffmpeg.transform()
  .input("video.mp4")
  .speed(2)
  .flipH()
  .rotate(90)
  .output("out.mp4")
  .execute();
```

### Audio

Mix, normalize, apply effects, and extract audio.

```typescript
// Normalize loudness and fade
await ffmpeg.audio()
  .input("audio.wav")
  .normalize({ targetLUFS: -16 })
  .fadeIn(1)
  .fadeOut(2)
  .output("normalized.wav")
  .execute();

// Extract and resample
await ffmpeg.audio()
  .input("video.mp4")
  .extractAudio({ codec: "aac", bitrate: "192k" })
  .resample({ sampleRate: 44100 })
  .output("audio.aac")
  .execute();
```

### Concat

Join multiple clips with optional transitions.

```typescript
// Simple concat (no re-encode)
await ffmpeg.concat()
  .addClip("clip1.mp4")
  .addClip("clip2.mp4")
  .addClip("clip3.mp4")
  .output("joined.mp4")
  .execute();

// With crossfade transitions
await ffmpeg.concat()
  .addClip({ path: "clip1.mp4" })
  .addClip({ path: "clip2.mp4" })
  .defaultTransition({ type: "xfade", duration: 0.5, effect: "fade" })
  .normalizeResolution(1920, 1080)
  .output("with-transitions.mp4")
  .execute();
```

### Export

Re-encode with quality presets and codec control.

```typescript
// YouTube preset
await ffmpeg.exportVideo()
  .input("raw.mp4")
  .preset("youtube_1080p")
  .faststart()
  .output("youtube.mp4")
  .execute();

// Custom encoding with separate audio
await ffmpeg.exportVideo()
  .videoInput("video.mp4")
  .audioInput("audio.wav")
  .videoCodec("h264")
  .crf(20)
  .audioBitrate("192k")
  .output("final.mp4")
  .execute();
```

### Overlay

Composite images or videos over a base.

```typescript
// Watermark in top-right corner
await ffmpeg.overlay()
  .base("video.mp4")
  .watermark({ input: "logo.png", position: "top-right", opacity: 0.8 })
  .output("watermarked.mp4")
  .execute();

// Picture-in-picture
await ffmpeg.overlay()
  .base("main.mp4")
  .pip({ input: "webcam.mp4", position: "bottom-right", scale: 0.25 })
  .output("pip.mp4")
  .execute();
```

### Text

Burn text overlays using FFmpeg's drawtext filter.

```typescript
await ffmpeg.text()
  .input("video.mp4")
  .addText({
    text: "Hello World",
    anchor: "bottom-center",
    margin: 40,
    style: { fontSize: 48, fontColor: "white", box: true, boxColor: "black@0.5" },
    startTime: 1,
    endTime: 5,
  })
  .output("titled.mp4")
  .execute();
```

### Subtitle

Embed or burn subtitles into video.

```typescript
// Soft subtitles (selectable in player)
await ffmpeg.subtitle()
  .input("video.mp4")
  .softSub({ path: "subs.srt", language: "en" })
  .output("with-subs.mkv")
  .execute();

// Hard-burned subtitles
await ffmpeg.subtitle()
  .input("video.mp4")
  .hardBurn({ path: "subs.ass" })
  .output("burned.mp4")
  .execute();
```

### Image

Convert images, create slideshows, and generate test patterns.

```typescript
// Convert image format
await ffmpeg.image()
  .input("photo.jpg")
  .convert("webp")
  .resize({ width: 800 })
  .output("photo.webp")
  .execute();

// Image to video clip
await ffmpeg.image()
  .input("photo.jpg")
  .toVideo({ duration: 5, fps: 30 })
  .output("slide.mp4")
  .execute();
```

### Streaming (HLS / DASH)

Package video for adaptive streaming.

```typescript
// HLS packaging
await ffmpeg.hls()
  .input("video.mp4")
  .segmentDuration(6)
  .playlistType("vod")
  .segmentType("fmp4")
  .output("stream/index.m3u8")
  .execute();

// DASH manifest
await ffmpeg.dash()
  .input("video.mp4")
  .segmentDuration(4)
  .output("stream/manifest.mpd")
  .execute();
```

### GIF

Create optimized animated GIFs.

```typescript
await ffmpeg.gif()
  .input("video.mp4")
  .trimStart(10)
  .duration(3)
  .size({ width: 480 })
  .fps(15)
  .optimizePalette()
  .output("clip.gif")
  .execute();
```

## Convenience Functions

### Pipeline

Chain operations with automatic temp file management.

```typescript
const result = await ffmpeg.pipeline()
  .step("scale", (deps) =>
    transform(deps).input("input.mp4").scale({ width: 1280 }).output("$tmp"))
  .step("export", (deps) =>
    exportVideo(deps).input("$prev").preset("youtube_1080p").output("output.mp4"))
  .execute();
```

### Batch Processing

Process multiple files concurrently.

```typescript
const result = await ffmpeg.batch({
  items: ["a.mp4", "b.mp4", "c.mp4"],
  concurrency: 2,
  process: async (item) => {
    await ffmpeg.transform()
      .input(item)
      .scale({ width: 720 })
      .output(item.replace(".mp4", "-720p.mp4"))
      .execute();
  },
});
console.log(result.succeeded, result.failed);
```

### Smart Transcode

Probe first, re-encode only if needed.

```typescript
const result = await ffmpeg.smartTranscode({
  input: "video.mp4",
  output: "output.mp4",
  targetCodec: "h264",
  targetBitrate: "2M",
});
console.log(result.action); // "copy" | "transcode"
```

### Thumbnail Sheet

Generate a grid of preview thumbnails.

```typescript
const result = await ffmpeg.thumbnailSheet({
  input: "video.mp4",
  output: "sheet.jpg",
  columns: 4,
  rows: 3,
  width: 320,
});
console.log(result.count); // number of thumbnails
```

### Waveform

Extract amplitude data for visualization.

```typescript
const result = await ffmpeg.waveform({
  input: "audio.wav",
  fps: 10,
});
console.log(result.samples); // Float32Array of amplitude values
```

### Silence Detection

Find and remove silent regions.

```typescript
const silences = await ffmpeg.detectSilence("audio.wav", {
  threshold: -40,
  duration: 0.5,
});
// [{ start: 0, end: 1.2 }, ...]

await ffmpeg.trimSilence({
  input: "audio.wav",
  output: "trimmed.wav",
  threshold: -40,
});
```

### Quick Conversions

One-liner helpers for common tasks.

```typescript
await ffmpeg.remux("input.mp4", "output.mkv");
await ffmpeg.compress("input.mp4", "compressed.mp4", { crf: 28 });
await ffmpeg.extractAudio("video.mp4", "audio.mp3", { codec: "mp3" });
await ffmpeg.resize("input.mp4", "output.mp4", { width: 1280 });
await ffmpeg.imageToVideo("photo.jpg", "slide.mp4", { duration: 5 });
```

## Custom Instances

```typescript
import { createFFmpeg } from "ffmpeg-kit";

const ff = createFFmpeg({
  ffmpegPath: "/usr/local/bin/ffmpeg",
  ffprobePath: "/usr/local/bin/ffprobe",
  tempDir: "/tmp/my-app",
  defaultTimeout: 300_000,
  defaultHwAccel: "cpu",
  logLevel: "warning",
});
```

## Filter Graph

Low-level filter string builders for advanced use.

```typescript
import { filter, chain, filterGraph } from "ffmpeg-kit";

// Single filter
const f = filter("scale", { w: 1920, h: -2 });
// → "scale=w=1920:h=-2"

// Chained filters
const c = chain(
  filter("scale", { w: 1920, h: -2 }),
  filter("fps", { fps: 30 }),
);
// → "scale=w=1920:h=-2,fps=fps=30"
```

## Error Handling

```typescript
import { FFmpegError, FFmpegErrorCode } from "ffmpeg-kit";

try {
  await ffmpeg.extract()
    .input("missing.mp4")
    .timestamp(0)
    .output("out.png")
    .execute();
} catch (e) {
  if (e instanceof FFmpegError) {
    console.log(e.code);    // FFmpegErrorCode.INPUT_NOT_FOUND
    console.log(e.stderr);  // Full ffmpeg stderr
    console.log(e.command); // The args that were passed
  }
}

// Result-type style (no try/catch)
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .tryExecute();

if (result.success) {
  console.log(result.data.size);
} else {
  console.error(result.error.code);
}
```

## Hardware Acceleration

```typescript
const hw = await ffmpeg.detectHardware();
// { nvidia: true, vaapi: false, qsv: false, ... }

await ffmpeg.exportVideo()
  .input("video.mp4")
  .hwAccel("auto")   // tries GPU, falls back to CPU
  .preset("youtube_1080p")
  .output("output.mp4")
  .execute();
```

## License

MIT

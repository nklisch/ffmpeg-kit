---
outline: deep
---

# Quick Helpers

One-liner convenience functions for the most common FFmpeg tasks.
These wrap the full builders with sensible defaults for simple use cases.

## Available helpers

### `ffmpeg.remux(input, output)`

Copy all streams to a new container without re-encoding. Useful for format conversion
when the codec is already compatible with the target container.

```typescript
// MKV → MP4 without re-encoding (instant, lossless)
await ffmpeg.remux("video.mkv", "video.mp4");

// MP4 → MKV
await ffmpeg.remux("video.mp4", "video.mkv");
```

### `ffmpeg.compress(input, output, options?)`

Re-encode with a CRF for smaller file size.

```typescript
await ffmpeg.compress("large.mp4", "small.mp4", { crf: 28 });

// Custom options
await ffmpeg.compress("input.mp4", "output.mp4", {
  crf: 23,
  codec: "h265",
  audioBitrate: "128k",
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `crf` | `number` | `28` | Constant Rate Factor |
| `codec` | `string` | `"h264"` | Video codec |
| `audioBitrate` | `string` | `"128k"` | Audio bitrate |

### `ffmpeg.extractAudio(input, output, options?)`

Extract audio track to a standalone audio file.

```typescript
await ffmpeg.extractAudio("video.mp4", "audio.mp3");

// With options
await ffmpeg.extractAudio("video.mp4", "audio.aac", { codec: "aac", bitrate: "192k" });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `codec` | `string` | inferred from output ext | Audio codec |
| `bitrate` | `string` | `"192k"` | Audio bitrate |

### `ffmpeg.resize(input, output, options)`

Scale video to a target resolution.

```typescript
await ffmpeg.resize("4k.mp4", "1080p.mp4", { width: 1920 });
await ffmpeg.resize("wide.mp4", "square.mp4", { width: 1080, height: 1080, fit: "cover" });
```

| Option | Type | Description |
|--------|------|-------------|
| `width` | `number` | Target width |
| `height` | `number` | Target height (optional, maintains ratio) |
| `fit` | `"contain" \| "cover" \| "fill"` | How to handle aspect ratio |

### `ffmpeg.imageToVideo(input, output, options?)`

Convert a static image to a video clip of fixed duration.

```typescript
await ffmpeg.imageToVideo("photo.jpg", "slide.mp4", { duration: 5 });
await ffmpeg.imageToVideo("slide.png", "clip.mp4", { duration: 10, fps: 30 });
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `duration` | `number` | `5` | Duration in seconds |
| `fps` | `number` | `30` | Output frame rate |

## When to use helpers vs builders

Use helpers when the defaults are fine and you just need a quick operation.
Drop to builders when you need more control:

```typescript
// Helper — simple and fine for most cases
await ffmpeg.compress("input.mp4", "output.mp4", { crf: 26 });

// Builder — when you need more control
await ffmpeg.exportVideo()
  .input("input.mp4")
  .videoCodec("h264")
  .crf(26)
  .audioBitrate("192k")
  .pixelFormat("yuv420p")
  .faststart()
  .hwAccel("auto")
  .output("output.mp4")
  .execute();
```

## Related

- [Export](/operations/export) — full export builder with presets
- [Transform](/operations/transform) — scale, trim, and more
- [Audio](/operations/audio) — audio processing

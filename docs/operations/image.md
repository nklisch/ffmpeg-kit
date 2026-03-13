---
outline: deep
---

# Image

Convert images, resize, create slideshows, and generate test patterns.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

// Convert image format
await ffmpeg.image()
  .input("photo.jpg")
  .convert("webp")
  .resize({ width: 800 })
  .output("photo.webp")
  .execute();
```

## API

### `.input(path)`

Input image or image sequence. Required.

For image sequences, use a glob-style path: `"frames/%04d.png"`

### `.convert(format)`

Target image format: `"jpg"` | `"png"` | `"webp"` | `"avif"` | `"tiff"`

### `.resize(options)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `width` | `number` | Target width in pixels |
| `height` | `number` | Target height in pixels |

Omit one dimension for proportional scaling.

### `.quality(q)`

Output quality for lossy formats (JPEG, WebP).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | `number` | `85` | Quality 1–100 |

### `.toVideo(options)`

Convert an image (or image sequence) to a video clip.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `duration` | `number` | `5` | Duration in seconds (single image) |
| `fps` | `number` | `30` | Output frame rate |

### `.fromVideo(options)`

Extract all frames from a video as an image sequence.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fps` | `number` | — | Frames per second to extract (omit for all frames) |
| `format` | `string` | `"png"` | Output image format |

### `.output(path)`

Output file path. Required.

## Examples

### Convert and resize

```typescript
await ffmpeg.image()
  .input("photo.jpg")
  .convert("webp")
  .resize({ width: 1200 })
  .quality(80)
  .output("photo.webp")
  .execute();
```

### Image to video clip

```typescript
// Useful for slideshows or as input to concat()
await ffmpeg.image()
  .input("slide.png")
  .toVideo({ duration: 5, fps: 30 })
  .output("slide.mp4")
  .execute();
```

### Extract frames from video

```typescript
await ffmpeg.image()
  .input("video.mp4")
  .fromVideo({ fps: 1, format: "jpg" })  // 1 frame per second
  .output("frames/%04d.jpg")
  .execute();
```

### Process image sequence into video

```typescript
// frames/0001.png, frames/0002.png, ...
await ffmpeg.image()
  .input("frames/%04d.png")
  .toVideo({ fps: 24 })
  .output("animation.mp4")
  .execute();
```

## Result type

```typescript
interface ImageResult {
  outputPath: string;
  width: number;
  height: number;
  size: number;
  format: string;
  frameCount?: number;  // for fromVideo operations
  probeResult: ProbeResult;
}
```

## Related

- [Extract](/operations/extract) — extract a single frame at a timestamp
- [Concat](/operations/concat) — join image-to-video clips into a slideshow
- [Thumbnail Sheet](/operations/thumbnail-sheet) — generate a grid of preview thumbnails

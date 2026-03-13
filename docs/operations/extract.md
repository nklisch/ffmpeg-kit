---
outline: deep
---

# Extract

Extract frames or thumbnails from video.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .size({ width: 640 })
  .format("jpg")
  .output("thumb.jpg")
  .execute();

console.log(result.outputPath); // "thumb.jpg"
console.log(result.width, result.height); // 640, 360
```

## API

### `.input(path)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Path to the input video file |

### `.timestamp(t)`

Time at which to extract the frame.

| Parameter | Type | Description |
|-----------|------|-------------|
| `t` | `number \| string` | Seconds (`5`), timecode (`"00:01:30"`), or percentage (`"50%"`) |

### `.thumbnail()`

Instead of a fixed timestamp, use FFmpeg's scene-change detection to find
the most representative frame. Ignores `.timestamp()` if set.

### `.size(options)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | `number` | — | Output width in pixels |
| `height` | `number` | — | Output height in pixels |

Omit one dimension to maintain aspect ratio. Omit both to use source dimensions.

### `.format(fmt)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `fmt` | `"jpg" \| "png" \| "webp"` | `"jpg"` | Output image format |

### `.quality(q)`

JPEG/WebP quality.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | `number` | `85` | Quality 1–100 |

### `.output(path)`

Output file path. Required.

## Examples

### Extract frame at specific timestamp

```typescript
await ffmpeg.extract()
  .input("video.mp4")
  .timestamp("00:01:30")
  .size({ width: 1280, height: 720 })
  .format("jpg")
  .quality(90)
  .output("frame.jpg")
  .execute();
```

### Best representative thumbnail

```typescript
await ffmpeg.extract()
  .input("video.mp4")
  .thumbnail()
  .size({ width: 640 })
  .format("webp")
  .output("thumb.webp")
  .execute();
```

### Extract at percentage of duration

```typescript
// Extract frame at 25% through the video
await ffmpeg.extract()
  .input("video.mp4")
  .timestamp("25%")
  .output("quarter.png")
  .execute();
```

## Result type

```typescript
interface ExtractResult {
  outputPath: string;
  width: number;
  height: number;
  size: number;        // file size in bytes
  probeResult: ProbeResult;
}
```

## Related

- [Transform](/operations/transform) — scale, crop, trim video
- [Thumbnail Sheet](/operations/thumbnail-sheet) — generate a grid of thumbnails
- [Probe API](/api/probe) — probe files without extraction

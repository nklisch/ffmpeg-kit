---
outline: deep
---

# GIF

Create optimized animated GIFs with palette optimization for best quality.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

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

## API

### `.input(path)`

Input video file. Required.

### `.trimStart(t)`

Start time for the GIF clip.

| Parameter | Type | Description |
|-----------|------|-------------|
| `t` | `number \| string` | Seconds or timecode `"HH:MM:SS"` |

### `.duration(seconds)`

Duration of the GIF in seconds.

### `.size(options)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `width` | `number` | Output width (height scales proportionally) |

### `.fps(rate)`

Frame rate of the output GIF. Lower = smaller file size.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `rate` | `number` | `10` | Frames per second |

### `.optimizePalette()`

Use FFmpeg's two-pass palette generation for dramatically better color accuracy.
Highly recommended — the quality difference is significant.

The two passes are:
1. `palettegen` — analyze the source frames to build an optimal 256-color palette
2. `paletteuse` — dither the output using the generated palette

### `.loop(count)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `count` | `number` | `0` | Number of loops (0 = infinite) |

### `.output(path)`

Output `.gif` file path. Required.

## Examples

### Short reaction clip

```typescript
await ffmpeg.gif()
  .input("video.mp4")
  .trimStart(5.5)
  .duration(2)
  .size({ width: 320 })
  .fps(12)
  .optimizePalette()
  .output("reaction.gif")
  .execute();
```

### High-quality GIF

```typescript
await ffmpeg.gif()
  .input("animation.mp4")
  .size({ width: 800 })
  .fps(24)
  .optimizePalette()
  .loop(0)           // infinite loop
  .output("hq.gif")
  .execute();
```

### Small file size GIF

```typescript
await ffmpeg.gif()
  .input("screen-recording.mp4")
  .size({ width: 640 })
  .fps(8)
  .output("small.gif")
  .execute();
```

## Result type

```typescript
interface GifResult {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  size: number;
  probeResult: ProbeResult;
}
```

## Related

- [Transform](/operations/transform) — trim source video before creating GIF
- [Extract](/operations/extract) — extract a still frame instead of animated GIF

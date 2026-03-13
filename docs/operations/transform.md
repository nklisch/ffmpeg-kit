---
outline: deep
---

# Transform

Scale, crop, trim, adjust speed, and apply geometric effects to video.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

await ffmpeg.transform()
  .input("video.mp4")
  .scale({ width: 1920, height: 1080 })
  .trimStart("00:00:10")
  .duration(60)
  .output("clip.mp4")
  .execute();
```

## API

### `.input(path)`

Input video file path. Required.

### `.scale(options)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | `number` | — | Target width in pixels |
| `height` | `number` | — | Target height in pixels |

Omit one dimension for proportional scaling.

### `.fit(mode)`

How to handle aspect ratio mismatch when both `width` and `height` are specified.

| Value | Description |
|-------|-------------|
| `"contain"` | Fit within dimensions, letterbox/pillarbox as needed |
| `"cover"` | Fill dimensions, crop edges |
| `"fill"` | Stretch to exact dimensions (distorts) |
| `"crop"` | Center-crop to exact dimensions |

### `.trimStart(t)`

Start time for the output clip.

| Parameter | Type | Description |
|-----------|------|-------------|
| `t` | `number \| string` | Seconds or timecode `"HH:MM:SS"` |

### `.trimEnd(t)`

End time for the output clip.

### `.duration(seconds)`

Duration of the output clip in seconds. Cannot be combined with `.trimEnd()`.

### `.fps(rate)`

Output frame rate.

### `.speed(factor)`

Playback speed multiplier. `2` = double speed, `0.5` = half speed.

### `.rotate(degrees)`

| Value | Description |
|-------|-------------|
| `90` | Rotate 90° clockwise |
| `180` | Rotate 180° |
| `270` | Rotate 270° clockwise (90° counter-clockwise) |

### `.flipH()` / `.flipV()`

Horizontal or vertical flip.

### `.crop(options)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `width` | `number` | Crop width in pixels |
| `height` | `number` | Crop height in pixels |
| `x` | `number` | Left offset (default: center) |
| `y` | `number` | Top offset (default: center) |

### `.output(path)`

Output file path. Required.

## Examples

### Scale and crop for social media

```typescript
// Instagram square crop from 16:9 video
await ffmpeg.transform()
  .input("landscape.mp4")
  .scale({ width: 1080, height: 1080 })
  .fit("cover")
  .output("square.mp4")
  .execute();
```

### Speed up and flip

```typescript
await ffmpeg.transform()
  .input("slow.mp4")
  .speed(2)
  .flipH()
  .output("fast-flipped.mp4")
  .execute();
```

### Trim a segment

```typescript
await ffmpeg.transform()
  .input("long-video.mp4")
  .trimStart("00:01:00")
  .trimEnd("00:02:30")
  .output("segment.mp4")
  .execute();
```

## Result type

```typescript
interface TransformResult {
  outputPath: string;
  width: number;
  height: number;
  duration: number;
  size: number;
  probeResult: ProbeResult;
}
```

## Related

- [Extract](/operations/extract) — extract frames
- [Export](/operations/export) — re-encode with quality presets
- [Pipeline](/guide/pipeline) — chain multiple transforms

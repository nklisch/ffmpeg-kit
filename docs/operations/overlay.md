---
outline: deep
---

# Overlay

Composite images or videos over a base video — watermarks, picture-in-picture,
chroma key, and more.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

await ffmpeg.overlay()
  .base("video.mp4")
  .watermark({ input: "logo.png", position: "top-right", opacity: 0.8 })
  .output("watermarked.mp4")
  .execute();
```

## API

### `.base(path)`

Base video to overlay onto. Required.

### `.watermark(options)`

Add a static image overlay (logo, bug, watermark).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Path to the watermark image |
| `position` | `OverlayPosition` | `"top-right"` | Where to place the watermark |
| `opacity` | `number` | `1.0` | Opacity 0–1 |
| `margin` | `number` | `10` | Margin from edges in pixels |
| `scale` | `number` | — | Scale factor relative to video width |

**`OverlayPosition`:** `"top-left"` | `"top-right"` | `"bottom-left"` | `"bottom-right"` | `"center"`

### `.pip(options)`

Picture-in-picture: place a video over the base.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | PiP video path |
| `position` | `OverlayPosition` | `"bottom-right"` | Where to place the PiP |
| `scale` | `number` | `0.25` | PiP size as fraction of base width |
| `margin` | `number` | `10` | Margin from edges |

### `.chromaKey(options)`

Remove a solid-color background (green screen / chroma key).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Foreground video with chroma key background |
| `color` | `string` | `"green"` | Key color (hex or name) |
| `similarity` | `number` | `0.1` | Color similarity threshold 0–1 |
| `blend` | `number` | `0.0` | Edge blending 0–1 |

### `.output(path)`

Output file path. Required.

## Examples

### Logo watermark

```typescript
await ffmpeg.overlay()
  .base("video.mp4")
  .watermark({
    input: "logo.png",
    position: "bottom-right",
    opacity: 0.7,
    margin: 20,
  })
  .output("branded.mp4")
  .execute();
```

### Picture-in-picture

```typescript
await ffmpeg.overlay()
  .base("presentation.mp4")
  .pip({
    input: "webcam.mp4",
    position: "bottom-right",
    scale: 0.2,
    margin: 16,
  })
  .output("pip.mp4")
  .execute();
```

### Green screen composite

```typescript
await ffmpeg.overlay()
  .base("background.mp4")
  .chromaKey({
    input: "presenter-greenscreen.mp4",
    color: "#00ff00",
    similarity: 0.15,
    blend: 0.05,
  })
  .output("composite.mp4")
  .execute();
```

## Result type

```typescript
interface OverlayResult {
  outputPath: string;
  width: number;
  height: number;
  duration: number;
  size: number;
  probeResult: ProbeResult;
}
```

## Related

- [Text](/operations/text) — burn text overlays
- [Transform](/operations/transform) — scale and crop the base video

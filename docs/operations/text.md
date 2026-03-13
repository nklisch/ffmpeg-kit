---
outline: deep
---

# Text

Burn text overlays into video using FFmpeg's `drawtext` filter.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

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

## API

### `.input(path)`

Input video file. Required.

### `.addText(options)`

Add a text overlay. Can be called multiple times for multiple overlays.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `text` | `string` | — | Text content to render |
| `anchor` | `TextAnchor` | `"bottom-center"` | Position anchor |
| `margin` | `number` | `20` | Offset from anchor in pixels |
| `x` | `number` | — | Absolute X position (overrides anchor) |
| `y` | `number` | — | Absolute Y position (overrides anchor) |
| `startTime` | `number` | `0` | When the text appears (seconds) |
| `endTime` | `number` | — | When the text disappears (seconds, omit for permanent) |
| `style` | `TextStyle` | — | Font and appearance options |

**`TextAnchor`:** `"top-left"` | `"top-center"` | `"top-right"` | `"center"` | `"bottom-left"` | `"bottom-center"` | `"bottom-right"`

**`TextStyle`:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `fontSize` | `number` | `24` | Font size in points |
| `fontColor` | `string` | `"white"` | Font color (name or hex) |
| `fontFile` | `string` | — | Path to .ttf font file |
| `fontFamily` | `string` | — | System font family name |
| `bold` | `boolean` | `false` | Bold weight |
| `box` | `boolean` | `false` | Draw background box |
| `boxColor` | `string` | `"black@0.5"` | Box background color |
| `boxBorderWidth` | `number` | `5` | Box padding in pixels |
| `shadowX` | `number` | — | Drop shadow X offset |
| `shadowY` | `number` | — | Drop shadow Y offset |
| `shadowColor` | `string` | `"black"` | Drop shadow color |

### `.output(path)`

Output file path. Required.

## Examples

### Timed caption

```typescript
await ffmpeg.text()
  .input("video.mp4")
  .addText({
    text: "Chapter 1: Introduction",
    anchor: "top-left",
    margin: 30,
    startTime: 0,
    endTime: 3,
    style: { fontSize: 36, fontColor: "white", shadowX: 2, shadowY: 2 },
  })
  .output("captioned.mp4")
  .execute();
```

### Multiple text overlays

```typescript
await ffmpeg.text()
  .input("video.mp4")
  .addText({
    text: "LIVE",
    anchor: "top-right",
    margin: 20,
    style: { fontSize: 24, fontColor: "red", bold: true },
  })
  .addText({
    text: "Speaker Name",
    anchor: "bottom-left",
    margin: 30,
    style: { fontSize: 32, fontColor: "white", box: true, boxColor: "black@0.6" },
  })
  .output("broadcast.mp4")
  .execute();
```

## Result type

```typescript
interface TextResult {
  outputPath: string;
  width: number;
  height: number;
  duration: number;
  size: number;
  probeResult: ProbeResult;
}
```

## Related

- [Subtitle](/operations/subtitle) — SRT/ASS subtitle tracks
- [Overlay](/operations/overlay) — image/video compositing

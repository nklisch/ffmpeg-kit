---
outline: deep
---

# Concat

Join multiple video or audio clips into a single output, with optional transitions.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

await ffmpeg.concat()
  .addClip("clip1.mp4")
  .addClip("clip2.mp4")
  .addClip("clip3.mp4")
  .output("joined.mp4")
  .execute();
```

## API

### `.addClip(clip)`

Add a clip to the concat sequence.

| Parameter | Type | Description |
|-----------|------|-------------|
| `clip` | `string \| ClipOptions` | File path or options object |

**`ClipOptions`:**

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | File path |
| `trimStart` | `number \| string` | Start offset in the clip |
| `trimEnd` | `number \| string` | End offset in the clip |
| `duration` | `number` | Duration to use from the clip |

### `.defaultTransition(options)`

Apply the same transition between all clips.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `"xfade" \| "none"` | Transition type |
| `duration` | `number` | Transition duration in seconds |
| `effect` | `XfadeEffect` | FFmpeg xfade effect name |

### `.transition(index, options)`

Apply a transition between specific clips (0 = between clip 0 and clip 1).

### `.normalizeResolution(width, height)`

Scale all clips to the specified resolution before joining. Prevents concat
failures when clips have different resolutions.

### `.output(path)`

Output file path. Required.

## Examples

### Simple concat (no re-encode)

When all clips have the same codec, resolution, and frame rate, concat is fast
and lossless:

```typescript
await ffmpeg.concat()
  .addClip("intro.mp4")
  .addClip("main.mp4")
  .addClip("outro.mp4")
  .output("final.mp4")
  .execute();
```

### With crossfade transitions

```typescript
await ffmpeg.concat()
  .addClip({ path: "clip1.mp4" })
  .addClip({ path: "clip2.mp4" })
  .addClip({ path: "clip3.mp4" })
  .defaultTransition({ type: "xfade", duration: 0.5, effect: "fade" })
  .output("with-transitions.mp4")
  .execute();
```

### Mixed resolution clips

```typescript
await ffmpeg.concat()
  .addClip("4k-clip.mp4")
  .addClip("1080p-clip.mp4")
  .normalizeResolution(1920, 1080)
  .output("normalized.mp4")
  .execute();
```

### Trim clips during concat

```typescript
await ffmpeg.concat()
  .addClip({ path: "long.mp4", trimStart: "00:01:00", duration: 30 })
  .addClip({ path: "other.mp4", trimStart: 5, trimEnd: 25 })
  .output("combined.mp4")
  .execute();
```

## Result type

```typescript
interface ConcatResult {
  outputPath: string;
  duration: number;
  clipCount: number;
  size: number;
  probeResult: ProbeResult;
}
```

## Related

- [Transform](/operations/transform) — trim and scale individual clips
- [Export](/operations/export) — re-encode after concat

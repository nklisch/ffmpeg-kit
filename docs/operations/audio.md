---
outline: deep
---

# Audio

Mix, normalize, apply effects, and extract audio tracks.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

await ffmpeg.audio()
  .input("podcast.wav")
  .normalize({ targetLUFS: -16 })
  .fadeIn(1)
  .fadeOut(2)
  .output("normalized.wav")
  .execute();
```

## API

### `.input(path)`

Input file path. Required.

### `.normalize(options)`

EBU R128 loudness normalization.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `targetLUFS` | `number` | `-16` | Target integrated loudness in LUFS |
| `targetTP` | `number` | `-1.5` | Max true peak in dBTP |
| `targetLRA` | `number` | `7` | Max loudness range in LU |

### `.fadeIn(duration)` / `.fadeOut(duration)`

Audio fade in/out.

| Parameter | Type | Description |
|-----------|------|-------------|
| `duration` | `number` | Fade duration in seconds |

### `.extractAudio(options)`

Extract audio from a video file to a standalone audio file.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `codec` | `string` | `"aac"` | Output audio codec |
| `bitrate` | `string` | `"192k"` | Audio bitrate |

### `.resample(options)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `sampleRate` | `number` | Target sample rate in Hz (e.g., `44100`, `48000`) |

### `.channels(n)`

Set output channel count. `1` = mono, `2` = stereo, `6` = 5.1.

### `.trim(options)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `start` | `number` | Start time in seconds |
| `end` | `number` | End time in seconds |

### `.output(path)`

Output file path. Required.

## Examples

### Normalize podcast audio

```typescript
await ffmpeg.audio()
  .input("raw-podcast.wav")
  .normalize({ targetLUFS: -16 })
  .fadeIn(0.5)
  .fadeOut(1)
  .resample({ sampleRate: 44100 })
  .output("final-podcast.mp3")
  .execute();
```

### Extract audio from video

```typescript
await ffmpeg.audio()
  .input("video.mp4")
  .extractAudio({ codec: "aac", bitrate: "192k" })
  .output("audio.aac")
  .execute();
```

### Convert to mono and resample

```typescript
await ffmpeg.audio()
  .input("stereo.wav")
  .channels(1)
  .resample({ sampleRate: 16000 })
  .output("mono-16k.wav")
  .execute();
```

## Result type

```typescript
interface AudioResult {
  outputPath: string;
  duration: number;
  sampleRate: number;
  channels: number;
  size: number;
  probeResult: ProbeResult;
  // For normalize operations:
  inputLUFS?: number;
  outputLUFS?: number;
}
```

## Related

- [Waveform](/operations/waveform) — extract amplitude data for visualization
- [Silence Detection](/operations/silence) — detect and trim silent regions
- [Export](/operations/export) — re-encode video with audio settings

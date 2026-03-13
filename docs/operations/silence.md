---
outline: deep
---

# Silence Detection

Detect and optionally trim silent regions from audio and video files.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

// Detect silent regions
const silences = await ffmpeg.detectSilence("audio.wav", {
  threshold: -40,
  duration: 0.5,
});

console.log(silences);
// [{ start: 0, end: 1.2 }, { start: 45.3, end: 46.1 }, ...]
```

## `detectSilence()`

Find all silent regions in a file.

### Function signature

```typescript
function detectSilence(
  input: string,
  options?: DetectSilenceOptions,
): Promise<SilenceRegion[]>;
```

### Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `threshold` | `number` | `-40` | Silence threshold in dBFS |
| `duration` | `number` | `0.5` | Minimum silence duration in seconds |

### Return type

```typescript
interface SilenceRegion {
  start: number;   // start time in seconds
  end: number;     // end time in seconds
  duration: number; // = end - start
}
```

## `trimSilence()`

Remove silent regions from a file.

### Function signature

```typescript
function trimSilence(options: TrimSilenceOptions): Promise<TrimSilenceResult>;
```

### Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Input file path |
| `output` | `string` | — | Output file path |
| `threshold` | `number` | `-40` | Silence threshold in dBFS |
| `duration` | `number` | `0.5` | Min silence duration to remove |
| `padding` | `number` | `0.1` | Silence padding to keep around speech |
| `trimStart` | `boolean` | `true` | Trim silence at the start |
| `trimEnd` | `boolean` | `true` | Trim silence at the end |
| `trimMiddle` | `boolean` | `false` | Also remove internal silences |

### Result type

```typescript
interface TrimSilenceResult {
  outputPath: string;
  originalDuration: number;
  outputDuration: number;
  removedDuration: number;   // originalDuration - outputDuration
  silenceRegions: SilenceRegion[];
  probeResult: ProbeResult;
}
```

## Examples

### Trim leading and trailing silence

```typescript
const result = await ffmpeg.trimSilence({
  input: "recording.wav",
  output: "trimmed.wav",
  threshold: -50,
  duration: 0.3,
  trimStart: true,
  trimEnd: true,
  trimMiddle: false,
});

console.log(`Removed ${result.removedDuration.toFixed(1)}s of silence`);
```

### Remove all silences (for condensed audio)

```typescript
const result = await ffmpeg.trimSilence({
  input: "lecture.mp3",
  output: "condensed.mp3",
  threshold: -40,
  duration: 1.0,
  padding: 0.15,
  trimMiddle: true,
});
```

### Detect silences first, then decide

```typescript
const silences = await ffmpeg.detectSilence("interview.wav", {
  threshold: -45,
  duration: 2.0,
});

if (silences.length > 0) {
  console.log(`Found ${silences.length} long pauses`);
  // decide whether to trim based on content
}
```

## Related

- [Audio](/operations/audio) — normalize loudness
- [Waveform](/operations/waveform) — visualize audio amplitude

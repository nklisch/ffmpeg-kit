---
outline: deep
---

# Waveform

Extract audio amplitude data for visualization — useful for building waveform
displays in audio/video editors and players.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

const result = await ffmpeg.waveform({
  input: "audio.wav",
  fps: 10,
});

console.log(result.samples);    // Float32Array of amplitude values
console.log(result.sampleRate); // Samples per second (same as fps)
console.log(result.duration);   // Total duration in seconds
```

## Function signature

```typescript
function waveform(options: WaveformOptions): Promise<WaveformResult>;
```

## Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Input audio or video file path |
| `fps` | `number` | `10` | Samples per second in the output data |
| `channel` | `number \| "mix"` | `"mix"` | Channel to extract (`0` = left, `1` = right, `"mix"` = downmix) |
| `normalize` | `boolean` | `true` | Normalize amplitude values to [-1, 1] range |

## Result type

```typescript
interface WaveformResult {
  samples: Float32Array;   // amplitude values, one per (1/fps) seconds
  sampleRate: number;      // = fps
  duration: number;        // total audio duration in seconds
  channels: number;        // channel count of source audio
  peakAmplitude: number;   // max absolute value in samples
}
```

## Rendering a waveform

The `samples` array has one value per `1/fps` seconds. For a 60-second file at
`fps: 10`, you get 600 samples.

```typescript
const result = await ffmpeg.waveform({ input: "podcast.mp3", fps: 20 });

// Canvas-based rendering example
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const { samples, duration } = result;

const width = canvas.width;
const height = canvas.height;
const midY = height / 2;
const stepX = width / samples.length;

ctx.beginPath();
for (let i = 0; i < samples.length; i++) {
  const x = i * stepX;
  const amplitude = Math.abs(samples[i]) * midY;
  ctx.fillRect(x, midY - amplitude, stepX - 1, amplitude * 2);
}
```

## Related

- [Audio](/operations/audio) — normalize and process audio
- [Silence Detection](/operations/silence) — detect quiet regions

---
outline: deep
---

# Smart Transcode

Probe the input first, then re-encode only if needed. Avoids unnecessary transcoding
when the file already meets your target specifications.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

const result = await ffmpeg.smartTranscode({
  input: "video.mp4",
  output: "output.mp4",
  targetCodec: "h264",
  targetBitrate: "2M",
});

console.log(result.action); // "copy" or "transcode"
console.log(result.skipped); // true if no re-encode was needed
```

## Function signature

```typescript
function smartTranscode(options: SmartTranscodeOptions): Promise<SmartTranscodeResult>;
```

## Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Input file path |
| `output` | `string` | — | Output file path |
| `targetCodec` | `string` | `"h264"` | Target video codec |
| `targetBitrate` | `string` | — | Max acceptable bitrate (e.g., `"4M"`) |
| `targetResolution` | `{ width, height }` | — | Max acceptable resolution |
| `audioCodec` | `string` | — | Target audio codec |
| `tolerance` | `number` | `0.1` | Bitrate tolerance (10% by default) |
| `hwAccel` | `HwAccelMode` | `"cpu"` | Hardware acceleration mode |

## Decision logic

Smart transcode probes the input and skips re-encoding if **all** conditions are met:
- Video codec matches `targetCodec`
- Bitrate is within `tolerance` of `targetBitrate`
- Resolution is at or below `targetResolution`
- Audio codec matches `audioCodec` (if specified)

```typescript
// Already H.264, bitrate 1.8M — within 10% of 2M — result.action = "copy"
const result = await ffmpeg.smartTranscode({
  input: "already-h264.mp4",
  output: "out.mp4",
  targetCodec: "h264",
  targetBitrate: "2M",
});

// Higher bitrate or different codec — result.action = "transcode"
const result2 = await ffmpeg.smartTranscode({
  input: "high-bitrate.mp4",
  output: "out.mp4",
  targetCodec: "h264",
  targetBitrate: "2M",
});
```

## Result type

```typescript
interface SmartTranscodeResult {
  outputPath: string;
  action: "copy" | "transcode";
  skipped: boolean;          // true if streams were stream-copied, not re-encoded
  inputProbe: ProbeResult;   // probe of input file
  outputProbe?: ProbeResult; // probe of output (omitted if action = "copy" with same path)
  duration: number;
  size: number;
}
```

## Batch smart transcode

Combine with `batch()` for efficient batch processing:

```typescript
const files = await glob("raw/**/*.mp4");

const result = await ffmpeg.batch({
  items: files,
  concurrency: 3,
  process: async (file) => {
    return ffmpeg.smartTranscode({
      input: file,
      output: file.replace("raw/", "processed/"),
      targetCodec: "h264",
      targetBitrate: "4M",
    });
  },
});
```

## Related

- [Export](/operations/export) — unconditional re-encode with presets
- [Batch Processing](/guide/batch) — process many files concurrently
- [Probe API](/api/probe) — manual probe-first decisions

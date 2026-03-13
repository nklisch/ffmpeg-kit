---
outline: deep
---

# Export

Re-encode video with quality presets, custom codec settings, and hardware acceleration.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

await ffmpeg.exportVideo()
  .input("raw.mp4")
  .preset("youtube_1080p")
  .faststart()
  .output("youtube.mp4")
  .execute();
```

## API

### `.input(path)` / `.videoInput(path)` / `.audioInput(path)`

| Method | Description |
|--------|-------------|
| `.input(path)` | Single input file (video + audio) |
| `.videoInput(path)` | Video-only input (use with `.audioInput()`) |
| `.audioInput(path)` | Audio-only input (use with `.videoInput()`) |

### `.preset(name)`

Apply a delivery preset. See [Presets](/guide/presets) for the full list.

```typescript
.preset("youtube_1080p")
.preset("web_h264")
.preset("instagram_story")
```

### `.videoCodec(codec)`

| Common values | Description |
|--------------|-------------|
| `"h264"` | H.264 / AVC |
| `"h265"` / `"hevc"` | H.265 / HEVC |
| `"av1"` | AV1 |
| `"vp9"` | VP9 |
| `"copy"` | Copy stream without re-encoding |

### `.audioCodec(codec)`

| Common values | Description |
|--------------|-------------|
| `"aac"` | AAC (default for MP4) |
| `"mp3"` | MP3 |
| `"opus"` | Opus (great for WebM) |
| `"copy"` | Copy stream without re-encoding |

### `.crf(value)`

Constant Rate Factor — quality-based encoding. Lower = better quality / larger file.

| Value | Quality |
|-------|---------|
| 18 | Near-lossless |
| 20–23 | High quality (recommended) |
| 28 | Good quality, smaller file |
| 35+ | Low quality |

### `.videoBitrate(bitrate)` / `.audioBitrate(bitrate)`

Bitrate strings: `"4M"`, `"2000k"`, `"192k"`.

### `.pixelFormat(fmt)`

Usually `"yuv420p"` for maximum compatibility.

### `.faststart()`

Move MP4 metadata to the start of the file for web streaming (moov atom at front).
Equivalent to `-movflags +faststart`.

### `.hwAccel(mode)`

| Mode | Description |
|------|-------------|
| `"auto"` | Try GPU, fall back to CPU |
| `"nvidia"` | Force NVENC |
| `"vaapi"` | Force VAAPI |
| `"qsv"` | Force Intel QSV |
| `"cpu"` | Software encoding |

### `.output(path)`

Output file path. Required.

## Examples

### YouTube upload

```typescript
await ffmpeg.exportVideo()
  .input("raw.mp4")
  .preset("youtube_1080p")
  .faststart()
  .hwAccel("auto")
  .output("youtube.mp4")
  .execute();
```

### Custom encoding with separate audio

```typescript
await ffmpeg.exportVideo()
  .videoInput("video-only.mp4")
  .audioInput("audio.wav")
  .videoCodec("h264")
  .crf(20)
  .audioBitrate("192k")
  .pixelFormat("yuv420p")
  .faststart()
  .output("final.mp4")
  .execute();
```

### Copy streams (fast remux)

```typescript
await ffmpeg.exportVideo()
  .input("input.mkv")
  .videoCodec("copy")
  .audioCodec("copy")
  .output("output.mp4")
  .execute();
```

## Result type

```typescript
interface ExportResult {
  outputPath: string;
  width: number;
  height: number;
  duration: number;
  size: number;
  videoCodec: string;
  audioCodec: string;
  probeResult: ProbeResult;
}
```

## Related

- [Presets](/guide/presets) — full preset listing
- [Hardware Acceleration](/guide/hardware) — GPU encoding guide
- [Smart Transcode](/operations/smart-transcode) — probe-first, skip if already correct codec

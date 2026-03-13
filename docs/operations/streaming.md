---
outline: deep
---

# Streaming

Package video for adaptive streaming (HLS and DASH), or push to RTMP/SRT endpoints.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

// HLS packaging
await ffmpeg.hls()
  .input("video.mp4")
  .segmentDuration(6)
  .playlistType("vod")
  .output("stream/index.m3u8")
  .execute();
```

## HLS API (`ffmpeg.hls()`)

### `.input(path)`

Input video file. Required.

### `.segmentDuration(seconds)`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `seconds` | `number` | `6` | Target segment duration |

### `.playlistType(type)`

| Value | Description |
|-------|-------------|
| `"vod"` | Video on demand — all segments known upfront |
| `"event"` | Live event — append-only playlist |

### `.segmentType(type)`

| Value | Description |
|-------|-------------|
| `"mpeg2ts"` | MPEG-2 TS segments (`.ts`) — default, widest compatibility |
| `"fmp4"` | Fragmented MP4 segments — required for HEVC/AV1, smaller files |

### `.encryptionKey(options)`

AES-128 segment encryption.

| Parameter | Type | Description |
|-----------|------|-------------|
| `keyUri` | `string` | URI where the player fetches the decryption key |
| `keyFile` | `string` | Path to write the key file |

### `.output(path)`

Path for the `.m3u8` playlist. Segments are written to the same directory.

## DASH API (`ffmpeg.dash()`)

### `.input(path)`

Input video file. Required.

### `.segmentDuration(seconds)`

Target segment duration in seconds.

### `.output(path)`

Path for the `.mpd` manifest file.

## Examples

### HLS VOD with fMP4 segments

```typescript
await ffmpeg.hls()
  .input("video.mp4")
  .segmentDuration(6)
  .playlistType("vod")
  .segmentType("fmp4")
  .output("stream/index.m3u8")
  .execute();
```

### DASH manifest

```typescript
await ffmpeg.dash()
  .input("video.mp4")
  .segmentDuration(4)
  .output("stream/manifest.mpd")
  .execute();
```

### Encrypted HLS

```typescript
await ffmpeg.hls()
  .input("video.mp4")
  .segmentDuration(6)
  .encryptionKey({
    keyUri: "https://keys.example.com/video.key",
    keyFile: "./keys/video.key",
  })
  .output("stream/index.m3u8")
  .execute();
```

## Result type

```typescript
interface StreamingResult {
  outputPath: string;        // playlist / manifest path
  segmentCount: number;
  totalDuration: number;
  size: number;              // total size of all segments
}
```

## Related

- [Export](/operations/export) — re-encode before packaging
- [Transform](/operations/transform) — trim content before packaging

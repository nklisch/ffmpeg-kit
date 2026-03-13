---
outline: deep
---

# Presets

Presets bundle codec, bitrate, quality, and container settings for common delivery targets.
Use them with the [Export](/operations/export) builder.

## Using presets

```typescript
await ffmpeg.exportVideo()
  .input("raw.mp4")
  .preset("youtube_1080p")
  .faststart()
  .output("youtube.mp4")
  .execute();
```

## Available presets

### YouTube

| Preset | Resolution | Video | Audio | Notes |
|--------|-----------|-------|-------|-------|
| `youtube_4k` | 3840×2160 | H.264, CRF 18 | AAC 320k | High quality 4K |
| `youtube_1080p` | 1920×1080 | H.264, CRF 18 | AAC 192k | Standard HD upload |
| `youtube_720p` | 1280×720 | H.264, CRF 20 | AAC 192k | Smaller HD |
| `youtube_shorts` | 1080×1920 | H.264, CRF 20 | AAC 192k | Vertical short |

### Social media

| Preset | Resolution | Video | Audio | Notes |
|--------|-----------|-------|-------|-------|
| `instagram_square` | 1080×1080 | H.264, CRF 22 | AAC 128k | Square post |
| `instagram_story` | 1080×1920 | H.264, CRF 22 | AAC 128k | Story/Reel |
| `twitter_landscape` | 1280×720 | H.264, CRF 22 | AAC 128k | Twitter/X |
| `tiktok` | 1080×1920 | H.264, CRF 20 | AAC 128k | TikTok vertical |

### Web

| Preset | Notes |
|--------|-------|
| `web_h264` | H.264 + AAC, faststart, broad compatibility |
| `web_h265` | H.265 + AAC, better compression, less compatible |
| `web_av1` | AV1, best compression for modern browsers |

### Archive

| Preset | Notes |
|--------|-------|
| `archive_lossless` | FFV1 + FLAC, frame-accurate lossless |
| `archive_prores` | ProRes 422 HQ, editing-friendly |

## Overriding preset settings

Preset values can be overridden by chaining methods after `.preset()`:

```typescript
await ffmpeg.exportVideo()
  .input("raw.mp4")
  .preset("youtube_1080p")
  .crf(22)          // override CRF from preset's 18
  .audioBitrate("128k")  // override audio bitrate
  .output("output.mp4")
  .execute();
```

## Custom encoding without presets

```typescript
await ffmpeg.exportVideo()
  .input("raw.mp4")
  .videoCodec("h264")
  .crf(20)
  .videoBitrate("4M")
  .audioCodec("aac")
  .audioBitrate("192k")
  .pixelFormat("yuv420p")
  .output("custom.mp4")
  .execute();
```

## Related

- [Export](/operations/export) — full export builder API
- [Hardware Acceleration](/guide/hardware) — combine presets with GPU encoding

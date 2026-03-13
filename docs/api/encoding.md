---
outline: deep
---

# Encoding API

Codec types, encoder configuration, and delivery presets.

## `VideoCodec`

```typescript
type VideoCodec =
  // H.264/AVC
  | "libx264" | "libx264rgb" | "libopenh264"
  | "h264_nvenc" | "h264_amf" | "h264_vaapi" | "h264_qsv" | "h264_vulkan"
  // H.265/HEVC
  | "libx265"
  | "hevc_nvenc" | "hevc_amf" | "hevc_vaapi" | "hevc_qsv" | "hevc_vulkan"
  // AV1
  | "libaom-av1" | "libsvtav1" | "librav1e"
  | "av1_nvenc" | "av1_amf" | "av1_vaapi" | "av1_qsv"
  // VP8/VP9
  | "libvpx" | "libvpx-vp9"
  | "vp8_vaapi" | "vp9_vaapi" | "vp9_qsv"
  // VVC/H.266
  | "libvvenc"
  // Others
  | "prores" | "prores_ks" | "dnxhd" | "mjpeg" | "gif"
  | "copy";
```

## `AudioCodec`

```typescript
type AudioCodec =
  | "aac" | "libfdk_aac"
  | "libmp3lame"
  | "libopus"
  | "libvorbis"
  | "flac" | "alac"
  | "ac3" | "eac3"
  | "pcm_s16le" | "pcm_s24le" | "pcm_s32le" | "pcm_f32le"
  | "copy";
```

## `EncoderConfig`

```typescript
interface EncoderConfig {
  codec: VideoCodec;
  /** Constant Rate Factor (libx264/libx265: 0–51, lower = better quality) */
  crf?: number;
  /** Constant quality for NVENC (0–51) */
  cq?: number;
  /** Encoder preset (speed/quality tradeoff) */
  preset?: EncodingPreset;
  /** Target bitrate (e.g., "4M", "2000k") */
  bitrate?: string;
  /** Maximum bitrate (VBV) */
  maxBitrate?: string;
  /** VBV buffer size */
  bufSize?: string;
  /** Rate control mode */
  rateControl?: RateControlMode;
  /** Pixel format */
  pixelFormat?: string;
  /** Profile (e.g., "high", "main", "baseline" for H.264) */
  profile?: string;
  /** Level (e.g., "4.1" for H.264) */
  level?: string;
  /** GOP size (keyframe interval) */
  gopSize?: number;
  /** B-frame count */
  bframes?: number;
  /** Additional codec-specific options */
  extraArgs?: string[];
}
```

## `EncodingPreset`

```typescript
type EncodingPreset =
  // libx264/libx265 speed presets
  | "ultrafast" | "superfast" | "veryfast" | "faster" | "fast"
  | "medium" | "slow" | "slower" | "veryslow" | "placebo"
  // NVENC presets (p1 = fastest, p7 = slowest/best)
  | "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7"
  // SVT-AV1 presets (0 = slowest/best, 13 = fastest)
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7"
  | "8" | "9" | "10" | "11" | "12" | "13";
```

## `RateControlMode`

```typescript
type RateControlMode = "crf" | "cq" | "cbr" | "vbr" | "abr" | "constrained-quality";
```

## `QualityTier`

```typescript
type QualityTier = "premium" | "standard" | "economy";
```

| Tier | CRF range | Use case |
|------|-----------|---------|
| `premium` | 16–20 | Archival, mastering |
| `standard` | 20–24 | Streaming, distribution |
| `economy` | 24–30 | Storage, preview |

## Delivery presets

The following preset names are accepted by `.preset()` on the [Export](/operations/export) builder:

**YouTube:**
`youtube_4k`, `youtube_1080p`, `youtube_720p`, `youtube_shorts`

**Social:**
`instagram_square`, `instagram_story`, `twitter_landscape`, `tiktok`

**Web:**
`web_h264`, `web_h265`, `web_av1`

**Archive:**
`archive_lossless`, `archive_prores`

See [Presets Guide](/guide/presets) for the full parameter table for each preset.

## Related

- [Export](/operations/export) — export builder with `.preset()`, `.videoCodec()`, `.crf()`
- [Hardware API](/api/hardware) — hardware encoder selection
- [Presets Guide](/guide/presets) — preset parameters

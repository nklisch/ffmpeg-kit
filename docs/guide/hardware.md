---
outline: deep
---

# Hardware Acceleration

ffmpeg-kit supports GPU-accelerated encoding via NVENC (NVIDIA), VAAPI (Intel/AMD on Linux),
and QSV (Intel Quick Sync). Hardware detection is cached for the process lifetime.

## Detecting available hardware

```typescript
import { ffmpeg } from "ffmpeg-kit";

const hw = await ffmpeg.detectHardware();
console.log(hw);
// {
//   nvidia: true,
//   vaapi: false,
//   qsv: false,
//   videotoolbox: false  // macOS only
// }
```

## Using hardware acceleration

Call `.hwAccel()` on any export or transform builder:

```typescript
// 'auto' — tries GPU, falls back to CPU transparently
await ffmpeg.exportVideo()
  .input("video.mp4")
  .hwAccel("auto")
  .preset("youtube_1080p")
  .output("output.mp4")
  .execute();

// Explicit GPU selection
await ffmpeg.exportVideo()
  .input("video.mp4")
  .hwAccel("nvidia")
  .preset("youtube_1080p")
  .output("output.mp4")
  .execute();

// Force CPU (disable hardware acceleration)
await ffmpeg.exportVideo()
  .input("video.mp4")
  .hwAccel("cpu")
  .preset("youtube_1080p")
  .output("output.mp4")
  .execute();
```

## Fallback behavior

In `'auto'` mode, ffmpeg-kit:

1. Detects available GPU hardware
2. Attempts encoding with the best available hardware encoder
3. If hardware init fails (`HARDWARE_INIT_FAILED`), automatically retries with CPU
4. Returns the result — your code never sees the retry

```typescript
// This always succeeds on any machine — GPU if available, CPU otherwise
const result = await ffmpeg.exportVideo()
  .input("video.mp4")
  .hwAccel("auto")
  .output("output.mp4")
  .execute();
```

::: warning NVENC session limits
NVIDIA GPUs have a session limit (typically 3-5 concurrent encode sessions on consumer
GPUs). ffmpeg-kit tracks active NVENC sessions and serializes new requests when the
limit is reached, rather than failing.
:::

## Hardware-specific notes

### NVIDIA NVENC

- Requires NVIDIA driver >= 520 and CUDA toolkit (or just the driver for video encoding)
- Supported codecs: H.264 (`h264_nvenc`), H.265/HEVC (`hevc_nvenc`), AV1 (`av1_nvenc` on RTX 4000+)
- Consumer GPU session limit: 3 concurrent sessions (can be patched on supported GPUs)

### VAAPI (Intel/AMD on Linux)

- Requires `/dev/dri/renderD128` (or similar) and the appropriate Mesa driver
- Supported codecs: H.264 (`h264_vaapi`), H.265 (`hevc_vaapi`), VP9 (`vp9_vaapi`)
- Set `LIBVA_DRIVER_NAME` env var if auto-detection fails

### Intel Quick Sync (QSV)

- Requires Intel GPU (6th gen+) and Media SDK / oneVPL
- Supported codecs: H.264 (`h264_qsv`), H.265 (`hevc_qsv`), AV1 (`av1_qsv` on Arc+)

## Related

- [Export](/operations/export) — main builder that uses hardware acceleration
- [Custom Instances](/guide/instances) — set `defaultHwAccel` globally

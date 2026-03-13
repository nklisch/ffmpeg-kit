---
outline: deep
---

# Errors API

## `FFmpegError`

All runtime failures produce an `FFmpegError`. It is always thrown by `.execute()`
and always returned by `.tryExecute()` on failure.

```typescript
class FFmpegError extends Error {
  /** Classified error type */
  code: FFmpegErrorCode;
  /** Human-readable description */
  message: string;
  /** The FFmpeg args that were passed */
  command: string[];
  /** Full FFmpeg stderr output */
  stderr: string;
  /** Process exit code (null if killed or timed out) */
  exitCode: number | null;
}
```

## `FFmpegErrorCode`

```typescript
enum FFmpegErrorCode {
  /** Input file does not exist or is not readable */
  INPUT_NOT_FOUND = "INPUT_NOT_FOUND",
  /** Output file already exists and overwrite is disabled */
  OUTPUT_EXISTS = "OUTPUT_EXISTS",
  /** Requested codec is not available in this FFmpeg build */
  CODEC_NOT_SUPPORTED = "CODEC_NOT_SUPPORTED",
  /** Malformed FFmpeg argument rejected at startup */
  INVALID_ARGUMENT = "INVALID_ARGUMENT",
  /** Encoding process failed mid-stream */
  ENCODING_FAILED = "ENCODING_FAILED",
  /** Input could not be decoded */
  DECODING_FAILED = "DECODING_FAILED",
  /** GPU hardware encoder failed to initialize */
  HARDWARE_INIT_FAILED = "HARDWARE_INIT_FAILED",
  /** FFmpeg exceeded the configured timeout */
  TIMEOUT = "TIMEOUT",
  /** Operation was cancelled via AbortSignal */
  CANCELLED = "CANCELLED",
  /** Output directory not writable */
  PERMISSION_DENIED = "PERMISSION_DENIED",
  /** Disk ran out of space during encoding */
  DISK_FULL = "DISK_FULL",
  /** Unclassified failure — inspect stderr for details */
  UNKNOWN = "UNKNOWN",
}
```

## Error classification

Errors are classified automatically by analyzing FFmpeg's stderr output. The
classification covers common patterns but falls back to `UNKNOWN` when stderr
doesn't match a known pattern.

For `UNKNOWN` errors, always inspect `e.stderr` for the root cause.

## Usage examples

### Catching specific error codes

```typescript
import { ffmpeg, FFmpegError, FFmpegErrorCode } from "ffmpeg-kit";

try {
  await ffmpeg.extract()
    .input("missing.mp4")
    .timestamp(5)
    .output("frame.png")
    .execute();
} catch (e) {
  if (e instanceof FFmpegError) {
    switch (e.code) {
      case FFmpegErrorCode.INPUT_NOT_FOUND:
        console.error("File not found:", e.command[1]);
        break;
      case FFmpegErrorCode.CODEC_NOT_SUPPORTED:
        console.error("Codec not available in this FFmpeg build");
        break;
      case FFmpegErrorCode.TIMEOUT:
        console.error("Timed out");
        break;
      default:
        console.error("Unexpected:", e.stderr);
    }
  }
}
```

### With Result types

```typescript
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .tryExecute();

if (!result.success) {
  if (result.error.code === FFmpegErrorCode.INPUT_NOT_FOUND) {
    return null;
  }
  // Re-throw unexpected errors
  throw result.error;
}
```

### Hardware fallback on error

```typescript
try {
  await ffmpeg.exportVideo()
    .input("video.mp4")
    .hwAccel("nvidia")  // explicit, no auto-fallback
    .output("out.mp4")
    .execute();
} catch (e) {
  if (e instanceof FFmpegError && e.code === FFmpegErrorCode.HARDWARE_INIT_FAILED) {
    // Retry with CPU
    await ffmpeg.exportVideo()
      .input("video.mp4")
      .hwAccel("cpu")
      .output("out.mp4")
      .execute();
  }
}
```

::: tip Auto-fallback
Use `.hwAccel("auto")` instead of explicit GPU modes to get automatic CPU fallback
without writing this retry logic yourself.
:::

## Related

- [Tri-Modal Execution](/guide/execution) — `.execute()` vs `.tryExecute()`
- [Error Handling Guide](/guide/errors) — practical error handling patterns
- [Hardware Acceleration](/guide/hardware) — `HARDWARE_INIT_FAILED` details

---
outline: deep
---

# Error Handling

## `FFmpegError`

All runtime failures produce an `FFmpegError`. It always includes:

```typescript
class FFmpegError extends Error {
  code: FFmpegErrorCode;    // classified error type
  message: string;          // human-readable description
  command: string[];        // the FFmpeg args that were passed
  stderr: string;           // full FFmpeg stderr output
  exitCode: number | null;  // process exit code (null if killed/timed out)
}
```

## `FFmpegErrorCode` enum

| Code | When it occurs |
|------|---------------|
| `INPUT_NOT_FOUND` | Input file does not exist or is not readable |
| `OUTPUT_EXISTS` | Output file already exists and `overwrite` is false |
| `CODEC_NOT_SUPPORTED` | Requested codec is not available in this FFmpeg build |
| `INVALID_ARGUMENT` | Malformed FFmpeg argument rejected at startup |
| `ENCODING_FAILED` | Encoding process failed mid-stream |
| `DECODING_FAILED` | Input could not be decoded |
| `HARDWARE_INIT_FAILED` | GPU hardware encoder failed to initialize |
| `TIMEOUT` | FFmpeg exceeded the configured timeout |
| `CANCELLED` | Operation was cancelled via `AbortSignal` |
| `PERMISSION_DENIED` | Output directory not writable |
| `DISK_FULL` | Disk ran out of space during encoding |
| `UNKNOWN` | Unclassified failure — check `stderr` for details |

## Catching specific errors

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
        console.error("Input file not found:", e.command);
        break;
      case FFmpegErrorCode.TIMEOUT:
        console.error("FFmpeg timed out after", e.exitCode, "ms");
        break;
      case FFmpegErrorCode.HARDWARE_INIT_FAILED:
        console.error("GPU encoder failed, retry with CPU");
        break;
      default:
        console.error("Unexpected error:", e.stderr);
    }
  }
}
```

## Using Result types

Prefer `.tryExecute()` when error handling is part of normal control flow:

```typescript
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .tryExecute();

if (!result.success) {
  if (result.error.code === FFmpegErrorCode.INPUT_NOT_FOUND) {
    return { error: "Video file not found" };
  }
  throw result.error; // re-throw unexpected errors
}

return result.data.outputPath;
```

## Builder errors vs runtime errors

**Builder errors** (thrown synchronously, before execution):

These occur when required fields are missing — e.g., calling `.execute()` without
setting `.input()` first. They throw a regular `Error` with a descriptive message,
not an `FFmpegError`. Fix them at development time.

```typescript
// Throws Error: "input is required" — caught in development
ffmpeg.extract().output("out.png").execute();
```

**Runtime errors** (thrown by `.execute()`, always `FFmpegError`):

These occur during FFmpeg execution — input missing on disk, codec unavailable, etc.

## Accessing raw stderr

When `code` is `UNKNOWN`, inspect `e.stderr` directly:

```typescript
} catch (e) {
  if (e instanceof FFmpegError && e.code === FFmpegErrorCode.UNKNOWN) {
    // Search stderr for clues
    if (e.stderr.includes("No space left on device")) {
      console.error("Disk full");
    }
  }
}
```

## Related

- [Tri-Modal Execution](/guide/execution) — `.execute()` vs `.tryExecute()`
- [Custom Instances](/guide/instances) — set default log level for more verbose stderr

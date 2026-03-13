---
outline: deep
---

# Tri-Modal Execution

Every builder in ffmpeg-kit exposes three terminal methods. This lets you choose
the execution and error-handling style that fits your code.

## `.toArgs()` — inspect without running

Returns the FFmpeg argument array without executing. Useful for:
- Unit testing (assert on args without needing FFmpeg installed)
- Debugging (log what would be run)
- Passing args to your own process spawner

```typescript
const args = ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .size({ width: 640 })
  .output("thumb.jpg")
  .toArgs();

console.log(args);
// ["-i", "video.mp4", "-ss", "5", "-vframes", "1",
//  "-vf", "scale=640:-2", "thumb.jpg"]
```

::: tip Unit testing with `.toArgs()`
The internal test suite uses `.toArgs()` extensively for builder unit tests.
No FFmpeg binary required — just assert on the argument array.
:::

## `.execute()` — run FFmpeg, throw on failure

Spawns FFmpeg, streams progress, and returns a typed result. Throws `FFmpegError`
if FFmpeg exits non-zero or times out.

```typescript
import { ffmpeg, FFmpegError, FFmpegErrorCode } from "ffmpeg-kit";

try {
  const result = await ffmpeg.extract()
    .input("video.mp4")
    .timestamp(5)
    .output("frame.png")
    .execute();

  console.log(result.outputPath); // "frame.png"
  console.log(result.width, result.height);
} catch (e) {
  if (e instanceof FFmpegError) {
    console.log(e.code);    // FFmpegErrorCode enum value
    console.log(e.message); // human-readable description
    console.log(e.stderr);  // full FFmpeg stderr output
    console.log(e.command); // the args that were passed
    console.log(e.exitCode);
  }
}
```

## `.tryExecute()` — Result type, never throws

Returns `{ success: true, data: T } | { success: false, error: FFmpegError }`.
No `try/catch` needed.

```typescript
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .tryExecute();

if (result.success) {
  console.log(result.data.outputPath);
  console.log(result.data.width, result.data.height);
} else {
  // result.error is always an FFmpegError
  console.error(result.error.code);
  console.error(result.error.stderr);
}
```

## Progress callbacks

Pass `onProgress` via execute options (supported on all builders):

```typescript
const result = await ffmpeg.transform()
  .input("video.mp4")
  .scale({ width: 1280 })
  .output("out.mp4")
  .execute({
    onProgress: (progress) => {
      console.log(`${progress.percent.toFixed(1)}% — speed ${progress.speed}x`);
      // ProgressInfo: { percent, currentTime, speed, fps, frame, size }
    },
  });
```

## Cancellation with AbortSignal

```typescript
const controller = new AbortController();

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30_000);

const result = await ffmpeg.transform()
  .input("long-video.mp4")
  .scale({ width: 1280 })
  .output("out.mp4")
  .tryExecute({ signal: controller.signal });

if (!result.success && result.error.code === FFmpegErrorCode.CANCELLED) {
  console.log("Operation was cancelled");
}
```

## Timeout

```typescript
// Fail if FFmpeg takes longer than 60 seconds
const result = await ffmpeg.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .execute({ timeout: 60_000 });
```

The default timeout is 10 minutes (600,000 ms). Set to `0` to disable.

## Related

- [Error Handling](/guide/errors) — full `FFmpegError` reference
- [Custom Instances](/guide/instances) — set default timeout and log level

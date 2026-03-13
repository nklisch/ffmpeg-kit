---
outline: deep
---

# Custom Instances

## The default singleton

`import { ffmpeg } from "ffmpeg-kit"` gives you a pre-configured singleton with
sensible defaults. For most applications this is all you need.

## `createFFmpeg()`

When you need custom configuration — different binary paths, a shorter timeout,
a specific default hardware mode — create your own instance:

```typescript
import { createFFmpeg } from "ffmpeg-kit";

const ff = createFFmpeg({
  ffmpegPath: "/usr/local/bin/ffmpeg",
  ffprobePath: "/usr/local/bin/ffprobe",
  tempDir: "/tmp/my-app",
  defaultTimeout: 300_000,     // 5 minutes (default: 10 minutes)
  defaultHwAccel: "auto",      // default hardware acceleration mode
  logLevel: "warning",         // ffmpeg log verbosity
});

// Use exactly like the default ffmpeg singleton
await ff.extract()
  .input("video.mp4")
  .timestamp(5)
  .output("frame.png")
  .execute();
```

## Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ffmpegPath` | `string` | `"ffmpeg"` | Path to ffmpeg binary |
| `ffprobePath` | `string` | `"ffprobe"` | Path to ffprobe binary |
| `tempDir` | `string` | `os.tmpdir()` | Directory for temporary files |
| `defaultTimeout` | `number` | `600_000` | Default timeout in ms (0 = no limit) |
| `defaultHwAccel` | `HwAccelMode` | `"cpu"` | Default hardware acceleration |
| `logLevel` | `FFmpegLogLevel` | `"error"` | FFmpeg log verbosity |

## Per-operation overrides

All execute options can be overridden per call, regardless of instance defaults:

```typescript
const ff = createFFmpeg({ defaultTimeout: 60_000 });

// This specific operation gets 5 minutes, not the 60s default
await ff.transform()
  .input("long-video.mp4")
  .scale({ width: 1280 })
  .output("out.mp4")
  .execute({ timeout: 300_000 });
```

## Multiple instances

Useful when different parts of your app need different configurations:

```typescript
// Fast instance for thumbnails
const thumbnailFF = createFFmpeg({
  defaultTimeout: 30_000,
  logLevel: "quiet",
});

// Full-quality instance for exports
const exportFF = createFFmpeg({
  defaultTimeout: 3_600_000, // 1 hour
  defaultHwAccel: "auto",
});
```

## Validating the FFmpeg installation

```typescript
import { validateInstallation } from "ffmpeg-kit";

const info = await validateInstallation({
  ffmpegPath: "/usr/local/bin/ffmpeg",
  ffprobePath: "/usr/local/bin/ffprobe",
});

console.log(info.ffmpegVersion);  // "7.1.0"
console.log(info.ffprobeVersion); // "7.1.0"
console.log(info.codecs);         // available codec list
```

::: tip Startup validation
Call `validateInstallation()` at app startup to fail fast if FFmpeg is missing,
rather than discovering the problem when the first operation runs.
:::

## Related

- [Hardware Acceleration](/guide/hardware) — `defaultHwAccel` config
- [Error Handling](/guide/errors) — `FFmpegError` reference

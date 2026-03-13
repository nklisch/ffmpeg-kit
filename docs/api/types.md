---
outline: deep
---

# Types

All shared type definitions exported from `ffmpeg-kit`.

## `OperationResult<T>`

The return type of `.tryExecute()` on all builders.

```typescript
type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: FFmpegError };
```

## `ExecuteOptions`

Options accepted by `.execute()` and `.tryExecute()` on all builders.

```typescript
interface ExecuteOptions {
  cwd?: string;
  timeout?: number;
  onProgress?: (progress: ProgressInfo) => void;
  signal?: AbortSignal;
  env?: Record<string, string>;
  logLevel?: FFmpegLogLevel;
  overwrite?: boolean;
}
```

## `ProgressInfo`

Progress callback argument for long-running operations.

```typescript
interface ProgressInfo {
  percent: number;       // 0–100
  currentTime: number;   // current time position in seconds
  speed: number;         // encoding speed multiplier
  fps: number;           // frames per second
  frame: number;         // current frame number
  size: number;          // output size so far in bytes
  bitrate: number;       // target bitrate in kbits/s
}
```

## Result types

Each operation returns a typed result. Common fields across all operations:

```typescript
// Most operations include at minimum:
interface BaseResult {
  outputPath: string;
  size: number;          // file size in bytes
  probeResult: ProbeResult;
}
```

See each operation page for its specific result type:
- [ExtractResult](/operations/extract#result-type)
- [TransformResult](/operations/transform#result-type)
- [AudioResult](/operations/audio#result-type)
- [ConcatResult](/operations/concat#result-type)
- [ExportResult](/operations/export#result-type)
- [OverlayResult](/operations/overlay#result-type)
- [TextResult](/operations/text#result-type)
- [SubtitleResult](/operations/subtitle#result-type)
- [ImageResult](/operations/image#result-type)
- [StreamingResult](/operations/streaming#result-type)
- [GifResult](/operations/gif#result-type)

## `HwAccelMode`

```typescript
type HwAccelMode = "auto" | "nvidia" | "vaapi" | "qsv" | "vulkan" | "cpu";
```

## `FFmpegLogLevel`

```typescript
type FFmpegLogLevel =
  | "quiet" | "panic" | "fatal" | "error"
  | "warning" | "info" | "verbose" | "debug" | "trace";
```

## `CreateFFmpegOptions`

Options for `createFFmpeg()`.

```typescript
interface CreateFFmpegOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  tempDir?: string;
  defaultTimeout?: number;
  defaultHwAccel?: HwAccelMode;
  logLevel?: FFmpegLogLevel;
}
```

## `BatchResult<T>`

```typescript
interface BatchResult<T> {
  succeeded: number;
  failed: number;
  total: number;
  results: Map<T, unknown>;
  errors: Map<T, FFmpegError>;
}
```

## `SilenceRegion`

```typescript
interface SilenceRegion {
  start: number;
  end: number;
  duration: number;
}
```

## Related

- [Core API](/api/core) — `execute()`, `ExecuteOptions`
- [Probe API](/api/probe) — `ProbeResult` and stream types
- [Errors API](/api/errors) — `FFmpegError` and error codes

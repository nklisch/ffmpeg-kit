---
outline: deep
---

# Core API

The low-level execution engine. All operations ultimately call through this layer.
You can use it directly when the operation builders don't cover your use case.

## `execute()`

```typescript
function execute(args: string[], options?: ExecuteOptions): Promise<ExecuteResult>;
```

Spawns an FFmpeg process with the given arguments.

### `ExecuteOptions`

```typescript
interface ExecuteOptions {
  /** Working directory for the process */
  cwd?: string;
  /** Timeout in milliseconds (default: 600_000 = 10 min) */
  timeout?: number;
  /** Callback for real-time progress updates */
  onProgress?: (progress: ProgressInfo) => void;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Environment variables to pass to the process */
  env?: Record<string, string>;
  /** Log level: quiet, panic, fatal, error, warning, info, verbose, debug, trace */
  logLevel?: FFmpegLogLevel;
  /** Overwrite output files without asking (-y) */
  overwrite?: boolean;
}
```

### `ExecuteResult`

```typescript
interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Duration of the execution in milliseconds */
  durationMs: number;
}
```

### Example

```typescript
import { execute } from "ffmpeg-kit";

const result = await execute([
  "-i", "input.mp4",
  "-vf", "scale=1280:-2",
  "-c:v", "libx264",
  "output.mp4",
]);

console.log(result.exitCode);
console.log(result.durationMs);
```

## `validateInstallation()`

```typescript
function validateInstallation(options?: {
  ffmpegPath?: string;
  ffprobePath?: string;
}): Promise<{
  ffmpeg: { path: string; version: string };
  ffprobe: { path: string; version: string };
}>;
```

Validates that FFmpeg and ffprobe binaries are available and returns their versions.
Throws if either binary is missing.

### Example

```typescript
import { validateInstallation } from "ffmpeg-kit";

const info = await validateInstallation();
console.log(info.ffmpeg.version);  // "7.1.0"
console.log(info.ffprobe.version); // "7.1.0"
```

## `parseTimecode()`

```typescript
function parseTimecode(timecode: string): number;
```

Parses timecodes in various formats to seconds.

Supports:
- `"HH:MM:SS.ms"` → `"01:30:00"` = 5400
- `"MM:SS.ms"` → `"01:30"` = 90
- `"SS.ms"` → `"123.45"` = 123.45
- Plain numbers → `"90"` = 90
- Percentages → `"50%"` (requires duration context, returns ratio 0-1)

## `ProgressInfo`

```typescript
interface ProgressInfo {
  /** 0–100 */
  percent: number;
  /** Current time position in seconds */
  currentTime: number;
  /** Encoding speed multiplier (e.g., 2.0 = 2x realtime) */
  speed: number;
  /** Frames per second */
  fps: number;
  /** Current frame number */
  frame: number;
  /** Output size so far in bytes */
  size: number;
  /** Target bitrate in kbits/s */
  bitrate: number;
}
```

## `FFmpegLogLevel`

```typescript
type FFmpegLogLevel =
  | "quiet"
  | "panic"
  | "fatal"
  | "error"
  | "warning"
  | "info"
  | "verbose"
  | "debug"
  | "trace";
```

## Related

- [Probe API](/api/probe) — ffprobe wrapper
- [Tri-Modal Execution](/guide/execution) — how builders use `execute()`
- [Error Handling](/api/errors) — `FFmpegError` reference

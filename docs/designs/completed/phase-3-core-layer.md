# Design: Phase 3 — Core Layer

## Overview

Implement the core execution engine: `execute()`, `probe()`, `validateInstallation()`, and all supporting utilities. After this phase, users can spawn ffmpeg/ffprobe processes, parse progress, handle timeouts/cancellation, probe media files with cached results, and parse timecodes.

**Design principles applied:**
- **Ports & Adapters**: Process spawning is isolated behind a thin abstraction (`spawnProcess`) so tests can verify argument construction without mocking. However, the E2E tests always run the real binary — the port exists for builder-level testing only.
- **Single Source of Truth**: Probe result types are already derived from Zod schemas (Phase 2). The `probe()` function validates raw ffprobe JSON through those schemas — no duplicate type definitions.
- **Generated Contracts**: The `ProbeResult` type is generated from `probeResultSchema` via `z.infer<>`. No hand-written probe types exist.

**Existing types consumed (from Phase 2):**
- `ExecuteOptions`, `ExecuteResult`, `ProgressInfo`, `OnProgress` — in `src/types/options.ts`
- `FFmpegError`, `FFmpegErrorCode` — in `src/types/errors.ts`
- `FFmpegLogLevel`, `Timestamp` — in `src/types/base.ts`
- `ProbeResult`, `FormatInfo`, `VideoStreamInfo`, `AudioStreamInfo` — in `src/types/probe.ts`
- `probeResultSchema`, `rawProbeOutputSchema` — in `src/schemas/probe.ts`

---

## Implementation Units

### Unit 1: Timecode Parser

**File**: `src/util/timecode.ts`

```typescript
import type { Timestamp } from "../types/base.ts";

/**
 * Parse a timecode string or number into seconds.
 *
 * Supported formats:
 * - number: returned as-is (seconds)
 * - "HH:MM:SS.ms" → seconds
 * - "MM:SS.ms" → seconds
 * - "SS.ms" → seconds (plain numeric string)
 * - "50%" → requires `durationSeconds` parameter, returns proportional value
 *
 * Throws on invalid format or negative result.
 */
export function parseTimecode(timecode: Timestamp, durationSeconds?: number): number;
```

**Implementation Notes:**
- Use a single regex to match HH:MM:SS, MM:SS, and plain seconds: `/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/` for colon-separated, then fall back to `Number()` for plain numeric strings.
- Percentage format: strip trailing `%`, parse as number, multiply by `durationSeconds / 100`. If `durationSeconds` is not provided for a percentage input, throw an error.
- Return value must be >= 0. Throw `Error` (not `FFmpegError`) for invalid timecodes — this is a programmer error.
- This is a pure function with no side effects.

**Acceptance Criteria:**
- [ ] `parseTimecode(90.5)` returns `90.5`
- [ ] `parseTimecode("01:30:00.5")` returns `5400.5`
- [ ] `parseTimecode("1:30")` returns `90`
- [ ] `parseTimecode("30")` returns `30`
- [ ] `parseTimecode("30.5")` returns `30.5`
- [ ] `parseTimecode("50%", 120)` returns `60`
- [ ] `parseTimecode("50%")` throws (no duration provided)
- [ ] `parseTimecode("invalid")` throws
- [ ] `parseTimecode("")` throws
- [ ] `parseTimecode("1:02:03.456")` returns `3723.456`
- [ ] `parseTimecode("0:00")` returns `0`

---

### Unit 2: Temp File Manager

**File**: `src/util/tempfile.ts`

```typescript
import type { Disposable } from "node:stream";

/** Options for creating a temp file */
export interface TempFileOptions {
  /** File extension including dot (e.g. ".mp4") */
  suffix?: string;
  /** Subdirectory within the temp root */
  subdir?: string;
}

/** A managed temporary file that tracks its lifecycle */
export interface TempFile {
  /** Absolute path to the temp file */
  readonly path: string;
  /** Delete the temp file if it exists. Safe to call multiple times. */
  cleanup(): void;
}

/**
 * Create a temporary file path with auto-generated unique name.
 * The file is NOT created on disk — only the path is reserved.
 * The parent directory IS created if it doesn't exist.
 *
 * @param options - suffix and subdir options
 * @param tempRoot - override temp directory (default: os.tmpdir()/ffmpeg-kit)
 */
export function createTempFile(options?: TempFileOptions, tempRoot?: string): TempFile;

/**
 * Create multiple temp files and ensure all are cleaned up via a single cleanup call.
 * Returns an object with a `files` array and a `cleanup()` that removes all.
 */
export function createTempFiles(
  count: number,
  options?: TempFileOptions,
  tempRoot?: string,
): { files: TempFile[]; cleanup: () => void };
```

**Implementation Notes:**
- Use `node:os` `tmpdir()` + `/ffmpeg-kit/` as the default root directory.
- Generate unique names with `node:crypto` `randomUUID()` + suffix.
- `cleanup()` uses `node:fs` `unlinkSync` wrapped in try/catch (ignore `ENOENT`).
- `createTempFile` calls `mkdirSync(dir, { recursive: true })` to ensure the parent exists.
- No async operations needed — temp file creation is always fast.

**Acceptance Criteria:**
- [ ] `createTempFile({ suffix: ".mp4" })` returns a `TempFile` with `.path` ending in `.mp4`
- [ ] `createTempFile()` returns a path under `os.tmpdir()/ffmpeg-kit/`
- [ ] Parent directory is created if it doesn't exist
- [ ] `cleanup()` removes the file if it exists
- [ ] `cleanup()` is idempotent (no error on second call)
- [ ] `createTempFiles(3, { suffix: ".ts" })` returns 3 unique paths
- [ ] `createTempFiles` `cleanup()` removes all files

---

### Unit 3: TTL + LRU Cache

**File**: `src/util/cache.ts`

```typescript
export interface CacheOptions {
  /** Maximum number of entries (default: 100) */
  maxSize?: number;
  /** Time-to-live in milliseconds (default: 300_000 = 5 min) */
  ttlMs?: number;
}

/**
 * Generic TTL + LRU cache.
 * - Entries expire after `ttlMs` milliseconds.
 * - When `maxSize` is reached, the least-recently-used entry is evicted.
 * - `get()` refreshes LRU order but does NOT extend TTL.
 */
export class Cache<K, V> {
  constructor(options?: CacheOptions);

  /** Get a cached value. Returns undefined if expired or missing. */
  get(key: K): V | undefined;

  /** Set a value in the cache. */
  set(key: K, value: V): void;

  /** Check if a non-expired entry exists. */
  has(key: K): boolean;

  /** Delete a specific entry. */
  delete(key: K): boolean;

  /** Clear all entries. */
  clear(): void;

  /** Current number of non-expired entries. */
  get size(): number;
}
```

**Implementation Notes:**
- Use a `Map<K, { value: V; expiresAt: number }>` internally. `Map` preserves insertion order, which we can leverage for LRU: on `get()`, delete and re-insert to move to end. On eviction, delete the first entry (`map.keys().next()`).
- `get()` checks `expiresAt` against `Date.now()`. If expired, delete and return `undefined`.
- `set()` deletes the key first (if exists) then inserts at end. If at max capacity, evict from front.
- `size` getter iterates and prunes expired entries (lazy cleanup).
- No `setInterval` timers — TTL is checked lazily on access.

**Acceptance Criteria:**
- [ ] `cache.set("a", 1); cache.get("a")` returns `1`
- [ ] Entry expires after TTL — `cache.get()` returns `undefined` after TTL ms
- [ ] LRU eviction: when at max size, oldest entry is evicted on `set()`
- [ ] `get()` refreshes LRU order — accessed entries survive longer than untouched ones
- [ ] `cache.has()` returns `false` for expired entries
- [ ] `cache.delete()` removes an entry
- [ ] `cache.clear()` empties the cache
- [ ] `cache.size` reflects only non-expired entries

---

### Unit 4: Platform Utilities

**File**: `src/util/platform.ts`

```typescript
/** Detected operating system */
export type Platform = "linux" | "darwin" | "win32";

/** Get the current platform */
export function getPlatform(): Platform;

/**
 * Normalize a file path for the current platform.
 * On Windows, converts forward slashes to backslashes.
 * On Unix, returns as-is.
 */
export function normalizePath(filePath: string): string;

/**
 * Find an executable in PATH.
 * Returns the absolute path or null if not found.
 */
export function findExecutable(name: string): Promise<string | null>;
```

**Implementation Notes:**
- `getPlatform()`: return `process.platform` cast to `Platform`. Throw on unsupported platforms.
- `normalizePath()`: use `node:path` `normalize()`.
- `findExecutable()`: use `node:child_process` `execFile` with `which` (Unix) or `where` (Windows). Parse stdout for the path. Return `null` on non-zero exit.

**Acceptance Criteria:**
- [ ] `getPlatform()` returns `"linux"`, `"darwin"`, or `"win32"`
- [ ] `normalizePath("a/b/c")` returns a normalized path
- [ ] `findExecutable("node")` returns a path string
- [ ] `findExecutable("nonexistent_binary_xyz")` returns `null`

---

### Unit 5: Logger

**File**: `src/util/logger.ts`

```typescript
/** SDK log levels (subset used internally) */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Logger interface — the port for logging */
export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

/**
 * No-op logger. All methods do nothing.
 * This is the default when no pino instance is provided.
 */
export const noopLogger: Logger;

/**
 * Create a logger from a pino instance.
 * If pino is not installed or not provided, returns noopLogger.
 */
export function createLogger(pino?: unknown): Logger;
```

**Implementation Notes:**
- `noopLogger` is a frozen object with four no-op functions.
- `createLogger()`: if the argument has `.info`, `.debug`, `.warn`, `.error` methods (duck-type check), wrap it as a `Logger`. Otherwise return `noopLogger`.
- No runtime dependency on pino — it's only used if the consumer passes an instance.
- The `Logger` interface is the **port**; pino is an **adapter**.

**Acceptance Criteria:**
- [ ] `noopLogger.info("test")` does not throw
- [ ] `createLogger()` returns `noopLogger`
- [ ] `createLogger(pinoInstance)` delegates to pino methods
- [ ] `createLogger({})` returns `noopLogger` (invalid object)

---

### Unit 6: Argument Builder

**File**: `src/core/args.ts`

```typescript
/**
 * Escape a value for use in an FFmpeg filter expression.
 * Escapes special characters: \ ' ; [ ] = :
 */
export function escapeFilterValue(value: string): string;

/**
 * Build a filter expression from name and options.
 * e.g. buildFilter("scale", { w: 1920, h: -2 }) → "scale=w=1920:h=-2"
 * e.g. buildFilter("volume", "0.5") → "volume=0.5"
 */
export function buildFilter(
  name: string,
  options?: Record<string, string | number | boolean> | string,
): string;

/**
 * Build an array of FFmpeg CLI arguments from structured options.
 * Handles common patterns:
 * - Input files: ["-i", path]
 * - Seek: ["-ss", timestamp] (before -i for input seeking)
 * - Overwrite: ["-y"]
 * - Log level: ["-loglevel", level]
 * - Progress: ["-progress", "pipe:1", "-stats_period", "0.5"]
 */
export function buildBaseArgs(options: {
  inputs?: string[];
  seekBefore?: number;
  overwrite?: boolean;
  logLevel?: string;
  progress?: boolean;
}): string[];

/**
 * Flatten nested/conditional arg arrays into a flat string[].
 * Filters out undefined/null/false values.
 *
 * e.g. flattenArgs(["-y", condition && ["-ss", "10"], "-i", "file.mp4"])
 *   → ["-y", "-ss", "10", "-i", "file.mp4"]  (if condition is true)
 *   → ["-y", "-i", "file.mp4"]                (if condition is false)
 */
export function flattenArgs(
  args: Array<string | false | null | undefined | string[]>,
): string[];
```

**Implementation Notes:**
- `escapeFilterValue`: replace `\` → `\\`, `'` → `\\'`, `;` → `\\;`, `[` → `\\[`, `]` → `\\]`, `=` → `\\=`, `:` → `\\:`. Order matters — escape backslash first.
- `buildFilter`: if options is a string, return `name=options`. If object, join entries as `key=value` with `:` separator. Boolean `true` → include key without value, `false` → omit.
- `buildBaseArgs`: construct the standard ffmpeg argument prefix. `-progress pipe:1` enables machine-parseable progress output on stdout.
- `flattenArgs`: `Array.flat(1)` then `.filter(Boolean)` — simple and effective.

**Acceptance Criteria:**
- [ ] `escapeFilterValue("it's a test")` escapes the apostrophe
- [ ] `escapeFilterValue("key=val:opt")` escapes `=` and `:`
- [ ] `buildFilter("scale", { w: 1920, h: -2 })` returns `"scale=w=1920:h=-2"`
- [ ] `buildFilter("volume", "0.5")` returns `"volume=0.5"`
- [ ] `buildFilter("anull")` returns `"anull"` (no options)
- [ ] `buildBaseArgs({ inputs: ["a.mp4"], overwrite: true })` produces `["-y", "-i", "a.mp4"]`
- [ ] `buildBaseArgs({ seekBefore: 30, inputs: ["a.mp4"] })` places `-ss` before `-i`
- [ ] `flattenArgs(["-y", false, ["-ss", "10"]])` returns `["-y", "-ss", "10"]`

---

### Unit 7: Execute

**File**: `src/core/execute.ts`

```typescript
import type { ExecuteOptions, ExecuteResult, ProgressInfo } from "../types/options.ts";

/** Internal config for the ffmpeg binary path */
export interface ExecuteConfig {
  /** Path to ffmpeg binary. Default: "ffmpeg" (resolved from PATH) */
  ffmpegPath?: string;
}

/**
 * Execute an ffmpeg command with process management.
 *
 * Features:
 * - Spawns ffmpeg as a child process
 * - Parses `-progress pipe:1` output for real-time progress
 * - Supports timeout via options.timeout (default: 600_000ms)
 * - Supports cancellation via options.signal (AbortSignal)
 * - Adds `-y` (overwrite) by default unless options.overwrite is false
 * - Classifies exit codes into FFmpegErrorCode
 *
 * Throws FFmpegError on non-zero exit, timeout, or cancellation.
 */
export function execute(
  args: string[],
  options?: ExecuteOptions,
  config?: ExecuteConfig,
): Promise<ExecuteResult>;

/**
 * Parse a single progress line from ffmpeg's `-progress pipe:1` output.
 * Returns a partial ProgressInfo — caller accumulates fields across lines.
 *
 * Lines look like:
 *   frame=123
 *   fps=30.0
 *   bitrate=5000.0kbits/s
 *   total_size=1234567
 *   out_time_us=5000000
 *   speed=2.5x
 *   progress=continue
 *   progress=end
 */
export function parseProgressLine(
  line: string,
  totalDuration?: number,
): Partial<ProgressInfo> | null;
```

**Implementation Notes:**

**Process spawning:**
- Use `node:child_process` `spawn()` with `{ stdio: ["pipe", "pipe", "pipe"] }`.
- Prepend standard args: `["-y"]` (if overwrite !== false), `["-loglevel", logLevel ?? "error"]`.
- If `onProgress` is provided, also prepend `["-progress", "pipe:1", "-stats_period", "0.5"]`.
- Collect `stdout` and `stderr` into buffers. Parse stdout line-by-line for progress.
- If `options.cwd` is set, pass to spawn options.
- If `options.env` is set, merge with `process.env` and pass to spawn options.

**Progress parsing:**
- FFmpeg outputs `key=value\n` lines to stdout when `-progress pipe:1` is used.
- Accumulate a `ProgressInfo` object across lines. On `progress=continue` or `progress=end`, emit the accumulated info via `onProgress`.
- `out_time_us` → divide by 1_000_000 for seconds → `time` field.
- `percent`: if `totalDuration` is known, `(time / totalDuration) * 100`, clamped to 0–100.
- `eta`: if `speed > 0` and `percent` is known, `(totalDuration - time) / speed`.
- `bitrate`: parse `"5000.0kbits/s"` — keep as string (pass through).
- `total_size`: parse as number → `totalSize`.
- `speed`: parse `"2.5x"` → strip `x`, parse as number.

**Timeout:**
- Use `setTimeout` to kill the process after `options.timeout` ms. Default: 600_000 (10 min).
- On timeout, kill with `SIGTERM`, wait 5s, then `SIGKILL` if still alive.
- Throw `FFmpegError` with code `TIMEOUT`.

**Cancellation:**
- Listen to `options.signal` `abort` event. On abort, kill the process.
- Throw `FFmpegError` with code `CANCELLED`.
- Clean up the abort listener when the process exits.

**Error classification (`classifyError`):**
- Exit code non-zero → parse stderr for known patterns:
  - `"No such file or directory"` or `"does not exist"` → `INPUT_NOT_FOUND`
  - `"Invalid data found"` or `"Invalid argument"` → `INVALID_INPUT`
  - `"Encoder"` + `"not found"` or `"Unknown encoder"` → `CODEC_NOT_AVAILABLE`
  - `"Permission denied"` → `PERMISSION_DENIED`
  - `"Error initializing"` + `"hwaccel"` or `"cuda"` or `"nvenc"` → `HWACCEL_ERROR`
  - `"No space left on device"` or `"could not open"` + output path → `OUTPUT_ERROR`
  - Default → `ENCODING_FAILED`

**Return value:**
- On exit code 0: return `{ stdout, stderr, exitCode: 0, durationMs }` where `durationMs` is `Date.now() - startTime`.

**Acceptance Criteria:**
- [ ] Executes ffmpeg and returns stdout/stderr/exitCode
- [ ] Throws `FFmpegError` with code `TIMEOUT` when timeout is exceeded
- [ ] Throws `FFmpegError` with code `CANCELLED` when signal is aborted
- [ ] Calls `onProgress` with `ProgressInfo` objects during encoding
- [ ] `ProgressInfo.percent` is calculated when total duration is known
- [ ] Adds `-y` by default; omits when `overwrite: false`
- [ ] Passes `cwd` and `env` to spawned process
- [ ] `parseProgressLine("frame=123")` returns `{ frame: 123 }`
- [ ] `parseProgressLine("out_time_us=5000000")` returns `{ time: 5 }`
- [ ] `parseProgressLine("speed=2.5x")` returns `{ speed: 2.5 }`
- [ ] `parseProgressLine("")` returns `null`
- [ ] Classifies stderr patterns into correct error codes
- [ ] `durationMs` is > 0 for successful execution

---

### Unit 8: Probe

**File**: `src/core/probe.ts`

```typescript
import type { ProbeResult, VideoStreamInfo, AudioStreamInfo } from "../types/probe.ts";

/** Internal config for the ffprobe binary path */
export interface ProbeConfig {
  /** Path to ffprobe binary. Default: "ffprobe" (resolved from PATH) */
  ffprobePath?: string;
  /** Cache options. Set to false to disable caching. */
  cache?: {
    maxSize?: number;
    ttlMs?: number;
  } | false;
}

/**
 * Probe a media file using ffprobe.
 *
 * - Runs ffprobe with JSON output
 * - Validates output through probeResultSchema (Zod)
 * - Caches results by (absolutePath, mtime) — cache hit skips ffprobe spawn
 * - Throws FFmpegError on failure
 */
export function probe(
  inputPath: string,
  options?: { noCache?: boolean },
  config?: ProbeConfig,
): Promise<ProbeResult>;

/**
 * Quick duration query. Equivalent to `probe(path).then(r => r.format.duration)`.
 */
export function getDuration(
  inputPath: string,
  config?: ProbeConfig,
): Promise<number>;

/**
 * Get the first video stream info, or null if none.
 */
export function getVideoStream(
  inputPath: string,
  config?: ProbeConfig,
): Promise<VideoStreamInfo | null>;

/**
 * Get the first audio stream info, or null if none.
 */
export function getAudioStream(
  inputPath: string,
  config?: ProbeConfig,
): Promise<AudioStreamInfo | null>;

/**
 * Clear the probe result cache. Used for testing or manual cache invalidation.
 */
export function clearProbeCache(): void;
```

**Implementation Notes:**

**ffprobe invocation:**
- Spawn: `ffprobe -v quiet -print_format json -show_format -show_streams -show_chapters <inputPath>`
- Parse stdout as JSON.
- Validate through `rawProbeOutputSchema` first (catches structure errors), then transform through `probeResultSchema`.
- On validation failure, throw `FFmpegError` with code `INVALID_INPUT`.
- On spawn failure (binary not found), throw `FFmpegError` with code `BINARY_NOT_FOUND`.
- On non-zero exit, check stderr for `"No such file or directory"` → `INPUT_NOT_FOUND`, otherwise `INVALID_INPUT`.

**Caching strategy:**
- Use the `Cache` class from `src/util/cache.ts`.
- Cache key: `${absolutePath}:${mtimeMs}` (string). Use `node:fs` `statSync` to get `mtimeMs`.
- Default: 100 entries, 5 min TTL.
- If `options.noCache` is true, skip cache lookup but still store the result.
- If caching is disabled via `config.cache === false`, skip all cache operations.
- Module-level singleton cache instance (reset via `clearProbeCache()`).

**Helper functions:**
- `getDuration`: calls `probe()`, returns `result.format.duration`.
- `getVideoStream`: calls `probe()`, finds first stream with `type === "video"`, returns it or `null`.
- `getAudioStream`: calls `probe()`, finds first stream with `type === "audio"`, returns it or `null`.

**Acceptance Criteria:**
- [ ] `probe("video.mp4")` returns a valid `ProbeResult` with format and streams
- [ ] Probe result matches `ProbeResult` type (Zod-validated)
- [ ] Video stream has correct width, height, codec, fps
- [ ] Audio stream has correct sample rate, channels, codec
- [ ] Chapters are parsed correctly from MKV with chapters
- [ ] Second call returns cached result (verified by timing or spy)
- [ ] `noCache: true` forces a fresh probe
- [ ] `clearProbeCache()` invalidates all cached entries
- [ ] `getDuration()` returns a number matching `probe().format.duration`
- [ ] `getVideoStream()` returns the first video stream or null
- [ ] `getAudioStream()` returns the first audio stream or null
- [ ] Non-existent file throws `FFmpegError` with code `INPUT_NOT_FOUND`
- [ ] Non-media file throws `FFmpegError` with code `INVALID_INPUT`

---

### Unit 9: Validate Installation

**File**: `src/core/validate.ts`

```typescript
export interface InstallationInfo {
  ffmpeg: { path: string; version: string };
  ffprobe: { path: string; version: string };
}

/**
 * Validate that ffmpeg and ffprobe are installed and available.
 *
 * - Finds binaries in PATH (or uses provided paths)
 * - Runs `ffmpeg -version` and `ffprobe -version` to get version strings
 * - Throws FFmpegError with BINARY_NOT_FOUND if either is missing
 */
export function validateInstallation(config?: {
  ffmpegPath?: string;
  ffprobePath?: string;
}): Promise<InstallationInfo>;

/**
 * Parse the version string from `ffmpeg -version` output.
 * e.g. "ffmpeg version 7.1.1 Copyright ..." → "7.1.1"
 * e.g. "ffmpeg version N-123456-g..." → "N-123456-g..."
 */
export function parseVersionString(output: string): string;
```

**Implementation Notes:**
- Use `findExecutable` from `src/util/platform.ts` to locate binaries if paths aren't provided.
- Run `ffmpeg -version` and `ffprobe -version` using `node:child_process` `execFile`.
- Parse version from first line: regex `/version\s+(\S+)/`.
- If either binary is not found or returns non-zero, throw `FFmpegError` with `BINARY_NOT_FOUND`.
- Run both version checks in parallel with `Promise.all`.

**Acceptance Criteria:**
- [ ] Returns `{ ffmpeg: { path, version }, ffprobe: { path, version } }`
- [ ] Version strings are non-empty (e.g. "7.1.1" or "N-...")
- [ ] Paths are absolute
- [ ] Throws `FFmpegError` with `BINARY_NOT_FOUND` when binary doesn't exist
- [ ] `parseVersionString("ffmpeg version 7.1.1 Copyright...")` returns `"7.1.1"`
- [ ] `parseVersionString("ffmpeg version N-123-gabcdef...")` returns `"N-123-gabcdef"`

---

### Unit 10: Test Fixtures

**File**: `__tests__/fixtures/generate.sh`

```bash
#!/usr/bin/env bash
# Generate all test fixtures for ffmpeg-kit.
# Run once, commit the outputs. Requires ffmpeg installed.
# Total size target: < 5 MB.

set -euo pipefail
cd "$(dirname "$0")"

echo "Generating test fixtures..."

# video-h264.mp4 — primary video test input
# 1920x1080, 5s, 30fps, H.264 + AAC stereo
ffmpeg -y -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=5" \
  -f lavfi -i "sine=frequency=440:duration=5:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  video-h264.mp4

# video-short.mp4 — fast tests
# 640x360, 2s, 30fps, H.264 + AAC stereo
ffmpeg -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" \
  -f lavfi -i "sine=frequency=440:duration=2:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  video-short.mp4

# audio-speech.wav — audio processing tests
# 48kHz, mono, 3s, synthetic "speech" (varying frequency)
ffmpeg -y -f lavfi \
  -i "sine=frequency=200:duration=1:sample_rate=48000,\
aevalsrc=0:d=0.5:s=48000,\
sine=frequency=300:duration=1:sample_rate=48000,\
aevalsrc=0:d=0.5:s=48000" \
  -filter_complex "[0][1][2][3]concat=n=4:v=0:a=1" \
  -c:a pcm_s16le -ac 1 \
  audio-speech.wav

echo "Done. Generated fixtures:"
ls -lh *.mp4 *.wav 2>/dev/null || true
```

**Implementation Notes:**
- The `audio-speech.wav` command above is simplified — a simpler approach is to use a single `sine` source with varying frequency via `aevalsrc`. If the concat filter is too complex, fall back to a simple 3-second sine wave:
  ```bash
  ffmpeg -y -f lavfi -i "sine=frequency=300:duration=3:sample_rate=48000" \
    -c:a pcm_s16le -ac 1 audio-speech.wav
  ```
- Keep all fixtures minimal: `ultrafast` preset, low resolution for video-short, short durations.
- This script will be extended in later phases to add `video-no-audio.mp4`, `audio-music.wav`, `audio-silence.wav`, `image-1080p.jpg`, etc.

**Acceptance Criteria:**
- [ ] Script runs without errors on a system with ffmpeg installed
- [ ] Produces `video-h264.mp4` (~500KB-1MB)
- [ ] Produces `video-short.mp4` (~50-200KB)
- [ ] Produces `audio-speech.wav` (~100-300KB)
- [ ] All files are playable and probed correctly by ffprobe
- [ ] Total fixture size < 2 MB

---

### Unit 11: Test Helpers

**File**: `__tests__/helpers.ts`

```typescript
import type { ProbeResult, VideoStreamInfo, AudioStreamInfo } from "../src/types/probe.ts";

/** Path to the fixtures directory */
export const FIXTURES_DIR: string;

/** Pre-defined fixture paths */
export const FIXTURES: {
  videoH264: string;    // video-h264.mp4
  videoShort: string;   // video-short.mp4
  audioSpeech: string;  // audio-speech.wav
};

/**
 * Whether ffmpeg is available on this system.
 * Resolved once at module load time.
 */
export const ffmpegAvailable: boolean;

/**
 * Use in place of `describe` to skip a suite if ffmpeg is not installed.
 */
export const describeWithFFmpeg: typeof describe;

/**
 * Create a temp file path that auto-cleans after the current test suite.
 * Uses vitest's afterAll hook for cleanup.
 */
export function tmp(filename: string): string;

/**
 * Assert that a file exists and has at least `minBytes` of content.
 * Default minBytes: 100.
 */
export function expectFileExists(filePath: string, minBytes?: number): void;

/**
 * Probe an output file using the real ffprobe binary.
 * Convenience wrapper for tests.
 */
export function probeOutput(filePath: string): Promise<ProbeResult>;

/**
 * Assert two durations are close. Default tolerance: 0.5s.
 */
export function expectDurationClose(
  actual: number,
  expected: number,
  tolerance?: number,
): void;

/**
 * Assert video dimensions match exactly.
 */
export function expectDimensions(
  probeResult: ProbeResult,
  width: number,
  height: number,
): void;

/**
 * Assert a stream uses the expected codec.
 */
export function expectCodec(
  probeResult: ProbeResult,
  streamType: "video" | "audio",
  codec: string,
): void;
```

**Implementation Notes:**
- `FIXTURES_DIR`: `path.resolve(__dirname, "fixtures")`.
- `ffmpegAvailable`: check synchronously at module load via `spawnSync("ffmpeg", ["-version"])`. Cache the result.
- `describeWithFFmpeg`: `ffmpegAvailable ? describe : describe.skip`.
- `tmp()`: creates a temp file under `os.tmpdir()/ffmpeg-kit-test/`. Registers cleanup via `afterAll(() => { /* unlink all */ })`. Tracks all created paths in a module-level array per test file.
- `probeOutput()`: calls the real `probe()` function from `src/core/probe.ts` with `{ noCache: true }`.
- `expectDurationClose()`: `expect(actual).toBeGreaterThanOrEqual(expected - tolerance)` and `toBeLessThanOrEqual(expected + tolerance)`.
- `expectDimensions()`: finds the first video stream, asserts `.width` and `.height`.
- `expectCodec()`: finds the first stream of the given type, asserts `.codec`.

**Acceptance Criteria:**
- [ ] `FIXTURES.videoH264` points to an existing file
- [ ] `describeWithFFmpeg` skips tests when ffmpeg is not installed
- [ ] `tmp("output.mp4")` returns a unique path; file is cleaned up after test suite
- [ ] `expectFileExists` passes for existing files, fails for missing/empty
- [ ] `probeOutput` returns a valid ProbeResult
- [ ] `expectDurationClose(5.1, 5.0)` passes; `expectDurationClose(6.0, 5.0)` fails
- [ ] `expectDimensions(probe, 1920, 1080)` passes for 1080p video
- [ ] `expectCodec(probe, "video", "h264")` passes for H.264 video

---

### Unit 12: Barrel Export Updates

**File**: `src/index.ts` (update existing)

Add runtime exports for the new core functions:

```typescript
// Core
export { execute } from "./core/execute.ts";
export { probe, getDuration, getVideoStream, getAudioStream, clearProbeCache } from "./core/probe.ts";
export { validateInstallation } from "./core/validate.ts";

// Utilities
export { parseTimecode } from "./util/timecode.ts";
export { createTempFile, createTempFiles } from "./util/tempfile.ts";
export type { TempFile, TempFileOptions } from "./util/tempfile.ts";
export { Cache } from "./util/cache.ts";
export type { CacheOptions } from "./util/cache.ts";
export { findExecutable, getPlatform, normalizePath } from "./util/platform.ts";
export type { Platform } from "./util/platform.ts";
export { createLogger, noopLogger } from "./util/logger.ts";
export type { Logger, LogLevel } from "./util/logger.ts";

// Args (for advanced users and operation builders)
export {
  escapeFilterValue,
  buildFilter,
  buildBaseArgs,
  flattenArgs,
} from "./core/args.ts";
```

**Implementation Notes:**
- Keep the existing schema and type exports. Add the new exports below them.
- Group exports by layer: Core, Utilities, Args.
- Use `export type` for type-only exports per `verbatimModuleSyntax`.

**Acceptance Criteria:**
- [ ] `pnpm build` succeeds with all new exports
- [ ] All new functions are importable: `import { execute, probe, parseTimecode, ... } from "ffmpeg-kit"`
- [ ] Type-only exports use `export type`

---

## Implementation Order

1. **Unit 4: Platform** — no dependencies, needed by validate and execute
2. **Unit 5: Logger** — no dependencies, used by execute and probe
3. **Unit 3: Cache** — no dependencies, needed by probe
4. **Unit 1: Timecode** — no dependencies, needed by operation builders later
5. **Unit 2: Tempfile** — no dependencies, needed by pipeline later
6. **Unit 6: Args** — no dependencies, needed by execute and all builders
7. **Unit 7: Execute** — depends on args, platform, logger
8. **Unit 9: Validate** — depends on platform
9. **Unit 8: Probe** — depends on execute (spawns ffprobe), cache, schemas
10. **Unit 10: Fixtures** — run generate.sh (requires ffmpeg)
11. **Unit 11: Test Helpers** — depends on probe, fixtures
12. **Unit 12: Barrel Exports** — depends on all units above

---

## Testing

### Unit Tests (Tier 1 — no ffmpeg needed)

#### `__tests__/unit/timecode.test.ts`
- HH:MM:SS parsing (with and without ms)
- MM:SS parsing
- Plain seconds (string and number)
- Percentage with duration
- Percentage without duration (throws)
- Invalid input (throws)
- Edge cases: "0:00", "0:00:00", "100%", very large values

#### `__tests__/unit/cache.test.ts`
- Basic get/set
- TTL expiration (use `vi.useFakeTimers()`)
- LRU eviction at max capacity
- `get()` refreshes LRU order
- `has()` returns false for expired entries
- `delete()` and `clear()`
- `size` reflects non-expired count

#### `__tests__/unit/args.test.ts`
- `escapeFilterValue` — special character escaping
- `buildFilter` — with object options, string options, no options
- `buildBaseArgs` — seek before input, overwrite flag, log level, progress flag
- `flattenArgs` — filters false/null/undefined, flattens nested arrays

#### `__tests__/unit/execute.test.ts` (progress parsing only)
- `parseProgressLine("frame=123")` → `{ frame: 123 }`
- `parseProgressLine("fps=30.0")` → `{ fps: 30 }`
- `parseProgressLine("out_time_us=5000000")` → `{ time: 5 }`
- `parseProgressLine("speed=2.5x")` → `{ speed: 2.5 }`
- `parseProgressLine("bitrate=5000.0kbits/s")` → `{ bitrate: "5000.0kbits/s" }`
- `parseProgressLine("total_size=1234567")` → `{ totalSize: 1234567 }`
- `parseProgressLine("progress=continue")` → `null` (sentinel, not a data field)
- `parseProgressLine("")` → `null`
- Percent/ETA calculation with known duration

#### `__tests__/unit/validate.test.ts` (version parsing only)
- `parseVersionString("ffmpeg version 7.1.1 Copyright...")` → `"7.1.1"`
- `parseVersionString("ffmpeg version N-123-gabcdef ...")` → `"N-123-gabcdef"`
- `parseVersionString("garbage")` throws or returns empty

### E2E Tests (Tier 2 — requires ffmpeg)

#### `__tests__/integration/execute.e2e.test.ts`
```typescript
describeWithFFmpeg("execute()", () => {
  it("runs a simple ffmpeg command and returns result");
    // execute(["-version"]) → exitCode 0, stdout contains "ffmpeg version"

  it("returns stdout and stderr");
    // execute(["-i", fixture, "-f", "null", "-"]) → stderr has encoding info

  it("times out and throws TIMEOUT");
    // execute long command with timeout: 100ms

  it("cancels via AbortSignal and throws CANCELLED");
    // abort after 50ms

  it("calls onProgress during encoding");
    // encode video-short.mp4, collect progress events, assert frame > 0

  it("throws INPUT_NOT_FOUND for missing input");
    // execute(["-i", "nonexistent.mp4", ...])

  it("reports durationMs > 0 for successful execution");
});
```

#### `__tests__/integration/probe.e2e.test.ts`
```typescript
describeWithFFmpeg("probe()", () => {
  it("probes video file and returns correct format info");
    // probe(videoH264) → format.duration ~5, format.nbStreams >= 2

  it("returns correct video stream info");
    // width: 1920, height: 1080, codec: "h264", frameRate ~30

  it("returns correct audio stream info");
    // sampleRate: 48000, channels: 2, codec: "aac"

  it("caches probe results (second call is faster)");
    // probe twice, measure time, second should be < 5ms

  it("bypasses cache with noCache: true");
    // probe with noCache, timing should be similar to first call

  it("getDuration returns format duration");

  it("getVideoStream returns first video stream");

  it("getAudioStream returns first audio stream");

  it("getVideoStream returns null for audio-only file");
    // probe audio-speech.wav

  it("throws INPUT_NOT_FOUND for missing file");

  it("clearProbeCache invalidates cache");
});
```

#### `__tests__/integration/validate.e2e.test.ts`
```typescript
describeWithFFmpeg("validateInstallation()", () => {
  it("returns version info for ffmpeg and ffprobe");
    // validate() → { ffmpeg: { path, version }, ffprobe: { path, version } }
    // path is non-empty, version matches /\d+\.\d+/

  it("throws BINARY_NOT_FOUND for invalid path");
    // validateInstallation({ ffmpegPath: "/nonexistent/ffmpeg" })
});
```

---

## Verification Checklist

```bash
# Build succeeds with all new modules
pnpm build

# Type checking passes
pnpm typecheck

# Lint passes
pnpm lint

# Generate test fixtures
bash __tests__/fixtures/generate.sh

# Unit tests pass (no ffmpeg needed)
pnpm test -- __tests__/unit/timecode.test.ts
pnpm test -- __tests__/unit/cache.test.ts
pnpm test -- __tests__/unit/args.test.ts
pnpm test -- __tests__/unit/execute.test.ts
pnpm test -- __tests__/unit/validate.test.ts

# E2E tests pass (requires ffmpeg)
pnpm test -- __tests__/integration/execute.e2e.test.ts
pnpm test -- __tests__/integration/probe.e2e.test.ts
pnpm test -- __tests__/integration/validate.e2e.test.ts

# All tests pass together
pnpm test

# Run 3x to verify no flakiness
pnpm test && pnpm test && pnpm test
```

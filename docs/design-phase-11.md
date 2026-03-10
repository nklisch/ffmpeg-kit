# Design: Phase 11 — SDK Instance & Public API

## Overview

Wire all existing layers into a `createFFmpeg(config)` factory that produces an `FFmpegSDK` namespace object. Each instance has its own config (binary paths, defaults), probe cache, and hardware detection cache. A default `ffmpeg` export provides zero-config usage.

### Key Design Decision: Dependency Injection

**Problem**: Builders and convenience functions import `execute` and `probe` at module level, so they can't use per-instance config (custom ffmpegPath, ffprobePath, cache, etc.).

**Approach**: Explicit dependency injection. Builder factories and convenience functions receive a `BuilderDeps` object containing bound `execute` and `probe` functions. The SDK factory creates these bound functions with per-instance config baked in.

**Consequences**:
- Standalone builder/convenience exports are removed from the public API. Users always go through the namespace: `ffmpeg.extract()`, not `extract()`.
- Builders no longer import `execute` or `probe` at module level — all runtime deps come through `BuilderDeps`.
- `toArgs()` still works without deps (builders have default stubs that throw on execute/probe).
- Clean separation: the SDK owns configuration, builders own argument construction.

---

## Implementation Units

### Unit 1: SDK Types

**File**: `src/types/sdk.ts` (new file)

```typescript
import type { ExecuteOptions, ExecuteResult } from "./options.ts";
import type { ProbeResult, VideoStreamInfo, AudioStreamInfo } from "./probe.ts";
import type { HwAccelMode, FFmpegLogLevel } from "./codecs.ts";
import type { InstallationInfo } from "../core/validate.ts";
import type { HardwareCapabilities } from "../hardware/detect.ts";
import type { FilterGraphBuilder } from "../filters/graph.ts";
import type { PipelineBuilder } from "../convenience/pipeline.ts";
import type {
  AudioBuilder, ConcatBuilder, ExportBuilder, ExtractBuilder,
  GifBuilder, ImageBuilder, OverlayBuilder, TextBuilder,
  SubtitleBuilder, TransformBuilder, HlsBuilder, DashBuilder,
} from "./index.ts";
import type {
  BatchResult, EstimateResult, ExportResult, TransformResult,
  SilenceRange, SmartTranscodeResult, SplitSegment,
  ThumbnailSheetResult, WaveformResult,
} from "./results.ts";

// ─── User-facing config ─────────────────────────────────────────────

/** Configuration for createFFmpeg(). All fields optional with sensible defaults. */
export interface FFmpegConfig {
  /** Path to ffmpeg binary (default: "ffmpeg" from PATH) */
  ffmpegPath?: string;
  /** Path to ffprobe binary (default: "ffprobe" from PATH) */
  ffprobePath?: string;
  /** Temp directory for intermediate files (default: os.tmpdir()/ffmpeg-kit) */
  tempDir?: string;
  /** Default timeout for all operations in ms (default: 600_000) */
  defaultTimeout?: number;
  /** Default hardware acceleration mode (default: "auto") */
  defaultHwAccel?: HwAccelMode;
  /** Default log level (default: "error") */
  logLevel?: FFmpegLogLevel;
  /** Probe cache max entries (default: 100, set to 0 to disable) */
  probeCacheSize?: number;
  /** Probe cache TTL in ms (default: 300_000 = 5 min) */
  probeCacheTtl?: number;
}

// ─── Internal dependency injection ──────────────────────────────────

/**
 * Runtime dependencies injected into builders and convenience functions.
 * Created by createFFmpeg() with per-instance config baked in.
 *
 * Not user-facing — users interact with FFmpegSDK methods, not BuilderDeps.
 */
export interface BuilderDeps {
  /** Bound execute — has ffmpegPath, default timeout, default logLevel baked in */
  execute(args: string[], options?: ExecuteOptions): Promise<ExecuteResult>;
  /** Bound probe — has ffprobePath and per-instance cache baked in */
  probe(inputPath: string, options?: { noCache?: boolean }): Promise<ProbeResult>;
  /** Temp directory for intermediate files */
  tempDir: string;
  /** Default hardware acceleration mode */
  defaultHwAccel: HwAccelMode;
}

// ─── Public SDK interface ───────────────────────────────────────────

/** The FFmpeg SDK namespace. All methods are bound to per-instance config. */
export interface FFmpegSDK {
  // ── Core ──

  /** Run raw ffmpeg with arbitrary args */
  execute(args: string[], options?: ExecuteOptions): Promise<ExecuteResult>;
  /** Probe media file metadata */
  probe(inputPath: string, options?: { noCache?: boolean }): Promise<ProbeResult>;
  /** Get video duration in seconds */
  getDuration(inputPath: string): Promise<number>;
  /** Get first video stream info */
  getVideoStream(inputPath: string): Promise<VideoStreamInfo | null>;
  /** Get first audio stream info */
  getAudioStream(inputPath: string): Promise<AudioStreamInfo | null>;
  /** Validate ffmpeg/ffprobe installation */
  validateInstallation(): Promise<InstallationInfo>;
  /** Clear this instance's probe and hardware caches */
  clearProbeCache(): void;
  /** Parse timecode string to seconds */
  parseTimecode(timecode: string): number;

  // ── Operation Builders ──

  extract(): ExtractBuilder;
  transform(): TransformBuilder;
  audio(): AudioBuilder;
  concat(): ConcatBuilder;
  exportVideo(): ExportBuilder;
  overlay(): OverlayBuilder;
  text(): TextBuilder;
  subtitle(): SubtitleBuilder;
  image(): ImageBuilder;
  hls(): HlsBuilder;
  dash(): DashBuilder;
  gif(): GifBuilder;

  // ── Filter Graph ──

  filterGraph(): FilterGraphBuilder;
  filter(name: string, options?: Record<string, string | number | boolean>): string;
  chain(...filters: string[]): string;

  // ── Hardware ──

  /** Detect hardware acceleration capabilities (cached per instance) */
  detectHardware(): Promise<HardwareCapabilities>;

  // ── Convenience ──

  pipeline(): PipelineBuilder;

  batch<T>(options: {
    inputs: string[];
    concurrency?: number;
    operation: (input: string) => {
      input(path: string): unknown;
      execute(options?: ExecuteOptions): Promise<T>;
    };
    onItemComplete?: (input: string, result: T) => void;
    onItemError?: (input: string, error: Error) => void;
  }): Promise<BatchResult<T>>;

  smartTranscode(
    options: import("../convenience/smart.ts").SmartTranscodeOptions,
    executeOptions?: ExecuteOptions,
  ): Promise<SmartTranscodeResult>;

  thumbnailSheet(
    options: import("../convenience/thumbnail-sheet.ts").ThumbnailSheetOptions,
    executeOptions?: ExecuteOptions,
  ): Promise<ThumbnailSheetResult>;

  waveform(
    options: import("../convenience/waveform.ts").WaveformOptions,
    executeOptions?: ExecuteOptions,
  ): Promise<WaveformResult>;

  estimateSize(
    options: import("../convenience/estimate.ts").EstimateOptions,
  ): Promise<EstimateResult>;

  detectSilence(
    input: string,
    options?: { threshold?: number; minDuration?: number },
    executeOptions?: ExecuteOptions,
  ): Promise<SilenceRange[]>;

  trimSilence(
    options: import("../convenience/silence.ts").TrimSilenceOptions,
    executeOptions?: ExecuteOptions,
  ): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

  splitOnSilence(
    options: import("../convenience/silence.ts").SplitOnSilenceOptions,
    executeOptions?: ExecuteOptions,
  ): Promise<SplitSegment[]>;

  normalizeMedia(
    options: import("../convenience/normalize-media.ts").NormalizeMediaOptions,
    executeOptions?: ExecuteOptions,
  ): Promise<import("../convenience/normalize-media.ts").NormalizeMediaResult>;

  remux(input: string, output: string, executeOptions?: ExecuteOptions): Promise<ExportResult>;

  compress(
    input: string, output: string,
    options?: { quality?: import("./codecs.ts").QualityTier },
    executeOptions?: ExecuteOptions,
  ): Promise<ExportResult>;

  extractAudio(
    input: string, output: string,
    options?: { codec?: import("./codecs.ts").AudioCodec; bitrate?: string },
    executeOptions?: ExecuteOptions,
  ): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

  imageToVideo(
    input: string, output: string,
    options?: { duration?: number; fps?: number },
    executeOptions?: ExecuteOptions,
  ): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

  resize(
    input: string, output: string,
    options: { width?: number; height?: number },
    executeOptions?: ExecuteOptions,
  ): Promise<TransformResult>;
}
```

**Implementation Notes**:
- `BuilderDeps` is the core DI type. Its `execute` and `probe` functions have per-instance config (ffmpegPath, ffprobePath, cache, timeout, logLevel) already baked in via closures. Builders just call `deps.execute(args, opts)` — no config threading.
- `FFmpegSDK` methods match the old standalone function signatures. Users see no difference in call syntax.
- Option types for convenience functions (`SmartTranscodeOptions`, `ThumbnailSheetOptions`, etc.) are referenced via `import()` types. The implementer should export these option interfaces from their respective convenience modules if not already exported, then import them properly.

**Acceptance Criteria**:
- [ ] `FFmpegConfig` has all 8 config fields from ARCH.md
- [ ] `FFmpegSDK` has all 38 methods from ROADMAP Phase 11
- [ ] `BuilderDeps` is minimal: just `execute`, `probe`, `tempDir`, `defaultHwAccel`
- [ ] All types compile with strict mode

---

### Unit 2: Probe Cache Injection

**File**: `src/core/probe.ts` (modification)

Add `cacheInstance` to `ProbeConfig` so the SDK can inject per-instance caches:

```typescript
export interface ProbeConfig {
  ffprobePath?: string;
  cache?: { maxSize?: number; ttlMs?: number } | false;
  /** Injected cache instance (for per-SDK-instance caching). Overrides `cache` config. */
  cacheInstance?: Cache<string, ProbeResult>;
}
```

In `probe()`, prefer injected cache:

```typescript
export async function probe(
  inputPath: string,
  options?: { noCache?: boolean },
  config?: ProbeConfig,
): Promise<ProbeResult> {
  const cache = config?.cacheInstance ?? probeCache;
  // ... rest uses `cache` instead of hardcoded `probeCache`
}
```

Also update `getDuration`, `getVideoStream`, `getAudioStream` to pass config through to `probe()`.

**Acceptance Criteria**:
- [ ] `probe(path, opts, { cacheInstance: myCache })` uses the provided cache
- [ ] Module-level `probeCache` still works for any callers that don't provide config
- [ ] Existing probe tests pass unchanged

---

### Unit 3: Default Deps & Builder Helper Updates

**File**: `src/util/builder-helpers.ts` (modification)

**3a. Change `probeOutput` to accept a probe function instead of importing probe:**

```typescript
// BEFORE:
import { probe } from "../core/probe.ts";
export async function probeOutput(outputPath: string): Promise<BaseProbeInfo> {
  const probeResult = await probe(outputPath, { noCache: true });
  // ...
}

// AFTER:
// No import of probe
type ProbeFn = (path: string, opts?: { noCache?: boolean }) => Promise<ProbeResult>;

export async function probeOutput(
  outputPath: string,
  probeFn: ProbeFn,
): Promise<BaseProbeInfo> {
  const fileStat = statSync(outputPath);
  const probeResult = await probeFn(outputPath, { noCache: true });
  const duration = probeResult.format.duration ?? 0;
  return { outputPath, sizeBytes: fileStat.size, duration, probeResult };
}
```

**3b. Add `defaultDeps` for toArgs-only usage:**

```typescript
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuilderDeps } from "../types/sdk.ts";

function notConfigured(name: string): never {
  throw new FFmpegError({
    code: FFmpegErrorCode.UNKNOWN,
    message: `${name}() requires an SDK instance — use createFFmpeg()`,
    stderr: "",
    command: [],
    exitCode: 0,
  });
}

/** Default deps for builders used outside SDK (toArgs-only). execute/probe throw. */
export const defaultDeps: BuilderDeps = {
  execute: () => notConfigured("execute"),
  probe: () => notConfigured("probe"),
  tempDir: join(tmpdir(), "ffmpeg-kit"),
  defaultHwAccel: "auto",
};
```

**Implementation Notes**:
- `probeOutput` signature changes from `(path)` to `(path, probeFn)`. All callers must update.
- `defaultDeps` allows `extract().input(...).toArgs()` to work without an SDK instance. `execute()` and `probe()` throw immediately with a clear message.
- Builders use `deps = defaultDeps` as default parameter value.

**Acceptance Criteria**:
- [ ] `probeOutput(path, deps.probe)` works with real probe function
- [ ] `defaultDeps.execute()` throws FFmpegError with clear message
- [ ] `defaultDeps.probe()` throws FFmpegError with clear message

---

### Unit 4: Builder DI Refactor

**Files**: All 11 operation builder files

Each builder factory changes from importing `execute`/`probe` at module level to receiving them via `BuilderDeps`. The factory signature changes to `deps: BuilderDeps = defaultDeps`.

**Pattern** (applied to all builders):

```typescript
// BEFORE:
import { execute as runFFmpeg } from "../core/execute.ts";
import { probeOutput } from "../util/builder-helpers.ts";

export function extract(): ExtractBuilder {
  const state: ExtractState = { ... };
  const builder: ExtractBuilder = {
    // ...
    async execute(options?: ExecuteOptions) {
      const args = buildArgs(state);
      await runFFmpeg(args, options);
      const result = await probeOutput(state.outputPath!);
      // ...
    },
  };
  return builder;
}

// AFTER:
// No import of execute
import { defaultDeps, probeOutput } from "../util/builder-helpers.ts";
import type { BuilderDeps } from "../types/sdk.ts";

export function extract(deps: BuilderDeps = defaultDeps): ExtractBuilder {
  const state: ExtractState = { ... };
  const builder: ExtractBuilder = {
    // ...
    async execute(options?: ExecuteOptions) {
      const args = buildArgs(state);
      await deps.execute(args, options);            // <-- deps.execute
      const result = await probeOutput(             // <-- pass deps.probe
        state.outputPath!,
        deps.probe,
      );
      // ...
    },
    // toArgs() unchanged — pure, never calls deps
    // tryExecute unchanged — wraps execute via wrapTryExecute
  };
  return builder;
}
```

**Files to modify** (same pattern for each):

| File | Factory | Extra notes |
|------|---------|-------------|
| `src/operations/extract.ts` | `extract(deps)` | Standard pattern |
| `src/operations/transform.ts` | `transform(deps)` | Standard pattern; needs `deps.probe` for percentage timestamps |
| `src/operations/audio.ts` | `audio(deps)` | Uses `deps.probe` for normalize 2-pass; `deps.execute` for both passes |
| `src/operations/concat.ts` | `concat(deps)` | Multiple `deps.execute` calls (demuxer + filter_complex); uses `deps.tempDir` for temp list file |
| `src/operations/export.ts` | `exportVideo(deps)` | 2-pass encoding: both passes use `deps.execute` |
| `src/operations/overlay.ts` | `overlay(deps)` | Standard pattern |
| `src/operations/text.ts` | `text(deps)` | Standard pattern; may use `deps.probe` for duration |
| `src/operations/subtitle.ts` | `subtitle(deps)` | Standard pattern |
| `src/operations/image.ts` | `image(deps)` | Standard pattern |
| `src/operations/streaming.ts` | `hls(deps)`, `dash(deps)` | Both builders; streaming doesn't probe output |
| `src/operations/gif.ts` | `gif(deps)` | Standard pattern |

**What changes per builder**:
1. Remove `import { execute as runFFmpeg } from "../core/execute.ts"`
2. Add `import { defaultDeps } from "../util/builder-helpers.ts"` and `import type { BuilderDeps } from "../types/sdk.ts"`
3. Change factory signature: `(deps: BuilderDeps = defaultDeps)`
4. Replace `runFFmpeg(args, options)` → `deps.execute(args, options)`
5. Replace `probeOutput(path)` → `probeOutput(path, deps.probe)`
6. Replace any direct `probe()` calls → `deps.probe(path)`
7. Replace `createTempFile(opts)` → `createTempFile(opts, deps.tempDir)` where applicable

**What does NOT change**:
- `toArgs()` — pure, no deps used
- `tryExecute` — still wraps `execute` via `wrapTryExecute`
- Builder interface types — unchanged
- All configuration methods — unchanged
- Validation logic — unchanged

**Acceptance Criteria**:
- [ ] `extract().input(...).toArgs()` works (default deps, no SDK needed)
- [ ] `extract().input(...).execute()` throws "requires SDK instance"
- [ ] `extract(realDeps).input(...).execute()` runs ffmpeg successfully
- [ ] All existing builder unit tests pass (they only test toArgs)
- [ ] `toArgs()` produces identical output regardless of deps

---

### Unit 5: Convenience Function DI

**Files**: All 9 convenience modules

Convenience functions change to take `deps: BuilderDeps` as a required parameter (no default — they always execute, so stub deps would fail immediately anyway). The SDK binds deps when wiring up the namespace.

**Pattern for builder-delegating functions** (quick.ts):

```typescript
// BEFORE:
import { exportVideo } from "../operations/export.ts";
export async function remux(
  input: string, output: string, executeOptions?: ExecuteOptions,
): Promise<ExportResult> {
  return exportVideo().input(input).videoCodec("copy").audioCodec("copy").output(output).execute(executeOptions);
}

// AFTER:
import { exportVideo } from "../operations/export.ts";
import type { BuilderDeps } from "../types/sdk.ts";
export async function remux(
  deps: BuilderDeps,
  input: string, output: string, executeOptions?: ExecuteOptions,
): Promise<ExportResult> {
  return exportVideo(deps).input(input).videoCodec("copy").audioCodec("copy").output(output).execute(executeOptions);
}
```

**Note on parameter order**: `deps` is the FIRST parameter for convenience functions (not trailing). Since these are always called through the SDK namespace and never standalone, putting deps first avoids awkward `undefined` placeholders.

**Pattern for direct-execute functions** (thumbnail-sheet.ts, waveform.ts):

```typescript
// BEFORE:
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";

export async function thumbnailSheet(
  options: ThumbnailSheetOptions, executeOptions?: ExecuteOptions,
): Promise<ThumbnailSheetResult> {
  const info = await probe(options.input);
  await runFFmpeg(args, executeOptions);
  const outputProbe = await probe(options.output, { noCache: true });
}

// AFTER:
// No imports of execute or probe
import type { BuilderDeps } from "../types/sdk.ts";

export async function thumbnailSheet(
  deps: BuilderDeps,
  options: ThumbnailSheetOptions, executeOptions?: ExecuteOptions,
): Promise<ThumbnailSheetResult> {
  const info = await deps.probe(options.input);
  await deps.execute(args, executeOptions);
  const outputProbe = await deps.probe(options.output, { noCache: true });
}
```

**Pattern for chained convenience functions** (silence.ts):

```typescript
export async function trimSilence(
  deps: BuilderDeps,
  options: TrimSilenceOptions, executeOptions?: ExecuteOptions,
): Promise<...> {
  const silences = await detectSilence(deps, options.input, { ... }, executeOptions);
  return transform(deps).input(...).output(...).execute(executeOptions);
}
```

**Files to modify**:

| File | Functions | Notes |
|------|-----------|-------|
| `src/convenience/quick.ts` | `remux`, `compress`, `extractAudio`, `imageToVideo`, `resize` | Delegate to builders — pass deps to builder factory |
| `src/convenience/batch.ts` | `batch` | **No deps needed** — callers provide already-bound builders |
| `src/convenience/pipeline.ts` | `pipeline` | Takes deps; uses `deps.probe` for post-step probing, `deps.tempDir` for temp files |
| `src/convenience/smart.ts` | `smartTranscode`, `trySmartTranscode` | Uses `deps.probe` + `exportVideo(deps)` |
| `src/convenience/thumbnail-sheet.ts` | `thumbnailSheet` | Uses `deps.execute` + `deps.probe` directly |
| `src/convenience/waveform.ts` | `waveform` | Uses `deps.execute` + `deps.probe` directly |
| `src/convenience/silence.ts` | `detectSilence`, `trimSilence`, `splitOnSilence` | Chain: `audio(deps)` + `transform(deps)` |
| `src/convenience/estimate.ts` | `estimateSize` | Uses `deps.probe` for duration lookup |
| `src/convenience/normalize-media.ts` | `normalizeMedia` | Uses `deps.probe` + `exportVideo(deps)` |

**Acceptance Criteria**:
- [ ] All convenience functions take `deps` as first parameter
- [ ] `batch` does NOT take deps (callers provide bound builders)
- [ ] Convenience functions have no module-level imports of `execute` or `probe`
- [ ] SDK binds deps when creating namespace methods

---

### Unit 6: Hardware Detection Per-Instance Caching

**File**: `src/hardware/detect.ts` (modification)

Add parameter for external promise memoization:

```typescript
// BEFORE:
let detectPromise: Promise<HardwareCapabilities> | null = null;

export function detectHardware(config?: DetectConfig): Promise<HardwareCapabilities> {
  if (detectPromise !== null) return detectPromise;
  detectPromise = runDetection(config);
  return detectPromise;
}

// AFTER:
let detectPromise: Promise<HardwareCapabilities> | null = null;

export function detectHardware(
  config?: DetectConfig,
  promiseRef?: { current: Promise<HardwareCapabilities> | null },
): Promise<HardwareCapabilities> {
  if (promiseRef) {
    if (promiseRef.current !== null) return promiseRef.current;
    promiseRef.current = runDetection(config);
    return promiseRef.current;
  }
  if (detectPromise !== null) return detectPromise;
  detectPromise = runDetection(config);
  return detectPromise;
}
```

**Implementation Notes**:
- Module-level `detectPromise` preserved for any remaining standalone usage.
- SDK creates `{ current: null }` per instance, passes it to `detectHardware()`.
- `clearProbeCache()` on the SDK resets the instance's `promiseRef.current = null`.

**Acceptance Criteria**:
- [ ] Two SDK instances don't share hardware detection results
- [ ] Existing hardware tests pass unchanged

---

### Unit 7: Cache.clear() Method

**File**: `src/util/cache.ts` (modification)

Add a `clear()` method to the `Cache` class (if it doesn't already exist):

```typescript
/** Remove all entries from the cache */
clear(): void {
  this.map.clear();
}
```

**Acceptance Criteria**:
- [ ] `cache.clear()` removes all entries
- [ ] Cache is functional again after clear

---

### Unit 8: SDK Factory

**File**: `src/sdk.ts` (new file)

```typescript
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "./core/execute.ts";
import { probe, getDuration, getVideoStream, getAudioStream } from "./core/probe.ts";
import { validateInstallation } from "./core/validate.ts";
import { detectHardware } from "./hardware/detect.ts";
import { parseTimecode } from "./util/timecode.ts";
import { Cache } from "./util/cache.ts";
import { filter, chain, filterGraph } from "./filters/graph.ts";

import { extract } from "./operations/extract.ts";
import { transform } from "./operations/transform.ts";
import { audio } from "./operations/audio.ts";
import { concat } from "./operations/concat.ts";
import { exportVideo } from "./operations/export.ts";
import { overlay } from "./operations/overlay.ts";
import { text } from "./operations/text.ts";
import { subtitle } from "./operations/subtitle.ts";
import { image } from "./operations/image.ts";
import { hls, dash } from "./operations/streaming.ts";
import { gif } from "./operations/gif.ts";

import { pipeline } from "./convenience/pipeline.ts";
import { batch } from "./convenience/batch.ts";
import { smartTranscode } from "./convenience/smart.ts";
import { thumbnailSheet } from "./convenience/thumbnail-sheet.ts";
import { waveform } from "./convenience/waveform.ts";
import { detectSilence, trimSilence, splitOnSilence } from "./convenience/silence.ts";
import { estimateSize } from "./convenience/estimate.ts";
import { normalizeMedia } from "./convenience/normalize-media.ts";
import { remux, compress, extractAudio, imageToVideo, resize } from "./convenience/quick.ts";

import type { FFmpegConfig, FFmpegSDK, BuilderDeps } from "./types/sdk.ts";
import type { ProbeResult } from "./types/probe.ts";
import type { HardwareCapabilities } from "./hardware/detect.ts";

function createDeps(config?: FFmpegConfig): BuilderDeps {
  const ffmpegPath = config?.ffmpegPath ?? "ffmpeg";
  const ffprobePath = config?.ffprobePath ?? "ffprobe";
  const defaultTimeout = config?.defaultTimeout ?? 600_000;
  const logLevel = config?.logLevel ?? "error";
  const tempDir = config?.tempDir ?? join(tmpdir(), "ffmpeg-kit");
  const defaultHwAccel = config?.defaultHwAccel ?? "auto";

  const probeCacheSize = config?.probeCacheSize ?? 100;
  const probeCacheTtl = config?.probeCacheTtl ?? 300_000;
  const probeCache = new Cache<string, ProbeResult>({
    maxSize: Math.max(probeCacheSize, 1),
    ttlMs: probeCacheSize > 0 ? probeCacheTtl : 0,
  });

  return {
    execute: (args, options) =>
      execute(
        args,
        { timeout: defaultTimeout, logLevel, ...options },
        { ffmpegPath },
      ),
    probe: (inputPath, options) =>
      probe(inputPath, options, { ffprobePath, cacheInstance: probeCache }),
    tempDir,
    defaultHwAccel,
  };
}

/**
 * Create an FFmpeg SDK instance with per-instance configuration.
 * Each instance has its own probe cache, hardware detection cache,
 * and binary path configuration.
 */
export function createFFmpeg(config?: FFmpegConfig): FFmpegSDK {
  const deps = createDeps(config);
  const ffmpegPath = config?.ffmpegPath ?? "ffmpeg";
  const ffprobePath = config?.ffprobePath ?? "ffprobe";

  // Per-instance hardware detection cache
  const hwRef: { current: Promise<HardwareCapabilities> | null } = { current: null };

  // Per-instance probe cache ref (extract from deps.probe closure for clearing)
  // We create a new cache object in createDeps, so we hold a reference here.
  const probeCacheSize = config?.probeCacheSize ?? 100;
  const probeCacheTtl = config?.probeCacheTtl ?? 300_000;
  const probeCache = new Cache<string, ProbeResult>({
    maxSize: Math.max(probeCacheSize, 1),
    ttlMs: probeCacheSize > 0 ? probeCacheTtl : 0,
  });

  // Rebuild deps with our probeCache reference so we can clear it
  const finalDeps: BuilderDeps = {
    execute: deps.execute,
    probe: (inputPath, options) =>
      probe(inputPath, options, { ffprobePath, cacheInstance: probeCache }),
    tempDir: deps.tempDir,
    defaultHwAccel: deps.defaultHwAccel,
  };

  const sdk: FFmpegSDK = {
    // ── Core ──
    execute: finalDeps.execute,
    probe: finalDeps.probe,
    getDuration: async (path) => {
      const result = await finalDeps.probe(path);
      return result.format.duration ?? 0;
    },
    getVideoStream: async (path) => {
      const result = await finalDeps.probe(path);
      return (result.streams.find((s) => s.type === "video") as import("./types/probe.ts").VideoStreamInfo) ?? null;
    },
    getAudioStream: async (path) => {
      const result = await finalDeps.probe(path);
      return (result.streams.find((s) => s.type === "audio") as import("./types/probe.ts").AudioStreamInfo) ?? null;
    },
    validateInstallation: () =>
      validateInstallation({ ffmpegPath, ffprobePath }),
    clearProbeCache: () => {
      probeCache.clear();
      hwRef.current = null;
    },
    parseTimecode,

    // ── Operation Builders ──
    extract: () => extract(finalDeps),
    transform: () => transform(finalDeps),
    audio: () => audio(finalDeps),
    concat: () => concat(finalDeps),
    exportVideo: () => exportVideo(finalDeps),
    overlay: () => overlay(finalDeps),
    text: () => text(finalDeps),
    subtitle: () => subtitle(finalDeps),
    image: () => image(finalDeps),
    hls: () => hls(finalDeps),
    dash: () => dash(finalDeps),
    gif: () => gif(finalDeps),

    // ── Filter Graph ──
    filterGraph,
    filter,
    chain,

    // ── Hardware ──
    detectHardware: () => detectHardware({ ffmpegPath }, hwRef),

    // ── Convenience ──
    pipeline: () => pipeline(finalDeps),
    batch: (options) => batch(options),

    smartTranscode: (options, executeOptions) =>
      smartTranscode(finalDeps, options, executeOptions),
    thumbnailSheet: (options, executeOptions) =>
      thumbnailSheet(finalDeps, options, executeOptions),
    waveform: (options, executeOptions) =>
      waveform(finalDeps, options, executeOptions),
    estimateSize: (options) =>
      estimateSize(finalDeps, options),
    detectSilence: (input, options, executeOptions) =>
      detectSilence(finalDeps, input, options, executeOptions),
    trimSilence: (options, executeOptions) =>
      trimSilence(finalDeps, options, executeOptions),
    splitOnSilence: (options, executeOptions) =>
      splitOnSilence(finalDeps, options, executeOptions),
    normalizeMedia: (options, executeOptions) =>
      normalizeMedia(finalDeps, options, executeOptions),

    remux: (input, output, executeOptions) =>
      remux(finalDeps, input, output, executeOptions),
    compress: (input, output, options, executeOptions) =>
      compress(finalDeps, input, output, options, executeOptions),
    extractAudio: (input, output, options, executeOptions) =>
      extractAudio(finalDeps, input, output, options, executeOptions),
    imageToVideo: (input, output, options, executeOptions) =>
      imageToVideo(finalDeps, input, output, options, executeOptions),
    resize: (input, output, options, executeOptions) =>
      resize(finalDeps, input, output, options, executeOptions),
  };

  return sdk;
}

/** Default SDK instance with auto-detected paths and default config */
export const ffmpeg: FFmpegSDK = createFFmpeg();
```

**Implementation Notes**:
- `createDeps()` creates bound `execute` and `probe` functions with per-instance config baked in. Builders never see ffmpegPath or ffprobePath.
- `getDuration`, `getVideoStream`, `getAudioStream` are thin wrappers over `deps.probe` — no need to import the core helpers.
- `batch` is a passthrough — callers provide context-bound builders via the namespace.
- `filter`, `chain`, `filterGraph`, `parseTimecode` are pure — assigned directly.
- The factory creates its own `Cache` and holds a reference for `clearProbeCache()`.
- `hwRef` is a mutable ref for per-instance hardware detection memoization.
- The default `ffmpeg` instance is created at module evaluation time (synchronous).

**Acceptance Criteria**:
- [ ] `createFFmpeg()` returns an FFmpegSDK with all 38 methods
- [ ] `createFFmpeg({ ffmpegPath: '/custom' })` threads custom path to all operations
- [ ] Default `ffmpeg` instance works with no config
- [ ] Two instances have separate probe caches
- [ ] Two instances have separate hardware detection caches
- [ ] `sdk.clearProbeCache()` clears only that instance's caches

---

### Unit 9: Barrel Export Cleanup

**File**: `src/index.ts` (rewrite)

The barrel export changes significantly. Runtime functions that require ffmpeg/ffprobe (builders, convenience, core execution) are **removed** from the public API. Users access them through the namespace.

**What is exported**:

```typescript
// ── SDK (primary entry point) ──
export type { FFmpegConfig, FFmpegSDK, BuilderDeps } from "./types/sdk.ts";
export { createFFmpeg, ffmpeg } from "./sdk.ts";

// ── Types (all type exports remain) ──
export type { ExecuteOptions, ExecuteResult, ProgressInfo, OnProgress } from "./types/options.ts";
export type { ProbeResult, FormatInfo, VideoStreamInfo, AudioStreamInfo, ... } from "./types/probe.ts";
export type { ... } from "./types/codecs.ts";
export type { ... } from "./types/results.ts";
export type { ... } from "./types/filters.ts";
export type { ... } from "./types/base.ts";
// Builder interfaces (for typing, not construction)
export type { ExtractBuilder } from "./operations/extract.ts";
export type { TransformBuilder } from "./operations/transform.ts";
// ... all builder interfaces ...
export type { FilterGraphBuilder } from "./filters/graph.ts";
export type { PipelineBuilder } from "./convenience/pipeline.ts";

// ── Runtime values: errors ──
export { FFmpegError, FFmpegErrorCode } from "./types/errors.ts";

// ── Runtime values: schemas ──
export { probeResultSchema, videoStreamInfoSchema, ... } from "./schemas/probe.ts";

// ── Runtime values: pure utilities (no ffmpeg needed) ──
export { parseTimecode } from "./util/timecode.ts";
export { Cache } from "./util/cache.ts";
export { createLogger, noopLogger } from "./util/logger.ts";
export { findExecutable, getPlatform, normalizePath } from "./util/platform.ts";
export { createTempFile, createTempFiles } from "./util/tempfile.ts";
export { parseBitrate, formatBytes } from "./convenience/estimate.ts";

// ── Runtime values: filters (pure string builders) ──
export { filter, chain, filterGraph } from "./filters/graph.ts";
export { scale as scaleFilter, crop as cropFilter, ... } from "./filters/video.ts";
export { volume, afade, loudnorm, ... } from "./filters/audio.ts";
export { clamp, lerp, between, easing, ... } from "./filters/helpers.ts";

// ── Runtime values: encoding config (pure builders) ──
export { buildEncoderConfig, encoderConfigToArgs, audioEncoderConfigToArgs } from "./encoding/config.ts";
export { YOUTUBE_PRESETS, SOCIAL_PRESETS, WEB_PRESETS, ... } from "./encoding/presets.ts";
export { CODEC_REGISTRY, getCodecFamily, ... } from "./encoding/codecs.ts";

// ── Runtime values: builder utilities ──
export { missingFieldError, wrapTryExecute, defaultDeps } from "./util/builder-helpers.ts";
export { buildBaseArgs, buildFilter, escapeFilterValue, flattenArgs } from "./core/args.ts";
```

**What is REMOVED from public exports**:

```typescript
// These are now namespace-only (accessed via ffmpeg.xxx):
// execute, parseProgressLine                    → ffmpeg.execute()
// probe, getDuration, getVideoStream, ...       → ffmpeg.probe()
// clearProbeCache                               → ffmpeg.clearProbeCache()
// validateInstallation                          → ffmpeg.validateInstallation()
// detectHardware, clearHardwareCache            → ffmpeg.detectHardware()
// acquireSession, withHwSession, executeWithFallback → advanced, namespace or internal
// extract, transform, audio, concat, ...        → ffmpeg.extract(), etc.
// remux, compress, extractAudio, ...            → ffmpeg.remux(), etc.
// pipeline, batch, smartTranscode, ...          → ffmpeg.pipeline(), etc.
```

**Implementation Notes**:
- `defaultDeps` is exported so advanced users can construct builders manually if needed (escape hatch).
- All type exports remain — users need them for typing variables, function signatures, etc.
- Filter functions remain standalone — they're pure string builders, no runtime deps.
- Encoding config functions remain standalone — they're pure config builders.
- `parseProgressLine` is removed from public API — it's an internal parsing detail.

**Acceptance Criteria**:
- [ ] `import { ffmpeg, createFFmpeg } from '@ffmpeg-sdk/core'` works
- [ ] `import type { FFmpegSDK, ExtractBuilder, ProbeResult } from '@ffmpeg-sdk/core'` works
- [ ] `import { filter, chain, scaleFilter } from '@ffmpeg-sdk/core'` works (pure functions)
- [ ] `import { extract } from '@ffmpeg-sdk/core'` fails (not exported)
- [ ] Build succeeds, no circular dependency issues

---

## Implementation Order

```
1. Unit 7:  Cache.clear()             — prerequisite for SDK cache management
2. Unit 1:  SDK Types                  — types needed by all other units
3. Unit 2:  Probe Cache Injection      — ProbeConfig.cacheInstance
4. Unit 3:  Builder Helper Updates     — probeOutput(path, probeFn) + defaultDeps
5. Unit 6:  Hardware Detection         — per-instance promise ref
6. Unit 4:  Builder DI Refactor        — all 11 builders take deps
7. Unit 5:  Convenience Function DI    — all convenience functions take deps
8. Unit 8:  SDK Factory                — createFFmpeg() + ffmpeg default
9. Unit 9:  Barrel Export Cleanup      — remove standalone runtime exports
```

Dependencies:
- Units 1, 7 have no dependencies (start here)
- Units 2, 6 depend on nothing changed yet
- Unit 3 depends on Unit 1 (imports BuilderDeps type)
- Unit 4 depends on Units 2, 3 (probe cache injection, probeOutput signature)
- Unit 5 depends on Unit 4 (builders must accept deps first)
- Unit 8 depends on Units 4, 5, 6 (all DI'd functions ready)
- Unit 9 depends on Unit 8 (SDK must exist before removing standalone exports)

---

## Testing

### Existing Test Impact

**Builder unit tests** (e.g., `__tests__/builder/extract.test.ts`):
- Import builder factories from source files directly (not index.ts) — still works
- Only test `toArgs()` — works with `defaultDeps` (no SDK needed)
- **No changes required** to existing builder unit tests

**Builder/integration E2E tests** (e.g., `__tests__/integration/extract.e2e.test.ts`):
- Currently: `extract().input(FIXTURES.videoH264).execute()`
- Must change to: `createFFmpeg().extract().input(FIXTURES.videoH264).execute()`
- Or: import from source file and construct deps manually
- **Recommended**: Use the namespace for E2E tests — simpler and tests the real user path

**Convenience E2E tests** (e.g., `__tests__/integration/quick.e2e.test.ts`):
- Currently: `remux(FIXTURES.videoH264, output)`
- Must change to: `createFFmpeg().remux(FIXTURES.videoH264, output)`
- **Same approach**: Use namespace

### New Tests

#### Unit Tests: `__tests__/unit/sdk.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";

describe("createFFmpeg", () => {
  it("returns SDK with all expected methods", () => {
    const sdk = createFFmpeg();
    const methods = [
      "execute", "probe", "getDuration", "getVideoStream", "getAudioStream",
      "validateInstallation", "clearProbeCache", "parseTimecode",
      "extract", "transform", "audio", "concat", "exportVideo",
      "overlay", "text", "subtitle", "image", "hls", "dash", "gif",
      "filterGraph", "filter", "chain",
      "detectHardware",
      "pipeline", "batch",
      "smartTranscode", "thumbnailSheet", "waveform", "estimateSize",
      "detectSilence", "trimSilence", "splitOnSilence",
      "normalizeMedia",
      "remux", "compress", "extractAudio", "imageToVideo", "resize",
    ];
    for (const method of methods) {
      expect(typeof (sdk as Record<string, unknown>)[method]).toBe("function");
    }
  });

  it("default instance works for pure functions", () => {
    const sdk = createFFmpeg();
    expect(sdk.parseTimecode("01:30:00")).toBe(5400);
    expect(sdk.filter("scale", { w: 1920, h: -2 })).toContain("scale");
  });

  it("builders from namespace produce valid args", () => {
    const sdk = createFFmpeg();
    const args = sdk.extract().input("/test.mp4").timestamp(5).output("/frame.png").toArgs();
    expect(args).toContain("-i");
    expect(args).toContain("/test.mp4");
  });

  it("builders without SDK throw on execute", async () => {
    // Import directly from source (not namespace)
    const { extract } = await import("../../src/operations/extract.ts");
    await expect(
      extract().input("/test.mp4").timestamp(5).output("/frame.png").execute(),
    ).rejects.toThrow("requires an SDK instance");
  });

  it("accepts all config options", () => {
    const sdk = createFFmpeg({
      ffmpegPath: "/custom/ffmpeg",
      ffprobePath: "/custom/ffprobe",
      tempDir: "/tmp/custom",
      defaultTimeout: 30_000,
      defaultHwAccel: "cpu",
      logLevel: "warning",
      probeCacheSize: 50,
      probeCacheTtl: 60_000,
    });
    expect(typeof sdk.execute).toBe("function");
  });
});
```

#### E2E Tests: `__tests__/integration/sdk.e2e.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { describeWithFFmpeg, FIXTURES, tmp, expectFileExists } from "../helpers.ts";
import { createFFmpeg } from "../../src/sdk.ts";

describeWithFFmpeg("SDK instance E2E", () => {
  const ffmpeg = createFFmpeg();

  it("extract produces valid output", async () => {
    const output = tmp("sdk-extract.png");
    const result = await ffmpeg.extract()
      .input(FIXTURES.videoShort)
      .timestamp(0.5)
      .output(output)
      .execute();
    expectFileExists(output);
    expect(result.width).toBeGreaterThan(0);
  });

  it("probe returns metadata", async () => {
    const result = await ffmpeg.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
    expect(result.streams.length).toBeGreaterThan(0);
  });

  it("remux convenience works", async () => {
    const output = tmp("sdk-remux.mkv");
    const result = await ffmpeg.remux(FIXTURES.videoShort, output);
    expectFileExists(output);
    expect(result.outputPath).toBe(output);
  });

  it("multiple instances have independent caches", async () => {
    const sdk1 = createFFmpeg();
    const sdk2 = createFFmpeg();

    await sdk1.probe(FIXTURES.videoShort);
    sdk1.clearProbeCache();
    // sdk2 unaffected
    const result = await sdk2.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
  });

  it("validateInstallation returns versions", async () => {
    const info = await ffmpeg.validateInstallation();
    expect(info.ffmpeg.version).toBeTruthy();
    expect(info.ffprobe.version).toBeTruthy();
  });

  it("default export works", async () => {
    const { ffmpeg: defaultInstance } = await import("../../src/sdk.ts");
    const result = await defaultInstance.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
  });
});
```

---

## Verification Checklist

```bash
# 1. Type checking
pnpm typecheck

# 2. All tests pass (existing + new)
pnpm test

# 3. Build succeeds
pnpm build

# 4. Verify exports work
node -e "
  import('@ffmpeg-sdk/core').then(m => {
    console.log('ffmpeg:', typeof m.ffmpeg);
    console.log('createFFmpeg:', typeof m.createFFmpeg);
    console.log('extract (should be undefined):', typeof m.extract);
    console.log('filter:', typeof m.filter);
    console.log('FFmpegError:', typeof m.FFmpegError);
  });
"

# 5. Lint
pnpm check
```

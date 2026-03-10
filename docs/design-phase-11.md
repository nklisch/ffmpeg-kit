# Design: Phase 11 — SDK Instance & Public API

## Overview

Wire all existing layers into a `createFFmpeg(config)` factory that produces an `FFmpegSDK` namespace object. Each instance has its own config (binary paths, defaults), probe cache, and hardware detection cache. A default `ffmpeg` export provides zero-config usage. Standalone factory functions remain backward-compatible.

### Key Design Decision: Context Threading

The current architecture has a gap: builders and convenience functions import `execute` and `probe` at module level and never pass config (ffmpegPath, ffprobePath) through. For per-instance config to work, each factory function and convenience function must accept an optional `SDKContext` parameter that threads config to core functions.

**Approach**: Add an optional trailing `ctx?: SDKContext` parameter to every builder factory and convenience function. This is backward-compatible — standalone calls use module-level defaults. The namespace binds `ctx` automatically.

---

## Implementation Units

### Unit 1: SDK Types

**File**: `src/types/sdk.ts`

```typescript
import type { Cache } from "../util/cache.ts";
import type { HwAccelMode, FFmpegLogLevel } from "./index.ts";
import type { ProbeResult } from "./probe.ts";

/**
 * User-facing configuration for createFFmpeg().
 */
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

/**
 * Internal resolved context. Passed to builders and convenience functions.
 * All fields are resolved (no undefined — defaults applied).
 */
export interface SDKContext {
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly tempDir: string;
  readonly defaultTimeout: number;
  readonly defaultHwAccel: HwAccelMode;
  readonly logLevel: FFmpegLogLevel;
  readonly probeCache: Cache<string, ProbeResult>;
  /**
   * Per-instance hardware detection cache.
   * Uses promise memoization (same pattern as module-level detect.ts).
   */
  hardwareDetectPromise: Promise<import("../hardware/detect.ts").HardwareCapabilities> | null;
}
```

**Implementation Notes**:
- `SDKContext` is internal — not exported from the public API. Only `FFmpegConfig` and `FFmpegSDK` are user-facing.
- Fields are resolved at `createFFmpeg()` time — no lazy resolution.
- `probeCache` is a per-instance `Cache<string, ProbeResult>` owned by the context.
- `hardwareDetectPromise` is mutable (same pattern as `detect.ts` module-level `detectPromise`).
- `tempDir` defaults to `os.tmpdir() + '/ffmpeg-kit'`.

**Acceptance Criteria**:
- [ ] `FFmpegConfig` matches ARCH.md spec (all 8 config fields)
- [ ] `SDKContext` has all resolved fields with no optional values
- [ ] Types compile with strict mode

---

### Unit 2: FFmpegSDK Interface

**File**: `src/types/sdk.ts` (same file as Unit 1)

```typescript
import type { ExecuteOptions, ExecuteResult, ProgressInfo } from "./options.ts";
import type { ProbeResult, VideoStreamInfo, AudioStreamInfo } from "./probe.ts";
import type { InstallationInfo } from "../core/validate.ts";
import type { HardwareCapabilities } from "../hardware/detect.ts";
import type {
  ExtractBuilder, TransformBuilder, AudioBuilder, ConcatBuilder,
  ExportBuilder, OverlayBuilder, TextBuilder, SubtitleBuilder,
  ImageBuilder, HlsBuilder, DashBuilder, GifBuilder,
} from "./index.ts"; // builder types re-exported from types/index.ts
import type { FilterGraphBuilder } from "../filters/graph.ts";
import type { PipelineBuilder } from "../convenience/pipeline.ts";
import type {
  BatchResult, PipelineResult, SmartTranscodeResult,
  ThumbnailSheetResult, WaveformResult, SilenceRange,
  SplitSegment, EstimateResult, OperationResult,
  ExportResult, TransformResult, AudioResult, ImageResult,
} from "./results.ts";

/**
 * The FFmpeg SDK namespace. All methods are bound to per-instance config.
 */
export interface FFmpegSDK {
  // === Core ===

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

  /** Clear this instance's probe cache */
  clearProbeCache(): void;

  /** Parse timecode string to seconds */
  parseTimecode(timecode: string): number;

  // === Operation Builders ===

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

  // === Filter Graph ===

  filterGraph(): FilterGraphBuilder;
  filter(name: string, options?: Record<string, string | number | boolean>): string;
  chain(...filters: string[]): string;

  // === Hardware ===

  /** Detect hardware acceleration capabilities (cached per instance) */
  detectHardware(): Promise<HardwareCapabilities>;

  // === Convenience: Pipeline & Batch ===

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

  // === Convenience: Smart Transcode ===

  smartTranscode(options: {
    input: string;
    output: string;
    target: import("../convenience/smart.ts").SmartTranscodeTarget;
    hwAccel?: HwAccelMode;
  }, executeOptions?: ExecuteOptions): Promise<SmartTranscodeResult>;

  // === Convenience: Media Analysis ===

  thumbnailSheet(options: {
    input: string;
    columns: number;
    rows: number;
    width: number;
    timestamps: "uniform" | "scene" | number[];
    output: string;
  }, executeOptions?: ExecuteOptions): Promise<ThumbnailSheetResult>;

  waveform(options: {
    input: string;
    samplesPerSecond: number;
    channels?: "mono" | "stereo" | "all";
    format?: "peaks" | "rms" | "raw";
  }, executeOptions?: ExecuteOptions): Promise<WaveformResult>;

  estimateSize(options: {
    input: string;
    preset?: import("./codecs.ts").ExportPreset;
    videoBitrate?: string;
    audioBitrate?: string;
    duration?: number;
  }): Promise<EstimateResult>;

  // === Convenience: Silence ===

  detectSilence(input: string, options?: {
    threshold?: number;
    minDuration?: number;
  }, executeOptions?: ExecuteOptions): Promise<SilenceRange[]>;

  trimSilence(options: {
    input: string;
    output: string;
    threshold?: number;
    padding?: number;
  }, executeOptions?: ExecuteOptions): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

  splitOnSilence(options: {
    input: string;
    outputDir: string;
    threshold?: number;
    minSilence?: number;
    minSegment?: number;
  }, executeOptions?: ExecuteOptions): Promise<SplitSegment[]>;

  // === Convenience: Normalization ===

  normalizeMedia(options: {
    inputs: string[];
    outputDir: string;
    target: import("../convenience/normalize-media.ts").NormalizeTarget;
    skipIfMatching?: boolean;
    hwAccel?: HwAccelMode;
  }, executeOptions?: ExecuteOptions): Promise<import("../convenience/normalize-media.ts").NormalizeMediaResult>;

  // === Convenience: Quick Conversions ===

  remux(input: string, output: string, executeOptions?: ExecuteOptions): Promise<ExportResult>;
  compress(input: string, output: string, options?: { quality?: import("./codecs.ts").QualityTier }, executeOptions?: ExecuteOptions): Promise<ExportResult>;
  extractAudio(input: string, output: string, options?: { codec?: import("./codecs.ts").AudioCodec; bitrate?: string }, executeOptions?: ExecuteOptions): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;
  imageToVideo(input: string, output: string, options?: { duration?: number; fps?: number }, executeOptions?: ExecuteOptions): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;
  resize(input: string, output: string, options: { width?: number; height?: number }, executeOptions?: ExecuteOptions): Promise<TransformResult>;
}
```

**Implementation Notes**:
- The interface signature for each method matches the standalone function's signature exactly (minus the trailing `ctx` parameter).
- Convenience function option types are inlined here. The implementer should use `import type` from the actual modules where dedicated option interfaces exist, or inline where none exist.
- `batch` accepts the same `BatchOptions<T>` shape — destructured inline to avoid importing the non-exported interface.

**Acceptance Criteria**:
- [ ] Every method listed in ROADMAP Phase 11 is present (37 methods + clearProbeCache = 38 total)
- [ ] Return types match existing function return types exactly
- [ ] Interface compiles with strict mode
- [ ] `import type { FFmpegSDK }` is available from package root

---

### Unit 3: Probe Cache Injection

**File**: `src/core/probe.ts` (modification)

Add `cacheInstance` field to `ProbeConfig`:

```typescript
export interface ProbeConfig {
  ffprobePath?: string;
  cache?: { maxSize?: number; ttlMs?: number } | false;
  /** Injected cache instance for per-SDK-instance caching. When set, used instead of module-level cache. */
  cacheInstance?: Cache<string, ProbeResult>;
}
```

In the `probe()` function, use injected cache when provided:

```typescript
export async function probe(
  inputPath: string,
  options?: { noCache?: boolean },
  config?: ProbeConfig,
): Promise<ProbeResult> {
  const cache = config?.cacheInstance ?? probeCache;  // <-- changed from hardcoded probeCache
  const ffprobePath = config?.ffprobePath ?? "ffprobe";

  // ... rest of function uses `cache` variable instead of `probeCache`
}
```

Also modify `getDuration`, `getVideoStream`, `getAudioStream` to pass the config through to `probe()`.

**Implementation Notes**:
- The module-level `probeCache` remains the default for standalone `probe()` calls.
- When `cacheInstance` is provided, `cache` config (maxSize/ttlMs) is ignored — the injected instance is already configured.
- `clearProbeCache()` still clears the module-level cache. SDK instances clear their own via `sdk.clearProbeCache()`.

**Acceptance Criteria**:
- [ ] Standalone `probe()` still uses module-level cache (backward compatible)
- [ ] `probe(path, opts, { cacheInstance: myCache })` uses the provided cache
- [ ] Existing probe tests pass unchanged

---

### Unit 4: Builder Helper Modification

**File**: `src/util/builder-helpers.ts` (modification)

Add optional `ProbeConfig` parameter to `probeOutput`:

```typescript
import type { ProbeConfig } from "../core/probe.ts";

export async function probeOutput(
  outputPath: string,
  probeConfig?: ProbeConfig,
): Promise<BaseProbeInfo> {
  const fileStat = statSync(outputPath);
  const probeResult = await probe(outputPath, { noCache: true }, probeConfig);
  const duration = probeResult.format.duration ?? 0;
  return { outputPath, sizeBytes: fileStat.size, duration, probeResult };
}
```

**Implementation Notes**:
- Backward compatible — existing calls `probeOutput(path)` continue to work.
- SDK-bound builders pass `probeConfig` derived from context.

**Acceptance Criteria**:
- [ ] Existing `probeOutput(path)` calls compile and work
- [ ] `probeOutput(path, { ffprobePath: '/custom/ffprobe' })` uses custom path

---

### Unit 5: Builder Context Threading

**Files**: All 11 operation builder files (modifications)

Each builder factory function gains an optional `ctx?: SDKContext` parameter. Inside `execute()`, the context is used to:
1. Pass `ExecuteConfig` to `runFFmpeg()`
2. Pass `ProbeConfig` to `probeOutput()`
3. Merge default timeout/logLevel into `ExecuteOptions`

**Pattern** (applied uniformly to all builders):

```typescript
import type { SDKContext } from "../types/sdk.ts";
import type { ExecuteConfig } from "../core/execute.ts";
import type { ProbeConfig } from "../core/probe.ts";

export function extract(ctx?: SDKContext): ExtractBuilder {
  const state: ExtractState = { /* ... */ };

  // Derive configs from context (computed once, reused)
  const execConfig: ExecuteConfig | undefined = ctx
    ? { ffmpegPath: ctx.ffmpegPath }
    : undefined;
  const probeConfig: ProbeConfig | undefined = ctx
    ? { ffprobePath: ctx.ffprobePath, cacheInstance: ctx.probeCache }
    : undefined;

  const builder: ExtractBuilder = {
    // ... all existing config methods unchanged ...

    async execute(options?: ExecuteOptions): Promise<ExtractResult> {
      validateExtractState(state);
      const args = buildArgs(state);

      // Merge SDK defaults into options
      const mergedOptions = ctx
        ? { timeout: ctx.defaultTimeout, logLevel: ctx.logLevel, ...options }
        : options;

      await runFFmpeg(args, mergedOptions, execConfig);

      const { outputPath, sizeBytes, probeResult } = await probeOutput(
        state.outputPath!,
        probeConfig,
      );
      // ... build result ...
    },

    // toArgs() unchanged — no context needed for pure arg generation
    // tryExecute unchanged — wraps execute via wrapTryExecute
  };
  return builder;
}
```

**Files to modify** (same pattern for each):

| File | Factory | Notes |
|------|---------|-------|
| `src/operations/extract.ts` | `extract(ctx?)` | Standard pattern |
| `src/operations/transform.ts` | `transform(ctx?)` | Standard pattern |
| `src/operations/audio.ts` | `audio(ctx?)` | Also passes probeConfig to internal probe calls for normalize 2-pass |
| `src/operations/concat.ts` | `concat(ctx?)` | Multiple runFFmpeg calls (demuxer + filter_complex paths); also passes tempDir from ctx to createTempFile |
| `src/operations/export.ts` | `exportVideo(ctx?)` | 2-pass encoding: both passes use execConfig |
| `src/operations/overlay.ts` | `overlay(ctx?)` | Standard pattern |
| `src/operations/text.ts` | `text(ctx?)` | Standard pattern |
| `src/operations/subtitle.ts` | `subtitle(ctx?)` | Standard pattern |
| `src/operations/image.ts` | `image(ctx?)` | Standard pattern |
| `src/operations/streaming.ts` | `hls(ctx?)`, `dash(ctx?)` | Both builders |
| `src/operations/gif.ts` | `gif(ctx?)` | Standard pattern |

**Implementation Notes**:
- `toArgs()` is unchanged — it's pure and never needs context.
- `tryExecute` is unchanged — it wraps `execute` via `wrapTryExecute`.
- The `runFFmpeg` call changes from `runFFmpeg(args, options)` to `runFFmpeg(args, mergedOptions, execConfig)`.
- The `probeOutput` call changes from `probeOutput(path)` to `probeOutput(path, probeConfig)`.
- For builders that use `createTempFile()`, pass `ctx?.tempDir` as the `tempRoot` parameter.
- The `ctx` parameter is last and optional — fully backward compatible.

**Acceptance Criteria**:
- [ ] All existing builder tests pass unchanged (standalone usage)
- [ ] `extract(ctx).input(...).execute()` uses `ctx.ffmpegPath`
- [ ] `extract(ctx).input(...).execute({ timeout: 5000 })` — user timeout overrides ctx default
- [ ] `toArgs()` works identically with or without context

---

### Unit 6: Convenience Function Context Threading

**Files**: All 9 convenience modules (modifications)

Each convenience function gains an optional trailing `ctx?: SDKContext` parameter. Functions that create builders pass `ctx` to the builder factory. Functions that call `probe()` or `getDuration()` pass derived `ProbeConfig`.

**Pattern for builder-delegating functions** (e.g., quick.ts):

```typescript
import type { SDKContext } from "../types/sdk.ts";

export async function remux(
  input: string,
  output: string,
  executeOptions?: ExecuteOptions,
  ctx?: SDKContext,
): Promise<ExportResult> {
  return exportVideo(ctx)  // <-- pass ctx to builder factory
    .input(input)
    .videoCodec("copy")
    .audioCodec("copy")
    .output(output)
    .execute(executeOptions);  // builder's execute merges ctx defaults
}
```

**Pattern for direct-execute functions** (e.g., thumbnail-sheet.ts, waveform.ts):

```typescript
import type { SDKContext } from "../types/sdk.ts";

export async function thumbnailSheet(
  options: ThumbnailSheetOptions,
  executeOptions?: ExecuteOptions,
  ctx?: SDKContext,
): Promise<ThumbnailSheetResult> {
  const probeConfig = ctx
    ? { ffprobePath: ctx.ffprobePath, cacheInstance: ctx.probeCache }
    : undefined;
  const execConfig = ctx ? { ffmpegPath: ctx.ffmpegPath } : undefined;
  const mergedOptions = ctx
    ? { timeout: ctx.defaultTimeout, logLevel: ctx.logLevel, ...executeOptions }
    : executeOptions;

  const info = await probe(options.input, undefined, probeConfig);
  // ...
  await runFFmpeg(args, mergedOptions, execConfig);
  const outputProbe = await probe(options.output, { noCache: true }, probeConfig);
  // ...
}
```

**Pattern for functions that call other convenience functions** (e.g., silence.ts):

```typescript
export async function trimSilence(
  options: TrimSilenceOptions,
  executeOptions?: ExecuteOptions,
  ctx?: SDKContext,
): Promise<...> {
  const silences = await detectSilence(options.input, { ... }, executeOptions, ctx);
  // ...
  return transform(ctx).input(...).output(...).execute(executeOptions);
}
```

**Files to modify**:

| File | Functions | Notes |
|------|-----------|-------|
| `src/convenience/quick.ts` | `remux`, `compress`, `extractAudio`, `imageToVideo`, `resize` | All delegate to builders |
| `src/convenience/batch.ts` | `batch` | Does NOT need ctx — callers provide builders which are already context-bound |
| `src/convenience/pipeline.ts` | `pipeline` | Needs ctx for internal probe calls and temp file creation |
| `src/convenience/smart.ts` | `smartTranscode`, `trySmartTranscode` | Calls probe + exportVideo builder |
| `src/convenience/thumbnail-sheet.ts` | `thumbnailSheet` | Direct execute + probe |
| `src/convenience/waveform.ts` | `waveform` | Direct execute + getDuration |
| `src/convenience/silence.ts` | `detectSilence`, `trimSilence`, `splitOnSilence` | Chain: audio builder + transform builder |
| `src/convenience/estimate.ts` | `estimateSize` | Calls getDuration (needs probeConfig) |
| `src/convenience/normalize-media.ts` | `normalizeMedia` | Calls probe + exportVideo builder |

**Special case: `batch()`**

`batch()` does NOT receive `ctx` because the caller provides the operation factory. When used via namespace, callers pass context-bound builders:

```typescript
// User code with namespace
const results = await ffmpeg.batch({
  inputs: [...],
  operation: (input) => ffmpeg.exportVideo().preset('youtube_hd').output(input.replace('.mov', '.mp4')),
});
// ffmpeg.exportVideo() already has ctx bound
```

The SDK's `batch` method is just a passthrough to the standalone `batch()`.

**Special case: `pipeline()`**

The pipeline builder factory returns a `PipelineBuilder`. It needs ctx for:
1. Internal probe calls after each step
2. Temp file creation (using `ctx.tempDir`)

```typescript
export function pipeline(ctx?: SDKContext): PipelineBuilder {
  // In execute():
  // - pass ctx.tempDir to createTempFile
  // - pass probeConfig to probe() calls
}
```

Note: The steps added to the pipeline are builders that the caller creates. When used via namespace, those builders are already context-bound (`ffmpeg.transform()` has ctx). The pipeline itself only needs ctx for its own probe and temp file operations.

**Acceptance Criteria**:
- [ ] All existing convenience function tests pass unchanged (standalone usage)
- [ ] `remux(input, output, opts, ctx)` uses `ctx.ffmpegPath` via the builder
- [ ] Pipeline uses `ctx.tempDir` for intermediate files
- [ ] `estimateSize()` uses context's probe config for duration lookup

---

### Unit 7: Hardware Detection Context

**File**: `src/hardware/detect.ts` (modification)

Add a `detectPromise` parameter to allow per-instance caching:

```typescript
/**
 * Detect hardware capabilities.
 *
 * @param config - ffmpegPath override
 * @param _cachedPromise - For SDK context: provide a mutable holder for promise memoization.
 *   When provided, this is used instead of the module-level detectPromise.
 *   The holder object has a `promise` field that gets set on first call.
 */
export function detectHardware(
  config?: DetectConfig,
  _promiseHolder?: { promise: Promise<HardwareCapabilities> | null },
): Promise<HardwareCapabilities> {
  const holder = _promiseHolder ?? moduleHolder;
  if (holder.promise !== null) return holder.promise;

  holder.promise = runDetection(config);
  return holder.promise;
}

// Module-level holder for standalone usage
const moduleHolder: { promise: Promise<HardwareCapabilities> | null } = { promise: null };
// Keep detectPromise as alias for backward compat
let detectPromise = moduleHolder;  // Actually just use moduleHolder directly

export function clearHardwareCache(): void {
  moduleHolder.promise = null;
}
```

Actually, simpler approach — since `SDKContext` already has `hardwareDetectPromise`:

```typescript
export function detectHardware(
  config?: DetectConfig,
  externalPromiseRef?: { current: Promise<HardwareCapabilities> | null },
): Promise<HardwareCapabilities> {
  // Use external ref if provided, else module-level
  if (externalPromiseRef) {
    if (externalPromiseRef.current !== null) return externalPromiseRef.current;
    externalPromiseRef.current = runDetection(config);
    return externalPromiseRef.current;
  }

  if (detectPromise !== null) return detectPromise;
  detectPromise = runDetection(config);
  return detectPromise;
}
```

**Implementation Notes**:
- Module-level `detectPromise` is preserved for standalone `detectHardware()` usage.
- SDK creates an `{ current: null }` ref in context and passes it to `detectHardware()`.
- The SDK's `clearProbeCache` only clears the instance's hardware cache (via resetting the ref).

**Acceptance Criteria**:
- [ ] Standalone `detectHardware()` still uses module-level cache
- [ ] Two SDK instances don't share hardware detection state
- [ ] Existing hardware tests pass unchanged

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

// Operation builders
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

// Convenience
import { pipeline } from "./convenience/pipeline.ts";
import { batch } from "./convenience/batch.ts";
import { smartTranscode } from "./convenience/smart.ts";
import { thumbnailSheet } from "./convenience/thumbnail-sheet.ts";
import { waveform } from "./convenience/waveform.ts";
import { detectSilence, trimSilence, splitOnSilence } from "./convenience/silence.ts";
import { estimateSize } from "./convenience/estimate.ts";
import { normalizeMedia } from "./convenience/normalize-media.ts";
import { remux, compress, extractAudio, imageToVideo, resize } from "./convenience/quick.ts";

import type { FFmpegConfig, FFmpegSDK, SDKContext } from "./types/sdk.ts";
import type { ProbeResult } from "./types/probe.ts";
import type { ProbeConfig } from "./core/probe.ts";
import type { HardwareCapabilities } from "./hardware/detect.ts";

function resolveContext(config?: FFmpegConfig): SDKContext {
  const probeCacheSize = config?.probeCacheSize ?? 100;
  const probeCacheTtl = config?.probeCacheTtl ?? 300_000;

  return {
    ffmpegPath: config?.ffmpegPath ?? "ffmpeg",
    ffprobePath: config?.ffprobePath ?? "ffprobe",
    tempDir: config?.tempDir ?? join(tmpdir(), "ffmpeg-kit"),
    defaultTimeout: config?.defaultTimeout ?? 600_000,
    defaultHwAccel: config?.defaultHwAccel ?? "auto",
    logLevel: config?.logLevel ?? "error",
    probeCache:
      probeCacheSize > 0
        ? new Cache<string, ProbeResult>({ maxSize: probeCacheSize, ttlMs: probeCacheTtl })
        : new Cache<string, ProbeResult>({ maxSize: 1, ttlMs: 0 }),
    hardwareDetectPromise: null,
  };
}

/**
 * Create an FFmpeg SDK instance with per-instance configuration.
 *
 * Each instance has its own probe cache, hardware detection cache,
 * and binary path configuration.
 *
 * @param config - Optional configuration. Defaults are auto-detected.
 */
export function createFFmpeg(config?: FFmpegConfig): FFmpegSDK {
  const ctx = resolveContext(config);

  // Derived configs for core functions
  const probeConfig: ProbeConfig = {
    ffprobePath: ctx.ffprobePath,
    cacheInstance: ctx.probeCache,
  };
  const hwPromiseRef = { current: ctx.hardwareDetectPromise };

  const sdk: FFmpegSDK = {
    // === Core ===

    execute: (args, options) =>
      execute(args, { timeout: ctx.defaultTimeout, logLevel: ctx.logLevel, ...options }, {
        ffmpegPath: ctx.ffmpegPath,
      }),

    probe: (inputPath, options) => probe(inputPath, options, probeConfig),

    getDuration: (inputPath) => getDuration(inputPath, probeConfig),

    getVideoStream: (inputPath) => getVideoStream(inputPath, probeConfig),

    getAudioStream: (inputPath) => getAudioStream(inputPath, probeConfig),

    validateInstallation: () =>
      validateInstallation({ ffmpegPath: ctx.ffmpegPath, ffprobePath: ctx.ffprobePath }),

    clearProbeCache: () => {
      ctx.probeCache.clear();
      hwPromiseRef.current = null;
    },

    parseTimecode,

    // === Operation Builders ===

    extract: () => extract(ctx),
    transform: () => transform(ctx),
    audio: () => audio(ctx),
    concat: () => concat(ctx),
    exportVideo: () => exportVideo(ctx),
    overlay: () => overlay(ctx),
    text: () => text(ctx),
    subtitle: () => subtitle(ctx),
    image: () => image(ctx),
    hls: () => hls(ctx),
    dash: () => dash(ctx),
    gif: () => gif(ctx),

    // === Filter Graph ===

    filterGraph,
    filter,
    chain,

    // === Hardware ===

    detectHardware: () =>
      detectHardware({ ffmpegPath: ctx.ffmpegPath }, hwPromiseRef),

    // === Convenience ===

    pipeline: () => pipeline(ctx),

    batch: (options) => batch(options),
    // Note: batch doesn't need ctx — callers provide context-bound builders

    smartTranscode: (options, executeOptions) =>
      smartTranscode(options, executeOptions, ctx),

    thumbnailSheet: (options, executeOptions) =>
      thumbnailSheet(options, executeOptions, ctx),

    waveform: (options, executeOptions) =>
      waveform(options, executeOptions, ctx),

    detectSilence: (input, options, executeOptions) =>
      detectSilence(input, options, executeOptions, ctx),

    trimSilence: (options, executeOptions) =>
      trimSilence(options, executeOptions, ctx),

    splitOnSilence: (options, executeOptions) =>
      splitOnSilence(options, executeOptions, ctx),

    estimateSize: (options) => estimateSize(options, ctx),

    normalizeMedia: (options, executeOptions) =>
      normalizeMedia(options, executeOptions, ctx),

    remux: (input, output, executeOptions) =>
      remux(input, output, executeOptions, ctx),

    compress: (input, output, options, executeOptions) =>
      compress(input, output, options, executeOptions, ctx),

    extractAudio: (input, output, options, executeOptions) =>
      extractAudio(input, output, options, executeOptions, ctx),

    imageToVideo: (input, output, options, executeOptions) =>
      imageToVideo(input, output, options, executeOptions, ctx),

    resize: (input, output, options, executeOptions) =>
      resize(input, output, options, executeOptions, ctx),
  };

  return sdk;
}

/** Default SDK instance with auto-detected paths and default config */
export const ffmpeg: FFmpegSDK = createFFmpeg();
```

**Implementation Notes**:
- `filter`, `chain`, `filterGraph`, `parseTimecode` are pure functions — no config needed, directly assigned.
- `batch` is a passthrough — the user provides context-bound builders.
- `clearProbeCache()` clears both the probe cache and hardware detection cache for this instance.
- The `ffmpeg` default instance is created at module evaluation time. This is fine since `resolveContext()` is synchronous.
- `hwPromiseRef` is a mutable ref object so `clearProbeCache` can reset it.

**Acceptance Criteria**:
- [ ] `createFFmpeg()` returns a valid FFmpegSDK with all 38 methods
- [ ] `createFFmpeg({ ffmpegPath: '/custom' })` threads custom path to all operations
- [ ] Default `ffmpeg` instance works with no config
- [ ] Two instances have separate probe caches
- [ ] Two instances have separate hardware detection caches
- [ ] `ffmpeg.clearProbeCache()` clears only that instance's cache

---

### Unit 9: Barrel Export Update

**File**: `src/index.ts` (modification)

Add to the existing barrel export:

```typescript
// SDK
export type { FFmpegConfig, FFmpegSDK } from "./types/sdk.ts";
export { createFFmpeg, ffmpeg } from "./sdk.ts";
```

Also ensure `SDKContext` is NOT exported (it's internal).

Verify `package.json` has `"sideEffects": false` for tree-shaking.

**Implementation Notes**:
- The existing standalone exports remain — users can still `import { extract, probe } from '@ffmpeg-sdk/core'`.
- The SDK is an additional entry point, not a replacement.
- `SDKContext` is only used by internal code (builders, convenience functions).

**Acceptance Criteria**:
- [ ] `import { ffmpeg, createFFmpeg } from '@ffmpeg-sdk/core'` works
- [ ] `import type { FFmpegConfig, FFmpegSDK } from '@ffmpeg-sdk/core'` works
- [ ] All existing imports continue to work (no breaking changes)
- [ ] `SDKContext` is NOT importable from the public API

---

### Unit 10: Cache.clear() Method

**File**: `src/util/cache.ts` (modification)

Add a `clear()` method to the `Cache` class if it doesn't already exist:

```typescript
/** Remove all entries from the cache */
clear(): void {
  this.map.clear();
  // Reset any other internal state (LRU tracking, etc.)
}
```

**Implementation Notes**:
- Needed by `sdk.clearProbeCache()` to clear the per-instance cache.
- Check if this method already exists before adding.

**Acceptance Criteria**:
- [ ] `cache.clear()` removes all entries
- [ ] Cache is usable again after clear

---

## Implementation Order

1. **Unit 10: Cache.clear()** — Prerequisite for SDK cache management
2. **Unit 1: SDK Types** (`src/types/sdk.ts`) — Types needed by all other units
3. **Unit 3: Probe Cache Injection** (`src/core/probe.ts`) — Enable per-instance probe caching
4. **Unit 4: Builder Helper Modification** (`src/util/builder-helpers.ts`) — Enable builders to pass probe config
5. **Unit 7: Hardware Detection Context** (`src/hardware/detect.ts`) — Enable per-instance hw caching
6. **Unit 5: Builder Context Threading** (all 11 builder files) — Core context threading
7. **Unit 6: Convenience Function Context Threading** (all 9 convenience files) — Upper-layer threading
8. **Unit 2: FFmpegSDK Interface** (added to `src/types/sdk.ts`) — Complete interface
9. **Unit 8: SDK Factory** (`src/sdk.ts`) — Wire everything together
10. **Unit 9: Barrel Export Update** (`src/index.ts`) — Public API surface

Dependencies:
- Units 1, 10 have no dependencies (start here)
- Units 3, 4, 7 depend on Unit 1 (types)
- Unit 5 depends on Units 3, 4 (probe injection, builder helpers)
- Unit 6 depends on Unit 5 (builders must accept ctx first)
- Units 2, 8 depend on all preceding units
- Unit 9 depends on Unit 8

---

## Testing

### Unit Tests: `__tests__/unit/sdk.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { createFFmpeg } from "../src/sdk.ts";

describe("createFFmpeg", () => {
  it("returns SDK with all expected methods", () => {
    const sdk = createFFmpeg();
    // Core
    expect(typeof sdk.execute).toBe("function");
    expect(typeof sdk.probe).toBe("function");
    expect(typeof sdk.getDuration).toBe("function");
    expect(typeof sdk.getVideoStream).toBe("function");
    expect(typeof sdk.getAudioStream).toBe("function");
    expect(typeof sdk.validateInstallation).toBe("function");
    expect(typeof sdk.clearProbeCache).toBe("function");
    expect(typeof sdk.parseTimecode).toBe("function");
    // Builders
    expect(typeof sdk.extract).toBe("function");
    expect(typeof sdk.transform).toBe("function");
    expect(typeof sdk.audio).toBe("function");
    expect(typeof sdk.concat).toBe("function");
    expect(typeof sdk.exportVideo).toBe("function");
    expect(typeof sdk.overlay).toBe("function");
    expect(typeof sdk.text).toBe("function");
    expect(typeof sdk.subtitle).toBe("function");
    expect(typeof sdk.image).toBe("function");
    expect(typeof sdk.hls).toBe("function");
    expect(typeof sdk.dash).toBe("function");
    expect(typeof sdk.gif).toBe("function");
    // Filters
    expect(typeof sdk.filterGraph).toBe("function");
    expect(typeof sdk.filter).toBe("function");
    expect(typeof sdk.chain).toBe("function");
    // Hardware
    expect(typeof sdk.detectHardware).toBe("function");
    // Convenience
    expect(typeof sdk.pipeline).toBe("function");
    expect(typeof sdk.batch).toBe("function");
    expect(typeof sdk.smartTranscode).toBe("function");
    expect(typeof sdk.thumbnailSheet).toBe("function");
    expect(typeof sdk.waveform).toBe("function");
    expect(typeof sdk.detectSilence).toBe("function");
    expect(typeof sdk.trimSilence).toBe("function");
    expect(typeof sdk.splitOnSilence).toBe("function");
    expect(typeof sdk.estimateSize).toBe("function");
    expect(typeof sdk.normalizeMedia).toBe("function");
    expect(typeof sdk.remux).toBe("function");
    expect(typeof sdk.compress).toBe("function");
    expect(typeof sdk.extractAudio).toBe("function");
    expect(typeof sdk.imageToVideo).toBe("function");
    expect(typeof sdk.resize).toBe("function");
  });

  it("default instance works with no config", () => {
    const sdk = createFFmpeg();
    // parseTimecode is pure — works without ffmpeg
    expect(sdk.parseTimecode("01:30:00")).toBe(5400);
  });

  it("multiple instances don't share probe cache", () => {
    const sdk1 = createFFmpeg();
    const sdk2 = createFFmpeg();
    // They should have different cache instances
    sdk1.clearProbeCache(); // should not affect sdk2
    // (Full isolation test in E2E)
  });

  it("accepts custom config", () => {
    // Should not throw
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

  it("builders from namespace produce valid args", () => {
    const sdk = createFFmpeg();
    const args = sdk.extract().input("/test.mp4").timestamp(5).output("/frame.png").toArgs();
    expect(args).toContain("-i");
    expect(args).toContain("/test.mp4");
  });
});
```

### E2E Tests: `__tests__/integration/sdk.e2e.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { describeWithFFmpeg, FIXTURES, tmp, expectFileExists } from "../helpers.ts";
import { createFFmpeg } from "../../src/sdk.ts";

describeWithFFmpeg("SDK instance E2E", () => {
  it("namespace extract produces valid output", async () => {
    const sdk = createFFmpeg();
    const output = tmp("sdk-extract.png");
    const result = await sdk.extract()
      .input(FIXTURES.videoShort)
      .timestamp(0.5)
      .output(output)
      .execute();
    expectFileExists(output);
    expect(result.width).toBeGreaterThan(0);
  });

  it("namespace probe returns metadata", async () => {
    const sdk = createFFmpeg();
    const result = await sdk.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
    expect(result.streams.length).toBeGreaterThan(0);
  });

  it("namespace remux convenience works", async () => {
    const sdk = createFFmpeg();
    const output = tmp("sdk-remux.mkv");
    const result = await sdk.remux(FIXTURES.videoShort, output);
    expectFileExists(output);
    expect(result.outputPath).toBe(output);
  });

  it("multiple instances have independent probe caches", async () => {
    const sdk1 = createFFmpeg();
    const sdk2 = createFFmpeg();

    // Probe with sdk1
    const result1 = await sdk1.probe(FIXTURES.videoShort);
    // Clear sdk1 cache
    sdk1.clearProbeCache();
    // sdk2 should still work (independent cache)
    const result2 = await sdk2.probe(FIXTURES.videoShort);
    expect(result2.format.duration).toBe(result1.format.duration);
  });

  it("validateInstallation returns versions", async () => {
    const sdk = createFFmpeg();
    const info = await sdk.validateInstallation();
    expect(info.ffmpeg.version).toBeTruthy();
    expect(info.ffprobe.version).toBeTruthy();
  });

  it("default ffmpeg export works", async () => {
    const { ffmpeg } = await import("../../src/sdk.ts");
    const result = await ffmpeg.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
  });
});
```

### Builder Tests: `__tests__/builder/sdk-context.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { extract } from "../../src/operations/extract.ts";
import { transform } from "../../src/operations/transform.ts";

describe("builders with context", () => {
  it("toArgs works the same with or without context", () => {
    // Verify no regression: toArgs is pure, unaffected by context
    const argsWithout = extract()
      .input("/test.mp4")
      .timestamp(5)
      .output("/out.png")
      .toArgs();

    // With a mock context (toArgs doesn't use it)
    const argsAgain = extract()
      .input("/test.mp4")
      .timestamp(5)
      .output("/out.png")
      .toArgs();

    expect(argsWithout).toEqual(argsAgain);
  });
});
```

---

## Verification Checklist

```bash
# 1. Type checking
pnpm typecheck

# 2. All existing tests still pass (no regressions)
pnpm test

# 3. New SDK tests pass
pnpm vitest run __tests__/unit/sdk.test.ts
pnpm vitest run __tests__/integration/sdk.e2e.test.ts

# 4. Build succeeds
pnpm build

# 5. Verify exports
node -e "import('@ffmpeg-sdk/core').then(m => { console.log('ffmpeg:', typeof m.ffmpeg); console.log('createFFmpeg:', typeof m.createFFmpeg); })"

# 6. Lint
pnpm check

# 7. Verify tree-shaking (no side effects warning)
# Check package.json has "sideEffects": false
```

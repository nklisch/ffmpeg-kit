# Design: Phase 10 — Convenience Layer

## Overview

High-level features built on top of operation builders. These are the "one-call" functions that compose lower-level builders, manage temp files, and provide simplified APIs for common workflows.

All convenience functions are standalone exports (not builders), except `pipeline()` which uses a builder pattern for step chaining.

---

## New Types

### File: `src/types/results.ts` (additions)

```typescript
/** Result from pipeline execution */
export interface PipelineResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
  /** Number of steps executed */
  stepCount: number;
  /** Per-step durations in milliseconds */
  stepDurations: number[];
}

/** Result from batch processing */
export interface BatchResult<T> {
  /** Results in the same order as inputs */
  results: Array<BatchItemResult<T>>;
  /** Total processing time in ms */
  totalDurationMs: number;
}

export type BatchItemResult<T> =
  | { success: true; input: string; data: T }
  | { success: false; input: string; error: FFmpegError };

/** Action taken for each stream in smart transcode */
export type TranscodeAction = "copy_video" | "transcode_video" | "copy_audio" | "transcode_audio" | "copy_all" | "add_audio";

/** Result from smart transcode */
export interface SmartTranscodeResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
  /** Actions taken per stream */
  actions: TranscodeAction[];
}

/** Result from thumbnail sheet generation */
export interface ThumbnailSheetResult {
  outputPath: string;
  /** Total image width */
  width: number;
  /** Total image height */
  height: number;
  /** Timestamps of extracted frames in seconds */
  timestamps: number[];
  sizeBytes: number;
}

/** Result from waveform extraction */
export interface WaveformResult {
  /** Samples per second (matches requested fps) */
  sampleRate: number;
  /** Peak amplitude values (0-1 range) */
  data: Float32Array;
  /** Total duration of input in seconds */
  duration: number;
}

/** Result from silence detection */
export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

/** Result from split on silence */
export interface SplitSegment {
  path: string;
  start: number;
  end: number;
  duration: number;
}

/** Result from file size estimation */
export interface EstimateResult {
  /** Estimated size in bytes */
  bytes: number;
  /** Human-readable size string */
  formatted: string;
  /** Confidence level */
  confidence: "high" | "medium" | "low";
}
```

---

## Implementation Units

### Unit 1: Pipeline

**File**: `src/convenience/pipeline.ts`

```typescript
import type { ExecuteOptions, ProgressInfo } from "../types/options.ts";
import type { OperationResult, PipelineResult } from "../types/results.ts";

/** Any builder that has input(), output(), and execute() */
interface PipelineStep {
  input(path: string): PipelineStep;
  output(path: string): PipelineStep;
  execute(options?: ExecuteOptions): Promise<unknown>;
}

interface OnStepCompleteInfo {
  stepIndex: number;
  stepCount: number;
  durationMs: number;
}

export interface PipelineBuilder {
  /** Add an operation builder as a step. The builder should NOT have input/output set — pipeline manages those. */
  step(builder: PipelineStep): this;
  /** Set the initial input file */
  input(path: string): this;
  /** Set the final output file */
  output(path: string): this;
  /** Callback when each step completes */
  onStepComplete(callback: (info: OnStepCompleteInfo) => void): this;
  execute(options?: ExecuteOptions): Promise<PipelineResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<PipelineResult>>;
}

export function pipeline(): PipelineBuilder;
```

**Implementation Notes**:
- State: `{ steps: PipelineStep[], inputPath?: string, outputPath?: string, onStepCompleteCallback? }`
- `execute()` flow:
  1. Validate: at least one step, input and output set
  2. Create N-1 temp files via `createTempFiles(steps.length - 1, { suffix: '.mp4' })`
  3. For each step i:
     - Input = (i === 0) ? inputPath : tempFiles[i-1].path
     - Output = (i === steps.length - 1) ? outputPath : tempFiles[i].path
     - Call `step.input(input).output(output).execute(options)`
     - Record step duration, call `onStepComplete` if set
  4. In finally block: cleanup all temp files
  5. Probe final output via `probeOutput()`, return `PipelineResult`
- Progress: If `options.onProgress` is set, pass it through to each step. Calculate aggregate percent as `(completedSteps / totalSteps) * 100 + (stepPercent / totalSteps)`.
- The suffix of temp files should match the final output extension when possible, but default to `.mp4`.

**Acceptance Criteria**:
- [ ] Pipeline with 2+ steps produces valid output
- [ ] Temp files are cleaned up after success
- [ ] Temp files are cleaned up after failure (a step throws)
- [ ] `onStepComplete` is called for each step with correct index
- [ ] Single-step pipeline works (no temp files needed)

---

### Unit 2: Batch

**File**: `src/convenience/batch.ts`

```typescript
import type { ExecuteOptions } from "../types/options.ts";
import type { BatchItemResult, BatchResult } from "../types/results.ts";

interface BatchOptions<T> {
  /** Input file paths */
  inputs: string[];
  /** Max concurrent ffmpeg processes (default: 3) */
  concurrency?: number;
  /** Factory that creates an operation builder for each input. The builder should have output set but NOT input. */
  operation: (input: string) => {
    input(path: string): unknown;
    execute(options?: ExecuteOptions): Promise<T>;
  };
  /** Called when a single item completes successfully */
  onItemComplete?: (input: string, result: T) => void;
  /** Called when a single item fails */
  onItemError?: (input: string, error: Error) => void;
}

export function batch<T>(options: BatchOptions<T>): Promise<BatchResult<T>>;
```

**Implementation Notes**:
- Use a simple concurrency limiter: maintain an active count, process items from a queue.
- Implementation approach: iterate inputs, maintain a pool of active promises (up to `concurrency`), await when pool is full.
- Each item: call `operation(input).input(input).execute()`, wrap in try/catch to produce `BatchItemResult`.
- Results array preserves input order (not completion order). Use index-based assignment.
- Record start time, compute `totalDurationMs` at end.
- Default concurrency: 3 (safe for NVENC session limits).

**Acceptance Criteria**:
- [ ] Processes all inputs, returns results in input order
- [ ] Respects concurrency limit (never more than N concurrent)
- [ ] `onItemComplete` called for successful items
- [ ] `onItemError` called for failed items
- [ ] Individual failures don't stop the batch
- [ ] Empty inputs array returns empty results

---

### Unit 3: Smart Transcode

**File**: `src/convenience/smart.ts`

```typescript
import type { AudioCodec, HwAccelMode, PixelFormat, VideoCodec } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, SmartTranscodeResult, TranscodeAction } from "../types/results.ts";

interface SmartTranscodeTarget {
  videoCodec?: string;
  maxWidth?: number;
  maxHeight?: number;
  pixelFormat?: PixelFormat;
  audioCodec?: string;
  audioSampleRate?: number;
  maxBitrate?: string;
}

interface SmartTranscodeOptions {
  input: string;
  output: string;
  target: SmartTranscodeTarget;
  hwAccel?: HwAccelMode;
}

export function smartTranscode(
  options: SmartTranscodeOptions,
  executeOptions?: ExecuteOptions,
): Promise<SmartTranscodeResult>;
```

**Implementation Notes**:
- Flow:
  1. Probe input with `probe()`
  2. Compare each property against target:
     - Video codec: compare `stream.codec` vs `target.videoCodec`
     - Dimensions: check `width <= maxWidth && height <= maxHeight`
     - Pixel format: compare `stream.pixelFormat` vs `target.pixelFormat`
     - Audio codec: compare `stream.codec` vs `target.audioCodec`
     - Audio sample rate: compare `stream.sampleRate` vs `target.audioSampleRate`
     - Bitrate: compare `format.bitrate` vs parsed `maxBitrate`
  3. Build actions array based on what needs transcoding
  4. If everything matches: use `-c copy` (stream copy)
  5. If only audio needs transcoding: `-c:v copy` + audio encoding args
  6. If only video needs transcoding: video encoding args + `-c:a copy`
  7. If both: full transcode
  8. Use `exportVideo()` builder internally, applying the determined settings
  9. Probe output, return `SmartTranscodeResult`
- Parse `maxBitrate` string (e.g., "10M" → 10_000_000) for comparison.
- Codec comparison should normalize: "h264" matches "libx264", "aac" matches "aac".

**Acceptance Criteria**:
- [ ] Stream-copies when input already matches target
- [ ] Re-encodes video when dimensions exceed max
- [ ] Re-encodes audio when codec doesn't match
- [ ] Returns correct `actions` array describing what was done
- [ ] Works with hw accel mode

---

### Unit 4: Thumbnail Sheet

**File**: `src/convenience/thumbnail-sheet.ts`

```typescript
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, ThumbnailSheetResult } from "../types/results.ts";

interface ThumbnailSheetOptions {
  input: string;
  /** Number of columns in the grid */
  columns: number;
  /** Number of rows in the grid */
  rows: number;
  /** Width of each individual thumbnail in pixels */
  width: number;
  /** How to select timestamps */
  timestamps: "uniform" | "scene" | number[];
  output: string;
}

export function thumbnailSheet(
  options: ThumbnailSheetOptions,
  executeOptions?: ExecuteOptions,
): Promise<ThumbnailSheetResult>;
```

**Implementation Notes**:
- Total frames = columns × rows
- Timestamp calculation:
  - `"uniform"`: Probe duration, divide evenly: `timestamps[i] = (i + 0.5) * duration / totalFrames`
  - `"scene"`: Use `select='gt(scene,0.3)'` filter to pick scene-change frames, take first N
  - `number[]`: Use the provided timestamps directly (validate length = columns × rows)
- Strategy: Extract individual frames to temp files, then tile them.
  1. Extract each frame via `extract().input(input).timestamp(ts).size({ width }).output(tempPath).execute()`
  2. Build a filter_complex to tile: multiple inputs → `[0:v][1:v]...[N:v]xstack=inputs=N:layout=...`
  3. The `xstack` layout string: `layout=0_0|w0_0|...|0_h0|w0_h0|...` for grid
- Alternative simpler strategy: Use ffmpeg `select` + `tile` filters in a single pass:
  ```
  -vf "select='eq(n,F1)+eq(n,F2)+...',scale=W:-2,tile=CxR" -frames:v 1
  ```
  where F1, F2 are frame numbers computed from timestamps × fps.
  This is the preferred approach — single ffmpeg invocation, no temp files.
- For `"uniform"` and `number[]`: compute frame numbers from timestamps using probe fps.
- For `"scene"`: use `select='gt(scene,0.3)'` + `tile` in one pass, with `-frames:v 1 -vsync vfr`.
- Probe output for dimensions, return result.

**Acceptance Criteria**:
- [ ] Generates image with correct grid dimensions (columns × width, rows × height)
- [ ] Uniform mode produces evenly spaced frames
- [ ] Custom timestamps mode uses provided timestamps
- [ ] Output is a valid image file (JPEG or PNG based on extension)
- [ ] Returns correct `timestamps` array

---

### Unit 5: Waveform

**File**: `src/convenience/waveform.ts`

```typescript
import type { ExecuteOptions } from "../types/options.ts";
import type { WaveformResult } from "../types/results.ts";

interface WaveformOptions {
  input: string;
  /** Samples per second (e.g., 30 for video fps match) */
  samplesPerSecond: number;
  /** Channel handling */
  channels?: "mono" | "stereo" | "all";
  /** Data format */
  format?: "peaks" | "rms" | "raw";
}

export function waveform(
  options: WaveformOptions,
  executeOptions?: ExecuteOptions,
): Promise<WaveformResult>;
```

**Implementation Notes**:
- Use ffmpeg to extract raw amplitude data via `astats` filter with per-frame output.
- Approach:
  1. Probe input for duration
  2. Downsample to target rate: use `aresample` to convert sample rate, then `astats=metadata=1:reset=1` to get per-frame stats
  3. Actually, simpler: use `-af "aresample=SR,astats=metadata=1:reset=1" -f null -` and parse stderr
  4. Even simpler: extract raw PCM at the desired sample rate:
     ```
     -i input -ac 1 -ar <samplesPerSecond> -f f32le -acodec pcm_f32le pipe:1
     ```
     Then read stdout as Float32Array. Each sample IS the amplitude.
  5. For "peaks" format: take absolute max of each sample window (already done if ar = samplesPerSecond)
  6. For "rms": compute RMS of each window
- The PCM pipe approach is the cleanest:
  - `-ac 1` for mono (or `-ac 2` for stereo)
  - `-ar <samplesPerSecond>` for the desired sample rate
  - `-f f32le -c:a pcm_f32le pipe:1` to get raw 32-bit floats on stdout
  - Read the stdout buffer, convert to Float32Array
  - For "peaks": take `Math.abs()` of each sample (already peak since one sample per frame at this rate)
- Use `execute()` directly with the raw args, then process stdout.
- Need to use `execute()` with a modified approach since we need stdout as binary. Actually, `execute()` collects stdout as string. We need raw binary.
- **Important**: The current `execute()` collects stdout as a string via `data.toString()`. For binary data, we need to either:
  a. Write to a temp file instead of pipe, then read the file
  b. Or modify the approach to use a temp file output

  Use approach (a): output to a temp `.raw` file, then read it with `fs.readFileSync`.
  ```
  -i input -ac 1 -ar <samplesPerSecond> -f f32le output.raw
  ```
  Then `Buffer.from(readFileSync(output.raw))` → `new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)`

**Acceptance Criteria**:
- [ ] Returns Float32Array with approximately `duration × samplesPerSecond` samples
- [ ] Values are in reasonable range (-1 to 1 for raw, 0 to 1 for peaks)
- [ ] Mono channel mode produces single-channel data
- [ ] Returns correct duration matching input

---

### Unit 6: Silence Utilities

**File**: `src/convenience/silence.ts`

```typescript
import type { ExecuteOptions } from "../types/options.ts";
import type { SilenceRange, SplitSegment } from "../types/results.ts";

interface DetectSilenceOptions {
  /** Silence threshold in dB (default: -50) */
  threshold?: number;
  /** Minimum silence duration in seconds (default: 0.5) */
  minDuration?: number;
}

interface TrimSilenceOptions {
  input: string;
  output: string;
  /** Silence threshold in dB (default: -40) */
  threshold?: number;
  /** Keep this much silence at edges in seconds (default: 0.1) */
  padding?: number;
}

interface SplitOnSilenceOptions {
  input: string;
  /** Output directory for segments */
  outputDir: string;
  /** Silence threshold in dB (default: -40) */
  threshold?: number;
  /** Minimum silence duration for a split point (default: 0.5) */
  minSilence?: number;
  /** Minimum segment duration in seconds (default: 1.0) */
  minSegment?: number;
}

export function detectSilence(
  input: string,
  options?: DetectSilenceOptions,
  executeOptions?: ExecuteOptions,
): Promise<SilenceRange[]>;

export function trimSilence(
  options: TrimSilenceOptions,
  executeOptions?: ExecuteOptions,
): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

export function splitOnSilence(
  options: SplitOnSilenceOptions,
  executeOptions?: ExecuteOptions,
): Promise<SplitSegment[]>;
```

**Implementation Notes**:

- **`detectSilence()`**: Use the `audio()` builder's `detectSilence()` method internally. It already parses silence ranges from stderr.
  ```typescript
  const result = await audio()
    .input(input)
    .detectSilence({ threshold, duration: minDuration })
    .output("-") // null output, detectSilence uses -f null
    .execute(executeOptions);
  return result.silenceRanges ?? [];
  ```
  Actually, the audio builder's detectSilence mode outputs to null and returns `silenceRanges` in the result. So just call it and return the ranges.

- **`trimSilence()`**:
  1. Call `detectSilence()` to find silence ranges
  2. Find the first non-silence start time (end of first silence if it starts at 0, or 0 otherwise)
  3. Find the last non-silence end time (start of last silence if it extends to end, or duration)
  4. Apply padding: `start = max(0, firstNonSilence - padding)`, `end = min(duration, lastNonSilence + padding)`
  5. Use `transform().input(...).trimStart(start).trimEnd(end).output(...).execute()`
  6. Probe output, return result

- **`splitOnSilence()`**:
  1. Call `detectSilence()` to find silence ranges
  2. Filter silences by `minSilence` duration
  3. Compute segment boundaries: between each silence, the midpoint of the silence is the split point
  4. Filter out segments shorter than `minSegment`
  5. For each segment, use `transform().input(...).trimStart(start).duration(segDuration).output(segPath).execute()`
  6. Output files named `segment_001.wav`, `segment_002.wav`, etc. (extension matches input)
  7. Return array of `SplitSegment`

**Acceptance Criteria**:
- [ ] `detectSilence()` returns silence ranges from known-silent fixture
- [ ] `trimSilence()` produces output shorter than input
- [ ] `trimSilence()` respects padding parameter
- [ ] `splitOnSilence()` creates multiple output files in the specified directory
- [ ] `splitOnSilence()` respects `minSegment` (no tiny segments)

---

### Unit 7: Estimate

**File**: `src/convenience/estimate.ts`

```typescript
import type { ExportPreset } from "../types/codecs.ts";
import type { EstimateResult } from "../types/results.ts";

interface EstimateOptions {
  input: string;
  /** Use preset to determine bitrate */
  preset?: ExportPreset;
  /** Explicit video bitrate (e.g., '5M') */
  videoBitrate?: string;
  /** Explicit audio bitrate (e.g., '192k') */
  audioBitrate?: string;
  /** Override duration (seconds) */
  duration?: number;
}

export function estimateSize(options: EstimateOptions): Promise<EstimateResult>;
```

**Implementation Notes**:
- Flow:
  1. Probe input for duration (unless `duration` override provided)
  2. Determine video bitrate:
     - If `preset`: look up preset config, use its bitrate or estimate from CRF (CRF estimation is low confidence)
     - If `videoBitrate`: parse to bits/sec
     - Otherwise: use input's current bitrate from probe
  3. Determine audio bitrate: from `audioBitrate` or preset or probe
  4. Calculate: `bytes = (videoBitrate + audioBitrate) * duration / 8`
  5. Confidence:
     - "high" if explicit bitrates provided (CBR/VBR target)
     - "medium" if using input probe bitrate
     - "low" if estimating from CRF/preset (CRF is variable)
  6. Format: `formatBytes(bytes)` → "145.2 MB"
- Bitrate parsing: "5M" → 5_000_000, "192k" → 192_000, "10000" → 10_000

**Acceptance Criteria**:
- [ ] Estimate with explicit bitrates is within 10% of actual
- [ ] Estimate from preset returns reasonable value
- [ ] Returns appropriate confidence level
- [ ] `formatted` string is human-readable

---

### Unit 8: Normalize Media

**File**: `src/convenience/normalize-media.ts`

```typescript
import type { HwAccelMode, PixelFormat } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";

interface NormalizeTarget {
  width: number;
  height: number;
  fps: number;
  pixelFormat?: PixelFormat;
  audioSampleRate?: number;
  audioChannels?: number;
}

interface NormalizeMediaOptions {
  inputs: string[];
  outputDir: string;
  target: NormalizeTarget;
  /** Skip re-encoding if input already matches target (default: true) */
  skipIfMatching?: boolean;
  hwAccel?: HwAccelMode;
}

interface NormalizeMediaResult {
  outputs: Array<{
    inputPath: string;
    outputPath: string;
    action: "transcoded" | "copied" | "skipped";
    sizeBytes: number;
  }>;
}

export function normalizeMedia(
  options: NormalizeMediaOptions,
  executeOptions?: ExecuteOptions,
): Promise<NormalizeMediaResult>;
```

**Implementation Notes**:
- Flow for each input:
  1. Probe input
  2. Compare dimensions, fps, pixel format, audio properties against target
  3. If `skipIfMatching` and all match: copy file to outputDir, record as "skipped" (or "copied")
  4. Otherwise: use `exportVideo()` builder with appropriate scale filter and encoding settings
     - Apply scale to target dimensions
     - Set fps
     - Set pixel format
     - Set audio sample rate and channels
  5. Output filename: same basename in `outputDir`
- Uses `batch()` internally for concurrent processing? No — keep it simple, process sequentially. The caller can use `batch()` separately if they want concurrency.
- Actually, processing sequentially is fine for this utility. Use a for...of loop.

**Acceptance Criteria**:
- [ ] All outputs have matching dimensions, fps
- [ ] Files already matching are skipped (when `skipIfMatching: true`)
- [ ] Output files are written to the specified directory
- [ ] Returns correct action for each file

---

### Unit 9: Quick Conversions

**File**: `src/convenience/quick.ts`

```typescript
import type { AudioCodec, QualityTier } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { ExportResult, TransformResult } from "../types/results.ts";

/** Container remux (no re-encoding) */
export function remux(
  input: string,
  output: string,
  executeOptions?: ExecuteOptions,
): Promise<ExportResult>;

/** Quick compress with quality tier */
export function compress(
  input: string,
  output: string,
  options?: { quality?: QualityTier },
  executeOptions?: ExecuteOptions,
): Promise<ExportResult>;

/** Extract audio track from video */
export function extractAudio(
  input: string,
  output: string,
  options?: { codec?: AudioCodec; bitrate?: string },
  executeOptions?: ExecuteOptions,
): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

/** Create video from a still image */
export function imageToVideo(
  input: string,
  output: string,
  options?: { duration?: number; fps?: number },
  executeOptions?: ExecuteOptions,
): Promise<ExportResult>;

/** Resize video */
export function resize(
  input: string,
  output: string,
  options: { width?: number; height?: number },
  executeOptions?: ExecuteOptions,
): Promise<TransformResult>;
```

**Implementation Notes**:
- Each function is a thin wrapper around an existing builder:

- **`remux()`**: `exportVideo().input(input).videoCodec('copy').audioCodec('copy').output(output).execute()`

- **`compress()`**: `exportVideo().input(input).qualityTier(quality ?? 'standard').output(output).execute()`

- **`extractAudio()`**: `audio().input(input).extractAudio({ codec, bitrate }).output(output).execute()`. Return `{ outputPath, duration, sizeBytes }` from the AudioResult.

- **`imageToVideo()`**: `image().input(input).toVideo({ duration: duration ?? 5, fps: fps ?? 30 }).output(output).execute()`. Then re-export with `exportVideo()` if needed, or use `image()` builder's video output directly. Actually, the `image()` builder's `toVideo()` already produces video output. Just use it.
  Wait — `image()` builder returns `ImageResult` not `ExportResult`. Let's return `ImageResult` or probe for `ExportResult` fields. Actually, looking at `ImageResult`, it has `{ outputPath, sizeBytes, width?, height? }` — not enough for `ExportResult`. Let's just return a simpler type: `{ outputPath, duration, sizeBytes }`.
  Correction: Use the `image()` builder, then probe the output to build a richer result. Or keep it simple and return `{ outputPath, duration, sizeBytes }`.
  Let's change the return type to `{ outputPath: string; duration: number; sizeBytes: number }`.

- **`resize()`**: `transform().input(input).scale({ width, height }).output(output).execute()`

**Acceptance Criteria**:
- [ ] `remux()` changes container without re-encoding (codec copy)
- [ ] `compress()` produces smaller output than input (for 'economy' tier)
- [ ] `extractAudio()` produces audio-only output with correct codec
- [ ] `imageToVideo()` produces video with correct duration from a still image
- [ ] `resize()` produces video with correct dimensions

---

## Implementation Order

1. **Types** (`src/types/results.ts` additions) — all units depend on these
2. **Quick Conversions** (`src/convenience/quick.ts`) — simplest, validates builder composition works
3. **Batch** (`src/convenience/batch.ts`) — standalone utility, no other convenience deps
4. **Pipeline** (`src/convenience/pipeline.ts`) — core chaining mechanism
5. **Silence Utilities** (`src/convenience/silence.ts`) — builds on audio builder
6. **Estimate** (`src/convenience/estimate.ts`) — pure calculation + probe
7. **Smart Transcode** (`src/convenience/smart.ts`) — probe + conditional export
8. **Thumbnail Sheet** (`src/convenience/thumbnail-sheet.ts`) — complex filter graph
9. **Waveform** (`src/convenience/waveform.ts`) — raw PCM extraction
10. **Normalize Media** (`src/convenience/normalize-media.ts`) — composes probe + export + batch-like iteration

After all units: update `src/index.ts` barrel export.

---

## Testing

### Builder / Unit Tests

No builder tests needed for convenience functions (they don't have `.toArgs()`). Unit tests for pure logic only:

#### `__tests__/unit/estimate.test.ts`
- Bitrate parsing: "5M" → 5_000_000, "192k" → 192_000
- `formatBytes()`: 1024 → "1.0 KB", 1_500_000 → "1.4 MB"
- Calculation: explicit bitrates produce correct byte estimate

#### `__tests__/unit/batch.test.ts`
- Concurrency limiter logic (mock operations with delays)
- Results preserve input order
- Empty inputs returns empty results

### E2E Tests

All E2E tests use `describeWithFFmpeg` and test fixtures.

#### `__tests__/integration/pipeline.e2e.test.ts`
```
- Pipeline: scale → export produces valid output
- Pipeline: temp files are cleaned up after success
- Pipeline: temp files are cleaned up after failure
- Pipeline: onStepComplete callback fires for each step
```

#### `__tests__/integration/batch.e2e.test.ts`
```
- Batch: processes 3 files with concurrency 2
- Batch: individual failure doesn't stop the batch
- Batch: onItemComplete called for each success
```

#### `__tests__/integration/smart-transcode.e2e.test.ts`
```
- Smart transcode: copies when input matches target
- Smart transcode: re-encodes when dimensions exceed max
- Smart transcode: re-encodes audio when codec differs
```

#### `__tests__/integration/thumbnail-sheet.e2e.test.ts`
```
- Thumbnail sheet: generates image with correct grid dimensions
- Thumbnail sheet: uniform timestamps produces evenly spaced frames
```

#### `__tests__/integration/waveform.e2e.test.ts`
```
- Waveform: returns Float32Array with approximately correct sample count
- Waveform: values are in valid range
```

#### `__tests__/integration/silence.e2e.test.ts`
```
- detectSilence: finds silence in audio-silence fixture
- trimSilence: output is shorter than input
- splitOnSilence: creates multiple segment files
```

#### `__tests__/integration/estimate.e2e.test.ts`
```
- estimateSize: explicit bitrate estimate within 50% of actual encoded size
- estimateSize: returns appropriate confidence level
```

#### `__tests__/integration/quick.e2e.test.ts`
```
- remux: changes container, codecs remain copy
- extractAudio: produces audio-only output
- resize: output has correct dimensions
- compress: produces valid output
- imageToVideo: creates video from still image
```

#### `__tests__/integration/normalize-media.e2e.test.ts`
```
- normalizeMedia: all outputs have matching dimensions
- normalizeMedia: skips files already matching target
```

---

## Verification Checklist

```bash
# Type check
pnpm typecheck

# Run unit tests
pnpm vitest run __tests__/unit/estimate.test.ts __tests__/unit/batch.test.ts

# Run all convenience E2E tests
pnpm vitest run __tests__/integration/pipeline.e2e.test.ts
pnpm vitest run __tests__/integration/batch.e2e.test.ts
pnpm vitest run __tests__/integration/smart-transcode.e2e.test.ts
pnpm vitest run __tests__/integration/thumbnail-sheet.e2e.test.ts
pnpm vitest run __tests__/integration/waveform.e2e.test.ts
pnpm vitest run __tests__/integration/silence.e2e.test.ts
pnpm vitest run __tests__/integration/estimate.e2e.test.ts
pnpm vitest run __tests__/integration/quick.e2e.test.ts
pnpm vitest run __tests__/integration/normalize-media.e2e.test.ts

# Lint
pnpm biome check src/convenience/ __tests__/integration/

# Build
pnpm build
```

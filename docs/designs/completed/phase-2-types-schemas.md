# Design: Phase 2 — Types & Schemas

## Overview

Define all shared type definitions and Zod schemas for the FFmpeg SDK. No runtime logic — only types, interfaces, enums, and Zod validation schemas. After this phase, all types are importable from `ffmpeg-kit` and `pnpm build` succeeds.

**Source of truth**: `INTERFACE.md` defines the public API surface. Types here implement those interfaces exactly. Zod schemas are the single source of truth for probe result types — TypeScript types are derived from schemas via `z.infer<>`, not hand-written separately.

**Design principle applied**: Single Source of Truth — probe types are derived from Zod schemas, not duplicated. The schema is authoritative; the type is generated.

---

## Implementation Units

### Unit 1: Error Types

**File**: `src/types/errors.ts`

```typescript
export enum FFmpegErrorCode {
  BINARY_NOT_FOUND = "BINARY_NOT_FOUND",
  INPUT_NOT_FOUND = "INPUT_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  ENCODING_FAILED = "ENCODING_FAILED",
  TIMEOUT = "TIMEOUT",
  FILTER_ERROR = "FILTER_ERROR",
  HWACCEL_ERROR = "HWACCEL_ERROR",
  OUTPUT_ERROR = "OUTPUT_ERROR",
  CANCELLED = "CANCELLED",
  SESSION_LIMIT = "SESSION_LIMIT",
  CODEC_NOT_AVAILABLE = "CODEC_NOT_AVAILABLE",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  UNKNOWN = "UNKNOWN",
}

export class FFmpegError extends Error {
  readonly code: FFmpegErrorCode;
  readonly stderr: string;
  readonly command: string[];
  readonly exitCode: number;

  constructor(options: {
    code: FFmpegErrorCode;
    message: string;
    stderr: string;
    command: string[];
    exitCode: number;
    cause?: Error;
  });
}
```

**Implementation Notes**:
- `FFmpegErrorCode` is the one place in the SDK where a TypeScript `enum` is used (per CLAUDE.md convention). All other union-like types use `as const` + literal types.
- `FFmpegError` extends `Error` and sets `this.name = "FFmpegError"`.
- The constructor takes a single options object for clarity and forward-compatibility.
- Use `Object.defineProperty(this, 'name', { value: 'FFmpegError' })` so the name survives minification.
- Support the standard `cause` option by passing it to `super(message, { cause })`.
- All fields are `readonly` — errors are immutable after construction.

**Acceptance Criteria**:
- [ ] `FFmpegErrorCode` enum has all 13 members matching INTERFACE.md
- [ ] `FFmpegError` extends `Error` with `code`, `stderr`, `command`, `exitCode` properties
- [ ] `instanceof FFmpegError` works correctly
- [ ] `error.name === "FFmpegError"`
- [ ] `error.cause` is set when provided

---

### Unit 2: Codec & Encoding Types

**File**: `src/types/codecs.ts`

```typescript
export type VideoCodec =
  // H.264/AVC
  | "libx264" | "libx264rgb" | "libopenh264"
  | "h264_nvenc" | "h264_amf" | "h264_vaapi" | "h264_qsv" | "h264_vulkan"
  // H.265/HEVC
  | "libx265"
  | "hevc_nvenc" | "hevc_amf" | "hevc_vaapi" | "hevc_qsv" | "hevc_vulkan"
  // AV1
  | "libaom-av1" | "libsvtav1" | "librav1e"
  | "av1_nvenc" | "av1_amf" | "av1_vaapi" | "av1_qsv"
  // VP8/VP9
  | "libvpx" | "libvpx-vp9"
  | "vp8_vaapi" | "vp9_vaapi" | "vp9_qsv"
  // VVC/H.266
  | "libvvenc"
  // Others
  | "prores" | "prores_ks" | "dnxhd" | "mjpeg" | "gif"
  | "copy";

export type AudioCodec =
  | "aac" | "libfdk_aac"
  | "libmp3lame"
  | "libopus"
  | "libvorbis"
  | "flac" | "alac"
  | "ac3" | "eac3"
  | "pcm_s16le" | "pcm_s24le" | "pcm_s32le" | "pcm_f32le"
  | "copy";

export type PixelFormat =
  | "yuv420p" | "yuv422p" | "yuv444p"
  | "yuv420p10le" | "yuv422p10le" | "yuv444p10le"
  | "yuv420p12le"
  | "nv12" | "nv21"
  | "rgb24" | "bgr24" | "rgba" | "bgra"
  | "gray" | "gray10le"
  | "gbrp" | "gbrp10le";

export type ContainerFormat = "mp4" | "mkv" | "webm" | "mov" | "avi" | "ts" | "flv";

export type QualityTier = "premium" | "standard" | "economy";

export type EncodingPreset =
  // libx264/libx265
  | "ultrafast" | "superfast" | "veryfast" | "faster" | "fast"
  | "medium" | "slow" | "slower" | "veryslow" | "placebo"
  // NVENC
  | "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7"
  // SVT-AV1
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8"
  | "9" | "10" | "11" | "12" | "13";

export type RateControlMode = "crf" | "cq" | "cbr" | "vbr" | "abr" | "constrained-quality";

export type HwAccelMode = "auto" | "nvidia" | "vaapi" | "qsv" | "vulkan" | "cpu";

export interface EncoderConfig {
  codec: VideoCodec;
  crf?: number;
  cq?: number;
  qp?: number;
  videoBitrate?: string;
  maxBitrate?: string;
  bufSize?: string;
  preset?: EncodingPreset;
  profile?: string;
  level?: string;
  pixelFormat?: PixelFormat;
  tune?: string;
  codecParams?: string;
  gopSize?: number;
  bFrames?: number;
  twoPass?: boolean;
  pass?: 1 | 2;
  passLogFile?: string;
}

export interface AudioEncoderConfig {
  codec: AudioCodec;
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
}

export interface PresetConfig {
  video: EncoderConfig;
  audio: AudioEncoderConfig;
  format: ContainerFormat;
  faststart: boolean;
  metadata?: Record<string, string>;
}

export type ExportPreset =
  | "youtube_hd" | "youtube_4k" | "youtube_shorts" | "youtube_draft"
  | "twitter" | "instagram" | "tiktok"
  | "web_720p" | "web_1080p" | "archive";
```

**Implementation Notes**:
- All union types use string literals with `as const`-style patterns (no enums except `FFmpegErrorCode`).
- `VideoCodec` and `AudioCodec` include `"copy"` for stream copying.
- `EncodingPreset` includes SVT-AV1 numeric presets as string literals (`"0"` through `"13"`).
- `HwAccelMode` is defined here (not in a separate hardware types file) because it's referenced by multiple modules across the SDK.
- `PresetConfig`, `EncoderConfig`, `AudioEncoderConfig` are data-bag interfaces — they hold configuration, no methods.

**Acceptance Criteria**:
- [ ] All codec types match INTERFACE.md Section 4 exactly
- [ ] `VideoCodec` has all 32 members
- [ ] `AudioCodec` has all 14 members
- [ ] `PixelFormat` has all 17 members
- [ ] `EncoderConfig` has all 17 optional fields plus required `codec`
- [ ] All types are re-exported from `src/index.ts`

---

### Unit 3: Options & Progress Types

**File**: `src/types/options.ts`

```typescript
import type { FFmpegLogLevel } from "./base.ts";

export interface ProgressInfo {
  /** Current frame being processed */
  frame: number;
  /** Processing speed in fps */
  fps: number;
  /** Current bitrate of output */
  bitrate: string;
  /** Total output size so far in bytes */
  totalSize: number;
  /** Current processing time position in seconds */
  time: number;
  /** Processing speed relative to realtime (e.g. 2.5x) */
  speed: number;
  /** Percentage complete (0-100), null if duration unknown */
  percent: number | null;
  /** Estimated time remaining in seconds, null if unknown */
  eta: number | null;
}

export type OnProgress = (progress: ProgressInfo) => void;

export interface ExecuteOptions {
  /** Working directory for the process */
  cwd?: string;
  /** Timeout in milliseconds (default: 600_000 = 10 min) */
  timeout?: number;
  /** Callback for real-time progress updates */
  onProgress?: OnProgress;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Environment variables to pass to the process */
  env?: Record<string, string>;
  /** Log level for ffmpeg */
  logLevel?: FFmpegLogLevel;
  /** Overwrite output files without asking (-y). Default: true */
  overwrite?: boolean;
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Duration of the execution in milliseconds */
  durationMs: number;
}
```

**Implementation Notes**:
- `ProgressInfo.percent` and `eta` are `null` when duration is unknown (e.g., piped input).
- `ExecuteOptions.overwrite` defaults to `true` at the implementation layer — the type just declares it optional.
- `signal` uses the standard `AbortSignal` from Node.js globals (no import needed with ES2024 target).
- `FFmpegLogLevel` is imported from `base.ts` to avoid circular dependencies.

**Acceptance Criteria**:
- [ ] `ProgressInfo` has all 8 fields matching INTERFACE.md Section 10
- [ ] `ExecuteOptions` has all 7 optional fields matching INTERFACE.md Section 1
- [ ] `ExecuteResult` has all 4 fields matching INTERFACE.md Section 1
- [ ] All types are re-exported from `src/index.ts`

---

### Unit 4: Base Shared Types

**File**: `src/types/base.ts`

```typescript
/**
 * Timestamp: seconds as number, or string in "HH:MM:SS.ms", "MM:SS.ms", "SS.ms", or "50%" format.
 */
export type Timestamp = number | string;

/**
 * FFmpeg log level.
 */
export type FFmpegLogLevel =
  | "quiet" | "panic" | "fatal" | "error"
  | "warning" | "info" | "verbose" | "debug" | "trace";

/**
 * Color specification (same formats FFmpeg accepts).
 * "red", "blue", "#FF0000", "0xFF0000", "red@0.5" (with alpha)
 */
export type Color = string;
```

**Implementation Notes**:
- `Timestamp` is a union type used throughout operations for seek positions, trim points, etc.
- `Color` is intentionally `string` (not a union of named colors) because FFmpeg accepts arbitrary hex/named colors.
- `FFmpegLogLevel` is defined here rather than in `options.ts` to avoid import cycles — `options.ts` imports it.

**Acceptance Criteria**:
- [ ] `Timestamp` accepts both `number` and `string`
- [ ] `FFmpegLogLevel` has all 9 levels matching INTERFACE.md Section 8
- [ ] All types are re-exported from `src/index.ts`

---

### Unit 5: Filter Types

**File**: `src/types/filters.ts`

```typescript
import type { Color } from "./base.ts";
import type { HwAccelMode } from "./codecs.ts";

// --- Transition ---

export type TransitionType =
  // Basic
  | "fade" | "fadeblack" | "fadewhite" | "dissolve"
  // Wipes
  | "wipeleft" | "wiperight" | "wipeup" | "wipedown"
  | "wipetl" | "wipetr" | "wipebl" | "wipebr"
  // Slides
  | "slideleft" | "slideright" | "slideup" | "slidedown"
  // Smooth
  | "smoothleft" | "smoothright" | "smoothup" | "smoothdown"
  // Covers
  | "coverleft" | "coverright" | "coverup" | "coverdown"
  // Reveals
  | "revealleft" | "revealright" | "revealup" | "revealdown"
  // Shapes
  | "circlecrop" | "rectcrop" | "circleopen" | "circleclose"
  | "vertopen" | "vertclose" | "horzopen" | "horzclose"
  // Effects
  | "pixelize" | "distance" | "fadegrays" | "hblur"
  | "zoomin" | "fadefast" | "fadeslow" | "radial"
  // Diagonals
  | "diagtl" | "diagtr" | "diagbl" | "diagbr"
  // Slices
  | "hlslice" | "hrslice" | "vuslice" | "vdslice"
  // Squeeze
  | "squeezeh" | "squeezev"
  // Wind
  | "hlwind" | "hrwind" | "vuwind" | "vdwind"
  // Custom expression
  | "custom";

export type FadeCurve =
  | "tri" | "qsin" | "esin" | "hsin" | "log"
  | "ipar" | "qua" | "cub" | "squ" | "cbr"
  | "par" | "exp" | "iqsin" | "ihsin" | "dese"
  | "desi" | "losi" | "sinc" | "isinc" | "nofade";

export type BlendMode =
  | "normal" | "multiply" | "screen" | "overlay" | "darken"
  | "lighten" | "dodge" | "burn" | "hardlight" | "softlight"
  | "difference" | "exclusion" | "addition";

export type FitMode = "contain" | "cover" | "fill" | "none";

export type ScaleAlgorithm = "bilinear" | "bicubic" | "lanczos" | "spline" | "neighbor";

export type EasingFunction = "linear" | "ease-in" | "ease-out" | "ease-in-out";

// --- Position ---

export interface Position {
  /** 0-1 normalized X coordinate */
  x: number;
  /** 0-1 normalized Y coordinate */
  y: number;
}

export type NamedPosition =
  | "center"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right"
  | "top-center" | "bottom-center" | "center-left" | "center-right";

export type OverlayAnchor =
  | "top-left" | "top-center" | "top-right"
  | "center-left" | "center" | "center-right"
  | "bottom-left" | "bottom-center" | "bottom-right";

export interface OverlayPosition {
  /** X position: pixels or expression string (e.g. "W-w-10") */
  x: number | string;
  /** Y position: pixels or expression string (e.g. "H-h-10") */
  y: number | string;
}

// --- Operation Configs ---

export interface KenBurnsConfig {
  duration: number;
  startZoom: number;
  endZoom: number;
  startPosition: Position | NamedPosition;
  endPosition: Position | NamedPosition;
  easing?: EasingFunction;
  fps?: number;
}

export interface CropConfig {
  /** Crop to aspect ratio (e.g. "16:9", "1:1") */
  aspectRatio?: string;
  /** Explicit width */
  width?: number;
  /** Explicit height */
  height?: number;
  /** Crop origin X */
  x?: number;
  /** Crop origin Y */
  y?: number;
  /** Auto-detect crop (black bars) */
  detect?: boolean;
}

export interface DuckConfig {
  /** Index of the trigger track (e.g. voice) */
  trigger: number;
  /** Amount to reduce in dB (negative, e.g. -12) */
  amount: number;
  /** Attack time in ms */
  attackMs?: number;
  /** Release time in ms */
  releaseMs?: number;
  /** Threshold for triggering (dB) */
  threshold?: number;
}

export interface NormalizeConfig {
  /** Target integrated loudness (LUFS). YouTube standard: -14 */
  targetLufs: number;
  /** True peak maximum (dBFS, default: -1.5) */
  truePeak?: number;
  /** Loudness range target */
  loudnessRange?: number;
  /** Two-pass normalization for accuracy */
  twoPass?: boolean;
}

// --- Filter Graph ---

export interface FilterNode {
  /** Filter name (e.g. "scale", "overlay", "loudnorm") */
  name: string;
  /** Filter options as key-value pairs or positional args string */
  options?: Record<string, string | number | boolean> | string;
  /** Input pad labels */
  inputs?: string[];
  /** Output pad labels */
  outputs?: string[];
}
```

**Implementation Notes**:
- `TransitionType` includes all xfade transitions from INTERFACE.md (67 members including `"custom"`).
- `NamedPosition` and `OverlayAnchor` are similar but distinct types — `NamedPosition` is used for Ken Burns (includes both `"center-left"` and `"top-left"` etc.), `OverlayAnchor` is used for overlay/text positioning (same 9 values). They're intentionally separate types for semantic clarity even though they currently have the same members.
- `DuckConfig` and `NormalizeConfig` are defined here (not in a separate audio types file) because they're referenced in both the audio builder types and potentially filter graph types.
- `FilterNode` is a data structure for the filter graph builder — it represents a single node in a filter graph.

**Acceptance Criteria**:
- [ ] `TransitionType` has all 67 members matching INTERFACE.md Section 5.4
- [ ] `FadeCurve` has all 20 members matching INTERFACE.md Section 5.3
- [ ] `BlendMode` has all 13 members matching INTERFACE.md Section 5.6
- [ ] `KenBurnsConfig` matches INTERFACE.md Section 5.2
- [ ] `CropConfig` matches INTERFACE.md Section 5.2
- [ ] `DuckConfig` matches INTERFACE.md Section 5.3
- [ ] `NormalizeConfig` matches INTERFACE.md Section 5.3
- [ ] `FilterNode` matches INTERFACE.md Section 6
- [ ] All types are re-exported from `src/index.ts`

---

### Unit 6: Result Types

**File**: `src/types/results.ts`

```typescript
export interface ExtractResult {
  outputPath: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

export interface TransformResult {
  outputPath: string;
  duration: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface AudioResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
  codec?: string;
  sampleRate?: number;
  channels?: number;
  /** Detected silence ranges (if detectSilence was used) */
  silenceRanges?: Array<{ start: number; end: number; duration: number }>;
  /** Loudness stats (if normalize was used with measurement) */
  loudness?: {
    integratedLufs: number;
    truePeakDbfs: number;
    loudnessRange: number;
  };
}

export interface ConcatResult {
  outputPath: string;
  duration: number;
  clipCount: number;
  sizeBytes: number;
  /** Whether simple (no re-encode) or complex (filter graph) path was used */
  method: "demuxer" | "filter_complex";
}

export interface ExportResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
  videoCodec: string;
  audioCodec: string;
  /** Encoding stats */
  stats?: {
    fps: number;
    speed: number;
    bitrate: number;
    encodingDurationMs: number;
  };
}

export interface OverlayResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
}

export interface TextResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
}

export interface SubtitleResult {
  outputPath: string;
  sizeBytes: number;
}

export interface ImageResult {
  outputPath: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface StreamResult {
  outputPath: string;
  /** List of generated segment files */
  segments?: string[];
}

export interface GifResult {
  outputPath: string;
  sizeBytes: number;
  width: number;
  height: number;
  duration: number;
  frameCount: number;
}

/**
 * Result wrapper for operations that support tryExecute().
 * Success variant contains the operation-specific result data.
 * Failure variant contains an FFmpegError.
 */
export type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: import("./errors.ts").FFmpegError };
```

**Implementation Notes**:
- Each operation has its own result type with fields relevant to that operation.
- `OperationResult<T>` is the discriminated union used by `.tryExecute()` methods — it follows the Result pattern from ARCH.md.
- `AudioResult.silenceRanges` and `AudioResult.loudness` are optional because they're only populated when the corresponding feature (detectSilence, normalize) was used.
- `ConcatResult.method` indicates which FFmpeg path was used — important for debugging.
- `ExportResult.stats` is optional because stats parsing may not always succeed.
- The `import()` type for `FFmpegError` in `OperationResult` uses a type-only import to avoid circular dependencies.

**Acceptance Criteria**:
- [ ] All 11 result types match their corresponding INTERFACE.md sections
- [ ] `OperationResult<T>` is a proper discriminated union on `success`
- [ ] `AudioResult` includes optional `silenceRanges` and `loudness`
- [ ] `ExportResult` includes optional `stats`
- [ ] All types are re-exported from `src/index.ts`

---

### Unit 7: Probe Types (derived from Zod schemas)

**File**: `src/types/probe.ts`

```typescript
import type { z } from "zod";
import type {
  probeResultSchema,
  formatInfoSchema,
  videoStreamInfoSchema,
  audioStreamInfoSchema,
  subtitleStreamInfoSchema,
  streamInfoSchema,
  streamDispositionSchema,
  chapterInfoSchema,
} from "../schemas/probe.ts";

/** Full probe result from ffprobe */
export type ProbeResult = z.infer<typeof probeResultSchema>;

/** Container/format metadata */
export type FormatInfo = z.infer<typeof formatInfoSchema>;

/** Video stream metadata */
export type VideoStreamInfo = z.infer<typeof videoStreamInfoSchema>;

/** Audio stream metadata */
export type AudioStreamInfo = z.infer<typeof audioStreamInfoSchema>;

/** Subtitle stream metadata */
export type SubtitleStreamInfo = z.infer<typeof subtitleStreamInfoSchema>;

/** Discriminated union of all stream types */
export type StreamInfo = z.infer<typeof streamInfoSchema>;

/** Stream disposition flags */
export type StreamDisposition = z.infer<typeof streamDispositionSchema>;

/** Chapter info from container */
export type ChapterInfo = z.infer<typeof chapterInfoSchema>;
```

**Implementation Notes**:
- **Critical design decision**: Probe types are derived from Zod schemas via `z.infer<>`. The schema in `src/schemas/probe.ts` is the single source of truth. This ensures that the runtime validation and the TypeScript types can never diverge.
- All imports use `import type` per `verbatimModuleSyntax`.
- The types are re-exported from `src/index.ts` for public consumption; the schemas are also exported for consumers who want to validate probe data themselves.

**Acceptance Criteria**:
- [ ] All 8 probe types are derived from schemas via `z.infer<>`
- [ ] No hand-written interfaces that duplicate schema definitions
- [ ] Types match INTERFACE.md Section 2 (verified by schema structure)
- [ ] All types are re-exported from `src/index.ts`

---

### Unit 8: Probe Zod Schemas

**File**: `src/schemas/probe.ts`

```typescript
import { z } from "zod";

// --- Stream Disposition ---

export const streamDispositionSchema = z.object({
  default: z.boolean(),
  dub: z.boolean(),
  original: z.boolean(),
  comment: z.boolean(),
  lyrics: z.boolean(),
  karaoke: z.boolean(),
  forced: z.boolean(),
  hearing_impaired: z.boolean(),
  visual_impaired: z.boolean(),
  attached_pic: z.boolean(),
});

// --- Streams ---

const baseStreamSchema = z.object({
  index: z.number(),
  codec_name: z.string(),
  codec_long_name: z.string(),
  profile: z.string().optional().default(""),
  disposition: streamDispositionSchema,
  tags: z.record(z.string(), z.string()).optional().default({}),
});

export const rawVideoStreamSchema = baseStreamSchema.extend({
  codec_type: z.literal("video"),
  width: z.number(),
  height: z.number(),
  display_aspect_ratio: z.string().optional().default("0:1"),
  sample_aspect_ratio: z.string().optional().default("1:1"),
  pix_fmt: z.string().optional().default("unknown"),
  color_space: z.string().optional(),
  color_range: z.string().optional(),
  color_transfer: z.string().optional(),
  color_primaries: z.string().optional(),
  r_frame_rate: z.string().optional().default("0/1"),
  avg_frame_rate: z.string().optional().default("0/1"),
  bit_rate: z.string().optional(),
  duration: z.string().optional(),
  nb_frames: z.string().optional(),
  field_order: z.string().optional(),
  bits_per_raw_sample: z.string().optional(),
  side_data_list: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const rawAudioStreamSchema = baseStreamSchema.extend({
  codec_type: z.literal("audio"),
  sample_rate: z.string().optional().default("0"),
  channels: z.number().optional().default(0),
  channel_layout: z.string().optional().default(""),
  sample_fmt: z.string().optional().default("unknown"),
  bit_rate: z.string().optional(),
  duration: z.string().optional(),
  bits_per_raw_sample: z.string().optional(),
});

export const rawSubtitleStreamSchema = baseStreamSchema.extend({
  codec_type: z.literal("subtitle"),
});

export const rawStreamSchema = z.discriminatedUnion("codec_type", [
  rawVideoStreamSchema,
  rawAudioStreamSchema,
  rawSubtitleStreamSchema,
]);

// --- Format ---

export const rawFormatSchema = z.object({
  filename: z.string(),
  format_name: z.string(),
  format_long_name: z.string(),
  duration: z.string().optional().default("0"),
  size: z.string().optional().default("0"),
  bit_rate: z.string().optional().default("0"),
  start_time: z.string().optional().default("0"),
  nb_streams: z.number(),
  tags: z.record(z.string(), z.string()).optional().default({}),
});

// --- Chapters ---

export const rawChapterSchema = z.object({
  id: z.number(),
  start_time: z.string(),
  end_time: z.string(),
  tags: z.record(z.string(), z.string()).optional().default({}),
});

// --- Raw ffprobe output ---

export const rawProbeOutputSchema = z.object({
  format: rawFormatSchema,
  streams: z.array(rawStreamSchema).default([]),
  chapters: z.array(rawChapterSchema).default([]),
});

// --- Transformed (public) schemas ---

export const streamDispositionPublicSchema = streamDispositionSchema.transform(
  (d) => ({
    default: d.default,
    dub: d.dub,
    original: d.original,
    comment: d.comment,
    lyrics: d.lyrics,
    karaoke: d.karaoke,
    forced: d.forced,
    hearingImpaired: d.hearing_impaired,
    visualImpaired: d.visual_impaired,
    attachedPic: d.attached_pic,
  }),
);

function parseFrameRate(rate: string): number {
  const parts = rate.split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    return den === 0 ? 0 : num / den;
  }
  return Number(rate) || 0;
}

function parseRotation(
  tags?: Record<string, string>,
  sideDataList?: Array<Record<string, unknown>>,
): number | undefined {
  // Check tags first (older ffmpeg)
  const tagRotation = tags?.["rotate"];
  if (tagRotation !== undefined) return Number(tagRotation);
  // Check side_data_list (newer ffmpeg)
  if (sideDataList) {
    for (const sd of sideDataList) {
      if (sd["side_data_type"] === "Display Matrix" && typeof sd["rotation"] === "number") {
        return sd["rotation"] as number;
      }
    }
  }
  return undefined;
}

export const videoStreamInfoSchema = rawVideoStreamSchema.transform((s) => ({
  type: "video" as const,
  index: s.index,
  codec: s.codec_name,
  codecLongName: s.codec_long_name,
  profile: s.profile ?? "",
  width: s.width,
  height: s.height,
  displayAspectRatio: s.display_aspect_ratio ?? "0:1",
  sampleAspectRatio: s.sample_aspect_ratio ?? "1:1",
  pixelFormat: s.pix_fmt ?? "unknown",
  colorSpace: s.color_space,
  colorRange: s.color_range,
  colorTransfer: s.color_transfer,
  colorPrimaries: s.color_primaries,
  frameRate: parseFrameRate(s.r_frame_rate ?? "0/1"),
  avgFrameRate: parseFrameRate(s.avg_frame_rate ?? "0/1"),
  bitrate: Number(s.bit_rate ?? "0"),
  duration: Number(s.duration ?? "0"),
  nbFrames: s.nb_frames !== undefined ? Number(s.nb_frames) : undefined,
  fieldOrder: s.field_order,
  bitsPerRawSample: s.bits_per_raw_sample !== undefined ? Number(s.bits_per_raw_sample) : undefined,
  disposition: {
    default: s.disposition.default,
    dub: s.disposition.dub,
    original: s.disposition.original,
    comment: s.disposition.comment,
    lyrics: s.disposition.lyrics,
    karaoke: s.disposition.karaoke,
    forced: s.disposition.forced,
    hearingImpaired: s.disposition.hearing_impaired,
    visualImpaired: s.disposition.visual_impaired,
    attachedPic: s.disposition.attached_pic,
  },
  tags: s.tags ?? {},
  rotation: parseRotation(s.tags, s.side_data_list),
}));

export const audioStreamInfoSchema = rawAudioStreamSchema.transform((s) => ({
  type: "audio" as const,
  index: s.index,
  codec: s.codec_name,
  codecLongName: s.codec_long_name,
  profile: s.profile ?? "",
  sampleRate: Number(s.sample_rate ?? "0"),
  channels: s.channels ?? 0,
  channelLayout: s.channel_layout ?? "",
  sampleFormat: s.sample_fmt ?? "unknown",
  bitrate: Number(s.bit_rate ?? "0"),
  duration: Number(s.duration ?? "0"),
  bitsPerRawSample: s.bits_per_raw_sample !== undefined ? Number(s.bits_per_raw_sample) : undefined,
  disposition: {
    default: s.disposition.default,
    dub: s.disposition.dub,
    original: s.disposition.original,
    comment: s.disposition.comment,
    lyrics: s.disposition.lyrics,
    karaoke: s.disposition.karaoke,
    forced: s.disposition.forced,
    hearingImpaired: s.disposition.hearing_impaired,
    visualImpaired: s.disposition.visual_impaired,
    attachedPic: s.disposition.attached_pic,
  },
  tags: s.tags ?? {},
}));

export const subtitleStreamInfoSchema = rawSubtitleStreamSchema.transform((s) => ({
  type: "subtitle" as const,
  index: s.index,
  codec: s.codec_name,
  codecLongName: s.codec_long_name,
  disposition: {
    default: s.disposition.default,
    dub: s.disposition.dub,
    original: s.disposition.original,
    comment: s.disposition.comment,
    lyrics: s.disposition.lyrics,
    karaoke: s.disposition.karaoke,
    forced: s.disposition.forced,
    hearingImpaired: s.disposition.hearing_impaired,
    visualImpaired: s.disposition.visual_impaired,
    attachedPic: s.disposition.attached_pic,
  },
  tags: s.tags ?? {},
}));

export const streamInfoSchema = z.discriminatedUnion("codec_type", [
  rawVideoStreamSchema,
  rawAudioStreamSchema,
  rawSubtitleStreamSchema,
]).transform((s) => {
  switch (s.codec_type) {
    case "video":
      return videoStreamInfoSchema.parse(s);
    case "audio":
      return audioStreamInfoSchema.parse(s);
    case "subtitle":
      return subtitleStreamInfoSchema.parse(s);
  }
});

export const formatInfoSchema = rawFormatSchema.transform((f) => ({
  filename: f.filename,
  formatName: f.format_name,
  formatLongName: f.format_long_name,
  duration: Number(f.duration ?? "0"),
  size: Number(f.size ?? "0"),
  bitrate: Number(f.bit_rate ?? "0"),
  startTime: Number(f.start_time ?? "0"),
  nbStreams: f.nb_streams,
  tags: f.tags ?? {},
}));

export const chapterInfoSchema = rawChapterSchema.transform((c) => ({
  id: c.id,
  startTime: Number(c.start_time),
  endTime: Number(c.end_time),
  tags: c.tags ?? {},
}));

export const probeResultSchema = rawProbeOutputSchema.transform((raw) => ({
  format: formatInfoSchema.parse(raw.format),
  streams: (raw.streams ?? []).map((s) => streamInfoSchema.parse(s)),
  chapters: (raw.chapters ?? []).map((c) => chapterInfoSchema.parse(c)),
}));
```

**Implementation Notes**:
- **Two-layer schema design**: "raw" schemas match ffprobe's JSON output (snake_case, strings for numbers), and "public" schemas transform to the SDK's camelCase types with proper number parsing.
- `rawProbeOutputSchema` validates the raw ffprobe JSON. `probeResultSchema` transforms it into the public `ProbeResult` type.
- ffprobe outputs numbers as strings in many places (`duration`, `bit_rate`, `sample_rate`, `size`, etc.) — the transform layer parses these with `Number()`.
- `disposition` fields use snake_case in ffprobe output (`hearing_impaired`) but camelCase in the SDK types (`hearingImpaired`) — the transform handles this.
- Frame rates come as fraction strings like `"30000/1001"` — `parseFrameRate()` handles this conversion.
- Rotation metadata can come from either tags (older ffmpeg) or side_data_list (newer ffmpeg) — `parseRotation()` checks both.
- `z.discriminatedUnion("codec_type", ...)` for stream types — Zod v4's discriminated union for type-safe stream discrimination.
- `streamInfoSchema` re-parses through the individual stream schemas after discrimination because the transform needs to run for each specific stream type. This is a necessary pattern since `z.discriminatedUnion().transform()` loses the variant-specific transforms.
- Default values (`.default("")`, `.default({})`, `.default([])`) handle missing optional fields in ffprobe output gracefully.

**Acceptance Criteria**:
- [ ] `rawProbeOutputSchema.parse(ffprobeJson)` validates real ffprobe JSON output
- [ ] `probeResultSchema.parse(ffprobeJson)` produces a `ProbeResult` with camelCase fields
- [ ] Frame rate strings like `"30000/1001"` parse to `29.97...`
- [ ] Duration/size/bitrate strings parse to numbers
- [ ] Disposition snake_case converts to camelCase
- [ ] Missing optional fields get sensible defaults
- [ ] Rotation is extracted from both tag and side_data_list sources
- [ ] Invalid JSON throws a `ZodError` with useful issue messages
- [ ] All schemas are exported for consumer use

---

### Unit 9: Types Barrel Export

**File**: `src/types/index.ts`

```typescript
// Base types
export type { Timestamp, FFmpegLogLevel, Color } from "./base.ts";

// Error types
export { FFmpegErrorCode, FFmpegError } from "./errors.ts";

// Codec & encoding types
export type {
  VideoCodec,
  AudioCodec,
  PixelFormat,
  ContainerFormat,
  QualityTier,
  EncodingPreset,
  RateControlMode,
  HwAccelMode,
  EncoderConfig,
  AudioEncoderConfig,
  PresetConfig,
  ExportPreset,
} from "./codecs.ts";

// Options & progress types
export type {
  ProgressInfo,
  OnProgress,
  ExecuteOptions,
  ExecuteResult,
} from "./options.ts";

// Filter & operation config types
export type {
  TransitionType,
  FadeCurve,
  BlendMode,
  FitMode,
  ScaleAlgorithm,
  EasingFunction,
  Position,
  NamedPosition,
  OverlayAnchor,
  OverlayPosition,
  KenBurnsConfig,
  CropConfig,
  DuckConfig,
  NormalizeConfig,
  FilterNode,
} from "./filters.ts";

// Result types
export type {
  ExtractResult,
  TransformResult,
  AudioResult,
  ConcatResult,
  ExportResult,
  OverlayResult,
  TextResult,
  SubtitleResult,
  ImageResult,
  StreamResult,
  GifResult,
  OperationResult,
} from "./results.ts";

// Probe types (derived from Zod schemas)
export type {
  ProbeResult,
  FormatInfo,
  VideoStreamInfo,
  AudioStreamInfo,
  SubtitleStreamInfo,
  StreamInfo,
  StreamDisposition,
  ChapterInfo,
} from "./probe.ts";
```

**Implementation Notes**:
- Uses `export type` for all type-only re-exports per `verbatimModuleSyntax`.
- `FFmpegErrorCode` and `FFmpegError` use value exports (not `export type`) because they have runtime values (enum + class).
- Organized by category with comments for readability.
- This file is the internal barrel for `src/types/` — the top-level `src/index.ts` re-exports from here.

**Acceptance Criteria**:
- [ ] All types from units 1-7 are re-exported
- [ ] `import type` is used for type-only exports
- [ ] Value exports (`FFmpegErrorCode`, `FFmpegError`) use regular `export`
- [ ] `pnpm typecheck` passes

---

### Unit 10: Top-Level Barrel Export Update

**File**: `src/index.ts`

```typescript
// Types
export type {
  // Base
  Timestamp,
  FFmpegLogLevel,
  Color,
  // Codecs & encoding
  VideoCodec,
  AudioCodec,
  PixelFormat,
  ContainerFormat,
  QualityTier,
  EncodingPreset,
  RateControlMode,
  HwAccelMode,
  EncoderConfig,
  AudioEncoderConfig,
  PresetConfig,
  ExportPreset,
  // Options & progress
  ProgressInfo,
  OnProgress,
  ExecuteOptions,
  ExecuteResult,
  // Filters & operation configs
  TransitionType,
  FadeCurve,
  BlendMode,
  FitMode,
  ScaleAlgorithm,
  EasingFunction,
  Position,
  NamedPosition,
  OverlayAnchor,
  OverlayPosition,
  KenBurnsConfig,
  CropConfig,
  DuckConfig,
  NormalizeConfig,
  FilterNode,
  // Results
  ExtractResult,
  TransformResult,
  AudioResult,
  ConcatResult,
  ExportResult,
  OverlayResult,
  TextResult,
  SubtitleResult,
  ImageResult,
  StreamResult,
  GifResult,
  OperationResult,
  // Probe
  ProbeResult,
  FormatInfo,
  VideoStreamInfo,
  AudioStreamInfo,
  SubtitleStreamInfo,
  StreamInfo,
  StreamDisposition,
  ChapterInfo,
} from "./types/index.ts";

// Value exports (runtime)
export { FFmpegErrorCode, FFmpegError } from "./types/index.ts";

// Schemas
export {
  probeResultSchema,
  rawProbeOutputSchema,
  formatInfoSchema,
  videoStreamInfoSchema,
  audioStreamInfoSchema,
  subtitleStreamInfoSchema,
  streamInfoSchema,
  streamDispositionSchema,
  chapterInfoSchema,
} from "./schemas/probe.ts";
```

**Implementation Notes**:
- Explicit named exports (no `export *`) — per CLAUDE.md convention and for tree-shaking.
- Type-only exports use `export type { ... }`.
- Runtime value exports: `FFmpegErrorCode` (enum), `FFmpegError` (class), and all Zod schemas.
- Schemas are exported so consumers can validate their own probe data or extend schemas.

**Acceptance Criteria**:
- [ ] `pnpm build` succeeds
- [ ] `pnpm typecheck` passes
- [ ] All types importable: `import type { ProbeResult, VideoCodec } from "ffmpeg-kit"`
- [ ] All value exports importable: `import { FFmpegError, probeResultSchema } from "ffmpeg-kit"`
- [ ] `dist/index.d.ts` contains all type declarations

---

## Implementation Order

1. **Unit 4: `src/types/base.ts`** — `Timestamp`, `FFmpegLogLevel`, `Color`. No dependencies.
2. **Unit 1: `src/types/errors.ts`** — `FFmpegErrorCode`, `FFmpegError`. No dependencies.
3. **Unit 2: `src/types/codecs.ts`** — Codec types, `HwAccelMode`, encoder configs. No dependencies.
4. **Unit 3: `src/types/options.ts`** — `ExecuteOptions`, `ProgressInfo`. Imports from `base.ts`.
5. **Unit 5: `src/types/filters.ts`** — Filter/operation config types. Imports from `base.ts`, `codecs.ts`.
6. **Unit 6: `src/types/results.ts`** — All result types. Imports from `errors.ts`.
7. **Unit 8: `src/schemas/probe.ts`** — Zod schemas for ffprobe. Imports `zod`.
8. **Unit 7: `src/types/probe.ts`** — Probe types derived from schemas. Imports from `schemas/probe.ts`.
9. **Unit 9: `src/types/index.ts`** — Types barrel. Re-exports all types.
10. **Unit 10: `src/index.ts`** — Top-level barrel. Re-exports types + schemas.

**Rationale**: Leaf types with no dependencies first. Types that import from other type files next. Schemas after all types they reference. Probe types after schemas (since they derive from schemas). Barrels last since they aggregate everything.

---

## Testing

### Unit Tests: `__tests__/unit/types.test.ts`

Phase 2 is primarily type definitions, so tests focus on:

1. **`FFmpegError` construction and properties**:
   ```typescript
   it("constructs with all required fields", () => {
     const err = new FFmpegError({
       code: FFmpegErrorCode.TIMEOUT,
       message: "Operation timed out",
       stderr: "...ffmpeg output...",
       command: ["-i", "input.mp4", "output.mp4"],
       exitCode: 1,
     });
     expect(err).toBeInstanceOf(Error);
     expect(err).toBeInstanceOf(FFmpegError);
     expect(err.name).toBe("FFmpegError");
     expect(err.code).toBe(FFmpegErrorCode.TIMEOUT);
     expect(err.message).toBe("Operation timed out");
     expect(err.stderr).toBe("...ffmpeg output...");
     expect(err.command).toEqual(["-i", "input.mp4", "output.mp4"]);
     expect(err.exitCode).toBe(1);
   });

   it("supports cause option", () => {
     const cause = new Error("original");
     const err = new FFmpegError({
       code: FFmpegErrorCode.UNKNOWN,
       message: "Wrapped error",
       stderr: "",
       command: [],
       exitCode: 1,
       cause,
     });
     expect(err.cause).toBe(cause);
   });

   it("has correct stack trace", () => {
     const err = new FFmpegError({
       code: FFmpegErrorCode.INPUT_NOT_FOUND,
       message: "File not found",
       stderr: "",
       command: [],
       exitCode: 1,
     });
     expect(err.stack).toContain("FFmpegError");
     expect(err.stack).toContain("File not found");
   });
   ```

2. **`FFmpegErrorCode` enum completeness**:
   ```typescript
   it("has all 13 error codes", () => {
     const codes = Object.values(FFmpegErrorCode);
     expect(codes).toHaveLength(13);
     expect(codes).toContain("BINARY_NOT_FOUND");
     expect(codes).toContain("CANCELLED");
     // ... all 13
   });
   ```

### Unit Tests: `__tests__/unit/schemas.test.ts`

Zod schema validation tests — these are critical because schemas are the source of truth for probe types.

1. **Valid ffprobe output parses correctly**:
   ```typescript
   it("parses a complete ffprobe video output", () => {
     const raw = {
       format: {
         filename: "video.mp4",
         format_name: "mov,mp4,m4a,3gp,3g2,mj2",
         format_long_name: "QuickTime / MOV",
         duration: "5.000000",
         size: "1234567",
         bit_rate: "1975307",
         start_time: "0.000000",
         nb_streams: 2,
         tags: { major_brand: "isom" },
       },
       streams: [
         {
           index: 0,
           codec_type: "video",
           codec_name: "h264",
           codec_long_name: "H.264 / AVC",
           profile: "High",
           width: 1920,
           height: 1080,
           pix_fmt: "yuv420p",
           r_frame_rate: "30/1",
           avg_frame_rate: "30/1",
           disposition: { default: 1, dub: 0, original: 0, comment: 0, lyrics: 0, karaoke: 0, forced: 0, hearing_impaired: 0, visual_impaired: 0, attached_pic: 0 },
           tags: {},
         },
         {
           index: 1,
           codec_type: "audio",
           codec_name: "aac",
           codec_long_name: "AAC",
           sample_rate: "48000",
           channels: 2,
           channel_layout: "stereo",
           sample_fmt: "fltp",
           disposition: { default: 1, dub: 0, original: 0, comment: 0, lyrics: 0, karaoke: 0, forced: 0, hearing_impaired: 0, visual_impaired: 0, attached_pic: 0 },
           tags: {},
         },
       ],
       chapters: [],
     };

     const result = probeResultSchema.parse(raw);
     expect(result.format.duration).toBe(5);
     expect(result.format.formatName).toBe("mov,mp4,m4a,3gp,3g2,mj2");
     expect(result.streams).toHaveLength(2);
     expect(result.streams[0]!.type).toBe("video");
     // ... verify all transformed fields
   });
   ```

2. **Frame rate parsing**:
   ```typescript
   it("parses fractional frame rates", () => { /* "30000/1001" → 29.97 */ });
   it("handles zero denominator", () => { /* "0/0" → 0 */ });
   it("handles integer frame rate string", () => { /* "30" → 30 */ });
   ```

3. **Missing optional fields get defaults**:
   ```typescript
   it("defaults missing format tags to empty object", () => { /* ... */ });
   it("defaults missing streams to empty array", () => { /* ... */ });
   it("defaults missing profile to empty string", () => { /* ... */ });
   ```

4. **Disposition camelCase transform**:
   ```typescript
   it("transforms hearing_impaired to hearingImpaired", () => { /* ... */ });
   ```

5. **Rotation extraction**:
   ```typescript
   it("extracts rotation from tags", () => { /* tags: { rotate: "90" } → rotation: 90 */ });
   it("extracts rotation from side_data_list", () => { /* Display Matrix → rotation */ });
   it("returns undefined when no rotation", () => { /* ... */ });
   ```

6. **Invalid input rejection**:
   ```typescript
   it("rejects missing format field", () => { /* ZodError */ });
   it("rejects unknown codec_type", () => { /* ZodError */ });
   it("rejects non-numeric duration string", () => { /* Number("abc") → NaN, validate */ });
   ```

7. **Stream type discrimination**:
   ```typescript
   it("discriminates video streams", () => { /* type === "video" */ });
   it("discriminates audio streams", () => { /* type === "audio" */ });
   it("discriminates subtitle streams", () => { /* type === "subtitle" */ });
   ```

---

## Verification Checklist

```bash
# After implementation, run these commands to verify Phase 2 is complete:

# 1. Typecheck passes
pnpm typecheck

# 2. Build succeeds and produces dist/
pnpm build
ls dist/index.js dist/index.d.ts

# 3. Lint passes
pnpm lint

# 4. Unit tests pass
pnpm test

# 5. Verify types are importable (quick check via tsc)
echo 'import type { ProbeResult, VideoCodec, FFmpegLogLevel } from "./src/index.ts";' | \
  npx tsc --noEmit --esModuleInterop --moduleResolution bundler --module esnext --strict stdin.ts

# 6. Verify dist/index.d.ts contains key exports
grep -q "FFmpegError" dist/index.d.ts
grep -q "ProbeResult" dist/index.d.ts
grep -q "VideoCodec" dist/index.d.ts
grep -q "probeResultSchema" dist/index.d.ts
```

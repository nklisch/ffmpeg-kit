# Design: Phase 4 — Hardware & Encoding Layer

## Overview

Phase 4 adds GPU detection, session management, hardware fallback logic, codec registry, encoder configuration builders, and encoding presets. This builds on the Phase 3 core layer (`execute()`, `probe()`, `validateInstallation()`, `Cache`, `findExecutable()`).

The phase has two sub-systems:
1. **Hardware** — detect GPUs, manage concurrent NVENC/QSV sessions, auto-fallback to CPU
2. **Encoding** — codec availability registry, encoder arg builder, platform presets (YouTube, social, quality tiers)

---

## Implementation Units

### Unit 1: Hardware Detection

**File**: `src/hardware/detect.ts`

```typescript
import type { HwAccelMode, VideoCodec } from "../types/codecs.ts";

/** Result of hardware capability detection */
export interface HardwareCapabilities {
  /** Available hardware acceleration methods (always includes "cpu") */
  available: HwAccelMode[];
  /** Detected GPU info (null if no GPU found) */
  gpu: {
    vendor: "nvidia" | "amd" | "intel" | "unknown";
    model: string;
    /** Max concurrent encoding sessions (2 for consumer NVIDIA, 8 for pro) */
    maxSessions: number;
  } | null;
  /** Available hardware encoders by codec family */
  encoders: {
    h264: VideoCodec[];
    hevc: VideoCodec[];
    av1: VideoCodec[];
    vp9: VideoCodec[];
  };
  /** Available hardware decoders by codec family */
  decoders: {
    h264: string[];
    hevc: string[];
    av1: string[];
    vp9: string[];
  };
}

/** Configuration for hardware detection */
export interface DetectConfig {
  ffmpegPath?: string;
}

/**
 * Detect hardware acceleration capabilities.
 *
 * Cached for process lifetime after first call.
 * Uses `ffmpeg -encoders`, `ffmpeg -decoders`, `ffmpeg -hwaccels`,
 * and optional `nvidia-smi` / `vainfo` queries.
 */
export function detectHardware(config?: DetectConfig): Promise<HardwareCapabilities>;

/**
 * Clear the cached hardware capabilities.
 * Useful for testing or after system changes.
 */
export function clearHardwareCache(): void;
```

**Implementation Notes**:

- **Caching**: Use a module-level `let cachedCapabilities: HardwareCapabilities | null = null` (not the `Cache` class — this is process-lifetime, not TTL-based). Store the promise itself to handle concurrent calls: `let detectPromise: Promise<HardwareCapabilities> | null = null`.
- **Detection steps** (run in parallel where possible):
  1. `ffmpeg -hwaccels` — parse output to get list of available hwaccel methods. Map these to `HwAccelMode` values (e.g., `cuda` → `"nvidia"`, `vaapi` → `"vaapi"`, `qsv` → `"qsv"`, `vulkan` → `"vulkan"`). Always include `"cpu"`.
  2. `ffmpeg -encoders` — parse output, filter for hardware encoder names (those containing `_nvenc`, `_vaapi`, `_qsv`, `_amf`, `_vulkan`). Map to codec families.
  3. `ffmpeg -decoders` — same approach for decoders (`_cuvid`, `_vaapi`, `_qsv`).
  4. `nvidia-smi --query-gpu=name --format=csv,noheader` — run via `findExecutable("nvidia-smi")` first. If found, parse GPU model name. Determine max sessions: check model against known pro GPU patterns (Quadro, Tesla, A100, L40, RTX A-series → 8 sessions; consumer → 2).
  5. `vainfo` — if vaapi is in hwaccels list, try `vainfo` to confirm working. If it fails, remove vaapi from available.
- **GPU vendor detection**: If `nvidia-smi` succeeds → nvidia. If vaapi available and no nvidia → check `/sys/class/drm/card*/device/vendor` for `0x8086` (intel) or `0x1002` (amd). Fallback: "unknown".
- **Error handling**: All subprocess calls should catch errors silently — a missing binary or failed query just means that capability isn't available. Never throw from `detectHardware()`.
- **Parsing `ffmpeg -encoders`**: Output format is lines like ` V..... h264_nvenc           NVIDIA NVENC H.264 encoder`. Split on whitespace, second token is the encoder name. Filter for names matching known hw patterns.

**Internal helpers** (not exported):

```typescript
/** Parse `ffmpeg -encoders` output into list of encoder names */
function parseEncoders(stdout: string): string[];

/** Parse `ffmpeg -decoders` output into list of decoder names */
function parseDecoders(stdout: string): string[];

/** Parse `ffmpeg -hwaccels` output into list of hwaccel method names */
function parseHwaccels(stdout: string): string[];

/** Query nvidia-smi for GPU info */
function queryNvidiaSmi(): Promise<{ model: string; maxSessions: number } | null>;

/** Map raw hwaccel names to HwAccelMode values */
function mapHwaccelMode(name: string): HwAccelMode | null;

/** Categorize encoder name into codec family */
function categorizeEncoder(name: string): { family: "h264" | "hevc" | "av1" | "vp9"; codec: VideoCodec } | null;
```

**Acceptance Criteria**:
- [ ] `detectHardware()` returns `HardwareCapabilities` with `available` always containing `"cpu"`
- [ ] Second call returns same object reference (cached)
- [ ] `clearHardwareCache()` forces re-detection on next call
- [ ] Subprocess failures do not throw — gracefully degrade to `{ available: ["cpu"], gpu: null, encoders: { h264: [], hevc: [], av1: [], vp9: [] }, decoders: { h264: [], hevc: [], av1: [], vp9: [] } }`
- [ ] On a system with NVIDIA GPU: `available` includes `"nvidia"`, `encoders.h264` includes `"h264_nvenc"`, `gpu` is populated
- [ ] On a system with VAAPI: `available` includes `"vaapi"`, `encoders.h264` includes `"h264_vaapi"`

---

### Unit 2: Hardware Session Management

**File**: `src/hardware/session.ts`

```typescript
import type { HwAccelMode, VideoCodec } from "../types/codecs.ts";

/** An active hardware encoding session (reference counted) */
export interface HwSession {
  /** The acceleration mode for this session */
  mode: HwAccelMode;
  /** The selected hardware encoder name */
  encoder: VideoCodec;
  /** Input args for hardware-accelerated decoding (e.g., ["-hwaccel", "cuda"]) */
  inputArgs: string[];
  /** Release this session back to the pool */
  release(): void;
}

/** Configuration for session management */
export interface SessionConfig {
  ffmpegPath?: string;
}

/**
 * Acquire a hardware encoding session.
 *
 * For NVIDIA: tracks concurrent sessions against the GPU's max (2 consumer, 8 pro).
 * Throws FFmpegError with SESSION_LIMIT if at capacity.
 * For other modes: no session limit enforced (returns immediately).
 * For "cpu": returns a no-op session with encoder "libx264".
 * For "auto": detects best available mode and acquires that.
 *
 * The returned HwSession MUST be released via `session.release()` when done.
 */
export function acquireSession(
  mode: HwAccelMode,
  codec?: "h264" | "hevc" | "av1",
  config?: SessionConfig,
): Promise<HwSession>;

/**
 * RAII-style session wrapper. Acquires a session, runs the operation,
 * and guarantees release in a finally block.
 */
export function withHwSession<T>(
  mode: HwAccelMode,
  operation: (session: HwSession) => Promise<T>,
  codec?: "h264" | "hevc" | "av1",
  config?: SessionConfig,
): Promise<T>;
```

**Implementation Notes**:

- **Session counter**: Module-level `let activeNvencSessions = 0`. No need for QSV/VAAPI tracking — only NVIDIA has strict session limits.
- **acquireSession("auto")**: Call `detectHardware()`, pick the first non-CPU mode from `available` (preference order: nvidia > qsv > vaapi > vulkan). If none, use CPU.
- **Encoder selection**: Given mode + codec family, look up the appropriate encoder from `HardwareCapabilities.encoders`. For CPU mode, map to: h264→`"libx264"`, hevc→`"libx265"`, av1→`"libsvtav1"`.
- **inputArgs construction**:
  - nvidia: `["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"]`
  - vaapi: `["-hwaccel", "vaapi", "-hwaccel_device", "/dev/dri/renderD128", "-hwaccel_output_format", "vaapi"]`
  - qsv: `["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"]`
  - vulkan: `["-hwaccel", "vulkan"]`
  - cpu: `[]`
- **release()**: Decrements `activeNvencSessions` for nvidia. Must be idempotent (use a `released` boolean guard).
- **withHwSession**: Simple try/finally wrapper around `acquireSession` + `operation` + `session.release()`.

**Acceptance Criteria**:
- [ ] `acquireSession("cpu")` returns session with `encoder: "libx264"` and empty `inputArgs`
- [ ] `acquireSession("nvidia")` throws `SESSION_LIMIT` when at max capacity
- [ ] `session.release()` is idempotent — calling twice does not double-decrement
- [ ] `withHwSession` always releases the session, even on operation failure
- [ ] `acquireSession("auto")` falls back to CPU if no hardware available

---

### Unit 3: Hardware Fallback

**File**: `src/hardware/fallback.ts`

```typescript
import type { ExecuteOptions, ExecuteResult } from "../types/options.ts";
import type { HwAccelMode } from "../types/codecs.ts";
import type { Logger } from "../util/logger.ts";

/** Options for fallback-aware execution */
export interface FallbackOptions {
  /** The desired hardware acceleration mode */
  hwAccel: HwAccelMode;
  /** Codec family for session selection */
  codec?: "h264" | "hevc" | "av1";
  /** Logger for fallback notifications */
  logger?: Logger;
  /** FFmpeg binary path */
  ffmpegPath?: string;
}

/**
 * Execute an ffmpeg command with automatic hardware fallback.
 *
 * When hwAccel is "auto":
 * 1. Detect best available hardware mode
 * 2. Acquire a session and attempt hardware-accelerated encoding
 * 3. On HWACCEL_ERROR or ENCODING_FAILED, log and retry with CPU
 *
 * When hwAccel is explicit (e.g., "nvidia"):
 * 1. Attempt with that mode
 * 2. On failure, throw (no automatic fallback)
 *
 * When hwAccel is "cpu":
 * 1. Execute directly, no session management
 *
 * The `buildArgs` callback receives the HwSession and returns the full
 * ffmpeg argument array. This lets the caller inject hw-specific args.
 */
export function executeWithFallback(
  buildArgs: (inputArgs: string[], encoder: string) => string[],
  options: FallbackOptions,
  executeOptions?: ExecuteOptions,
): Promise<ExecuteResult & { usedMode: HwAccelMode }>;
```

**Implementation Notes**:

- **Flow for "auto" mode**:
  1. Call `acquireSession("auto", codec)` to get `session`.
  2. Build args via `buildArgs(session.inputArgs, session.encoder)`.
  3. Try `execute(args, executeOptions)`.
  4. If success: release session, return result with `usedMode: session.mode`.
  5. If `FFmpegError` with code `HWACCEL_ERROR` or `ENCODING_FAILED`:
     - Log: `logger.warn("Hardware encoding failed, falling back to CPU", { mode: session.mode, error: err.message })`.
     - Release the hw session.
     - Acquire a CPU session.
     - Rebuild args with CPU encoder.
     - Execute again. If this also fails, throw the CPU error.
     - Return with `usedMode: "cpu"`.
  6. If other error codes (TIMEOUT, CANCELLED, INPUT_NOT_FOUND): throw immediately, no retry.
- **Flow for explicit mode**: No fallback. Acquire session with that mode, execute, throw on failure.
- **Flow for "cpu"**: No session management needed. Build args with `inputArgs: []`, `encoder: cpuEncoder`. Execute directly.

**Acceptance Criteria**:
- [ ] "auto" mode retries with CPU on hwaccel failure
- [ ] "auto" mode does NOT retry on TIMEOUT or CANCELLED errors
- [ ] Explicit mode (e.g., "nvidia") does NOT fallback
- [ ] "cpu" mode executes without session management
- [ ] Fallback logs a warning with the original error
- [ ] Returned `usedMode` reflects the mode that actually succeeded
- [ ] Sessions are always released, even on error paths

---

### Unit 4: Codec Registry

**File**: `src/encoding/codecs.ts`

```typescript
import type { VideoCodec, AudioCodec, HwAccelMode } from "../types/codecs.ts";

/** Codec family identifier */
export type CodecFamily = "h264" | "hevc" | "av1" | "vp9" | "vp8" | "prores";

/** Mapping from HwAccelMode to preferred encoder for each codec family */
export interface CodecMapping {
  family: CodecFamily;
  cpu: VideoCodec;
  nvidia?: VideoCodec;
  vaapi?: VideoCodec;
  qsv?: VideoCodec;
  vulkan?: VideoCodec;
}

/** Registry of codec families and their encoder mappings */
export const CODEC_REGISTRY: readonly CodecMapping[];
// Concrete values:
// { family: "h264",  cpu: "libx264",    nvidia: "h264_nvenc", vaapi: "h264_vaapi", qsv: "h264_qsv", vulkan: "h264_vulkan" }
// { family: "hevc",  cpu: "libx265",    nvidia: "hevc_nvenc", vaapi: "hevc_vaapi", qsv: "hevc_qsv", vulkan: "hevc_vulkan" }
// { family: "av1",   cpu: "libsvtav1",  nvidia: "av1_nvenc",  vaapi: "av1_vaapi",  qsv: "av1_qsv" }
// { family: "vp9",   cpu: "libvpx-vp9", vaapi: "vp9_vaapi",   qsv: "vp9_qsv" }
// { family: "vp8",   cpu: "libvpx",     vaapi: "vp8_vaapi" }
// { family: "prores", cpu: "prores_ks" }

/**
 * Get the appropriate encoder for a codec family + hw mode.
 * Returns the CPU fallback if no hw encoder exists for that family.
 */
export function getEncoderForMode(
  family: CodecFamily,
  mode: HwAccelMode,
): VideoCodec;

/**
 * Get the CPU (software) encoder for a codec family.
 */
export function getCpuEncoder(family: CodecFamily): VideoCodec;

/**
 * Determine the codec family from an encoder name.
 * e.g., "h264_nvenc" → "h264", "libx265" → "hevc"
 */
export function getCodecFamily(encoder: VideoCodec): CodecFamily | null;

/**
 * Default audio codec for a container format.
 */
export function getDefaultAudioCodec(format: string): AudioCodec;
// mp4/mov → "aac", webm → "libopus", mkv → "aac", ts → "aac", flv → "aac", avi → "libmp3lame"
```

**Implementation Notes**:

- `CODEC_REGISTRY` is a simple `as const` array of objects. No dynamic detection here — this is the static mapping. The `detectHardware()` function determines which of these are actually available at runtime.
- `getEncoderForMode("h264", "auto")` should throw — "auto" is not a valid encoder selection mode. Callers should resolve "auto" via `acquireSession` first.
- `getEncoderForMode("h264", "cpu")` returns `"libx264"`.
- `getEncoderForMode("h264", "nvidia")` returns `"h264_nvenc"`.
- If no hw encoder exists for a family+mode (e.g., prores+nvidia), return the CPU encoder.

**Acceptance Criteria**:
- [ ] `getEncoderForMode("h264", "nvidia")` returns `"h264_nvenc"`
- [ ] `getEncoderForMode("h264", "cpu")` returns `"libx264"`
- [ ] `getEncoderForMode("prores", "nvidia")` returns `"prores_ks"` (no hw encoder, falls back)
- [ ] `getCpuEncoder("hevc")` returns `"libx265"`
- [ ] `getCodecFamily("h264_nvenc")` returns `"h264"`
- [ ] `getCodecFamily("libsvtav1")` returns `"av1"`
- [ ] `getDefaultAudioCodec("webm")` returns `"libopus"`
- [ ] `getDefaultAudioCodec("mp4")` returns `"aac"`

---

### Unit 5: Encoder Config Builder

**File**: `src/encoding/config.ts`

```typescript
import type {
  EncoderConfig,
  AudioEncoderConfig,
  QualityTier,
  HwAccelMode,
  VideoCodec,
  PixelFormat,
} from "../types/codecs.ts";
import type { CodecFamily } from "./codecs.ts";

/**
 * Build encoder configuration from a quality tier, hw mode, and codec family.
 *
 * This is the central function that maps high-level intent (e.g., "premium h264 on nvidia")
 * into concrete encoder settings (codec, CRF/CQ, preset, profile, pixel format, etc.).
 */
export function buildEncoderConfig(
  tier: QualityTier,
  mode: HwAccelMode,
  family?: CodecFamily,
): EncoderConfig;
// Default family: "h264"
// mode "auto" is NOT supported — resolve to concrete mode first via session

/**
 * Build the ffmpeg argument array from an EncoderConfig.
 * Produces args like: ["-c:v", "libx264", "-crf", "18", "-preset", "slow", ...]
 */
export function encoderConfigToArgs(config: EncoderConfig): string[];

/**
 * Build the ffmpeg argument array from an AudioEncoderConfig.
 * Produces args like: ["-c:a", "aac", "-b:a", "192k", ...]
 */
export function audioEncoderConfigToArgs(config: AudioEncoderConfig): string[];
```

**Implementation Notes**:

- **`buildEncoderConfig` logic** — produces these values by tier/mode/family:

  **H.264 CPU (libx264)**:
  | Tier | CRF | Preset | Profile | PixelFormat |
  |------|-----|--------|---------|-------------|
  | premium | 18 | slow | high | yuv420p |
  | standard | 23 | medium | high | yuv420p |
  | economy | 28 | veryfast | main | yuv420p |

  **H.264 NVIDIA (h264_nvenc)**:
  | Tier | CQ | Preset | Profile | PixelFormat |
  |------|-----|--------|---------|-------------|
  | premium | 19 | p7 | high | yuv420p |
  | standard | 24 | p4 | high | yuv420p |
  | economy | 30 | p1 | main | yuv420p |

  **HEVC CPU (libx265)**:
  | Tier | CRF | Preset | Profile | PixelFormat |
  |------|-----|--------|---------|-------------|
  | premium | 20 | slow | main | yuv420p |
  | standard | 26 | medium | main | yuv420p |
  | economy | 32 | veryfast | main | yuv420p |

  **HEVC NVIDIA (hevc_nvenc)**:
  | Tier | CQ | Preset | Profile | PixelFormat |
  |------|-----|--------|---------|-------------|
  | premium | 21 | p7 | main | yuv420p |
  | standard | 27 | p4 | main | yuv420p |
  | economy | 33 | p1 | main | yuv420p |

  **AV1 CPU (libsvtav1)**:
  | Tier | CRF | Preset | PixelFormat |
  |------|-----|--------|-------------|
  | premium | 22 | 4 | yuv420p |
  | standard | 30 | 6 | yuv420p |
  | economy | 38 | 8 | yuv420p |

  **AV1 NVIDIA (av1_nvenc)**:
  | Tier | CQ | Preset | PixelFormat |
  |------|-----|--------|-------------|
  | premium | 23 | p7 | yuv420p |
  | standard | 31 | p4 | yuv420p |
  | economy | 39 | p1 | yuv420p |

  For VAAPI/QSV: use similar quality values to NVENC but with `qp` instead of `cq`, and no preset (VAAPI/QSV don't use the same preset system). Set `profile` where supported.

- **`encoderConfigToArgs`**: Map each EncoderConfig field to its flag:
  - `codec` → `["-c:v", codec]`
  - `crf` → `["-crf", String(crf)]`
  - `cq` → `["-cq", String(cq)]` (NVENC uses `-cq` with `-rc constqp` or `-rc vbr`)
  - `qp` → `["-qp", String(qp)]`
  - `videoBitrate` → `["-b:v", videoBitrate]`
  - `maxBitrate` → `["-maxrate", maxBitrate]`
  - `bufSize` → `["-bufsize", bufSize]`
  - `preset` → `["-preset", preset]`
  - `profile` → `["-profile:v", profile]`
  - `level` → `["-level", level]`
  - `pixelFormat` → `["-pix_fmt", pixelFormat]`
  - `tune` → `["-tune", tune]`
  - `codecParams` → `["-x264-params", codecParams]` or `["-x265-params", codecParams]` based on codec
  - `gopSize` → `["-g", String(gopSize)]`
  - `bFrames` → `["-bf", String(bFrames)]`
  - `twoPass` with `pass` → `["-pass", String(pass)]`
  - `passLogFile` → `["-passlogfile", passLogFile]`

  For NVENC codecs: when `cq` is set, add `["-rc", "constqp"]` before the `-cq` flag.

- **`audioEncoderConfigToArgs`**: Map fields:
  - `codec` → `["-c:a", codec]`
  - `bitrate` → `["-b:a", bitrate]`
  - `sampleRate` → `["-ar", String(sampleRate)]`
  - `channels` → `["-ac", String(channels)]`
  - `channelLayout` → `["-channel_layout", channelLayout]`

**Acceptance Criteria**:
- [ ] `buildEncoderConfig("premium", "cpu", "h264")` returns `{ codec: "libx264", crf: 18, preset: "slow", profile: "high", pixelFormat: "yuv420p" }`
- [ ] `buildEncoderConfig("standard", "nvidia", "h264")` returns config with `codec: "h264_nvenc"` and `cq: 24`
- [ ] `buildEncoderConfig("economy", "cpu", "av1")` returns config with `codec: "libsvtav1"` and `crf: 38`
- [ ] `encoderConfigToArgs({ codec: "libx264", crf: 23, preset: "medium" })` returns `["-c:v", "libx264", "-crf", "23", "-preset", "medium"]`
- [ ] NVENC config args include `-rc constqp` when `cq` is set
- [ ] `audioEncoderConfigToArgs({ codec: "aac", bitrate: "192k" })` returns `["-c:a", "aac", "-b:a", "192k"]`
- [ ] All three quality tiers produce valid, distinct configs for each codec family

---

### Unit 6: Encoding Presets

**File**: `src/encoding/presets.ts`

```typescript
import type { PresetConfig, ExportPreset } from "../types/codecs.ts";

/** YouTube export presets */
export const YOUTUBE_PRESETS: Record<
  "youtube_hd" | "youtube_4k" | "youtube_shorts" | "youtube_draft",
  PresetConfig
>;

/** Social media presets */
export const SOCIAL_PRESETS: Record<
  "twitter" | "instagram" | "tiktok",
  PresetConfig
>;

/** Web delivery presets */
export const WEB_PRESETS: Record<"web_720p" | "web_1080p", PresetConfig>;

/** Archive preset */
export const ARCHIVE_PRESET: PresetConfig;

/**
 * Look up a preset config by name.
 * Returns undefined if not found.
 */
export function getPreset(name: ExportPreset): PresetConfig | undefined;

/**
 * Get all preset names.
 */
export function getPresetNames(): ExportPreset[];
```

**Implementation Notes**:

Preset values (these are the concrete settings — based on YouTube/platform recommended specs):

```typescript
YOUTUBE_PRESETS = {
  youtube_hd: {
    video: { codec: "libx264", crf: 18, preset: "slow", profile: "high", level: "4.1", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "192k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  youtube_4k: {
    video: { codec: "libx264", crf: 16, preset: "slow", profile: "high", level: "5.1", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "320k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  youtube_shorts: {
    video: { codec: "libx264", crf: 20, preset: "medium", profile: "high", level: "4.1", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "192k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  youtube_draft: {
    video: { codec: "libx264", crf: 28, preset: "ultrafast", profile: "main", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
};

SOCIAL_PRESETS = {
  twitter: {
    video: { codec: "libx264", crf: 23, preset: "medium", profile: "high", level: "4.1", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  instagram: {
    video: { codec: "libx264", crf: 22, preset: "medium", profile: "high", level: "4.0", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  tiktok: {
    video: { codec: "libx264", crf: 22, preset: "medium", profile: "high", level: "4.1", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
};

WEB_PRESETS = {
  web_720p: {
    video: { codec: "libx264", crf: 23, preset: "medium", profile: "main", level: "3.1", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  web_1080p: {
    video: { codec: "libx264", crf: 22, preset: "medium", profile: "high", level: "4.1", pixelFormat: "yuv420p" },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
};

ARCHIVE_PRESET = {
  video: { codec: "libx264", crf: 14, preset: "veryslow", profile: "high", level: "5.1", pixelFormat: "yuv420p" },
  audio: { codec: "flac" },
  format: "mkv",
  faststart: false,
};
```

- `getPreset()`: Combines all preset maps, looks up by name.
- All presets use CPU codecs — hardware variants are handled by swapping the codec + rate control in the config builder, not by duplicating presets.

**Acceptance Criteria**:
- [ ] All 10 `ExportPreset` names are resolvable via `getPreset()`
- [ ] Every preset produces a valid `PresetConfig` with video, audio, format, and faststart
- [ ] YouTube presets use `sampleRate: 48000` and `format: "mp4"`
- [ ] Archive preset uses `format: "mkv"` and `faststart: false`
- [ ] `getPresetNames()` returns all 10 names
- [ ] Every preset has `pixelFormat: "yuv420p"` (standard compatibility)

---

### Unit 7: Barrel Export Updates

**File**: `src/index.ts` (edit existing)

Add these exports to the public API barrel:

```typescript
// Hardware
export type { HardwareCapabilities, DetectConfig } from "./hardware/detect.ts";
export { detectHardware, clearHardwareCache } from "./hardware/detect.ts";
export type { HwSession, SessionConfig } from "./hardware/session.ts";
export { acquireSession, withHwSession } from "./hardware/session.ts";
export type { FallbackOptions } from "./hardware/fallback.ts";
export { executeWithFallback } from "./hardware/fallback.ts";

// Encoding
export type { CodecFamily, CodecMapping } from "./encoding/codecs.ts";
export { CODEC_REGISTRY, getEncoderForMode, getCpuEncoder, getCodecFamily, getDefaultAudioCodec } from "./encoding/codecs.ts";
export { buildEncoderConfig, encoderConfigToArgs, audioEncoderConfigToArgs } from "./encoding/config.ts";
export { YOUTUBE_PRESETS, SOCIAL_PRESETS, WEB_PRESETS, ARCHIVE_PRESET, getPreset, getPresetNames } from "./encoding/presets.ts";
```

**Acceptance Criteria**:
- [ ] All new functions and types are importable from `@ffmpeg-kit`
- [ ] `pnpm build` succeeds with no type errors
- [ ] Existing exports are unchanged

---

## Implementation Order

1. **Unit 4: Codec Registry** (`src/encoding/codecs.ts`) — Pure data, no dependencies on other new units. Used by Units 2 and 5.
2. **Unit 6: Encoding Presets** (`src/encoding/presets.ts`) — Pure data, depends only on existing types.
3. **Unit 5: Encoder Config Builder** (`src/encoding/config.ts`) — Depends on Unit 4 for codec lookup.
4. **Unit 1: Hardware Detection** (`src/hardware/detect.ts`) — Depends on existing `execute`, `findExecutable`, `Cache`. Used by Unit 2.
5. **Unit 2: Hardware Session Management** (`src/hardware/session.ts`) — Depends on Units 1 and 4.
6. **Unit 3: Hardware Fallback** (`src/hardware/fallback.ts`) — Depends on Units 2 and 5. Top of the dependency chain.
7. **Unit 7: Barrel Export Updates** (`src/index.ts`) — After all units compile.

---

## Testing

### Unit Tests

#### `__tests__/unit/codecs.test.ts`

Tests for the codec registry (Unit 4):
- `getEncoderForMode` returns correct encoder for each family+mode combination
- `getEncoderForMode` falls back to CPU encoder when no hw encoder exists
- `getCpuEncoder` returns correct encoder for each family
- `getCodecFamily` correctly identifies family from encoder name
- `getCodecFamily` returns null for unknown encoder names
- `getDefaultAudioCodec` returns correct codec for each container

#### `__tests__/unit/presets.test.ts`

Tests for encoding presets (Unit 6):
- Every `ExportPreset` is resolvable via `getPreset()`
- Every preset has all required `PresetConfig` fields
- All YouTube presets have `sampleRate: 48000`
- All presets have `pixelFormat: "yuv420p"`
- Archive preset uses `format: "mkv"` and `codec: "flac"` for audio
- `getPresetNames()` returns all 10 names

#### `__tests__/unit/encoder-config.test.ts`

Tests for the encoder config builder (Unit 5):
- `buildEncoderConfig` produces correct values for each tier/mode/family combination
- `encoderConfigToArgs` produces correct flag arrays
- NVENC configs include `-rc constqp` when `cq` is set
- `audioEncoderConfigToArgs` produces correct flag arrays
- Two-pass config produces `-pass` and `-passlogfile` args
- All optional fields are omitted when undefined

#### `__tests__/unit/hardware-detect.test.ts`

Tests for hardware detection parsing helpers (Unit 1):
- `parseEncoders` correctly extracts encoder names from `ffmpeg -encoders` output
- `parseDecoders` correctly extracts decoder names
- `parseHwaccels` correctly extracts hwaccel method names
- `categorizeEncoder` maps encoder names to correct families
- `mapHwaccelMode` maps raw names to `HwAccelMode` values

Note: Since parsing helpers are internal, either export them for testing or test through `detectHardware()` with mocked subprocess output. Prefer exporting the pure parsing functions for testability — they can be exported with a `/** @internal */` JSDoc annotation.

#### `__tests__/unit/session.test.ts`

Tests for session management (Unit 2):
- CPU session returns expected encoder and empty inputArgs
- Session release is idempotent
- `withHwSession` calls release on success
- `withHwSession` calls release on operation failure

### Integration (E2E) Tests

#### `__tests__/integration/hardware.e2e.test.ts`

```typescript
describeWithFFmpeg("detectHardware()", () => {
  it("returns capabilities with cpu always available", async () => {
    const caps = await detectHardware();
    expect(caps.available).toContain("cpu");
    expect(caps.encoders).toBeDefined();
    expect(caps.decoders).toBeDefined();
  });

  it("caches result across calls", async () => {
    const caps1 = await detectHardware();
    const caps2 = await detectHardware();
    expect(caps1).toBe(caps2); // same reference
  });

  it("clearHardwareCache forces re-detection", async () => {
    const caps1 = await detectHardware();
    clearHardwareCache();
    const caps2 = await detectHardware();
    expect(caps1).not.toBe(caps2); // different reference
    // But same content (system hasn't changed)
    expect(caps2.available).toContain("cpu");
  });
});
```

#### `__tests__/integration/encode.e2e.test.ts`

```typescript
describeWithFFmpeg("buildEncoderConfig → execute", () => {
  it("encodes video with premium CPU h264", async () => {
    const config = buildEncoderConfig("premium", "cpu", "h264");
    const args = encoderConfigToArgs(config);
    const output = tmp("premium-h264.mp4");

    await execute(["-i", FIXTURES.videoShort, ...args, "-t", "1", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectCodec(info, "video", "h264");
  });

  it("encodes video with economy CPU h264", async () => {
    const configPremium = buildEncoderConfig("premium", "cpu", "h264");
    const configEconomy = buildEncoderConfig("economy", "cpu", "h264");
    const outputPremium = tmp("premium.mp4");
    const outputEconomy = tmp("economy.mp4");

    await execute(["-i", FIXTURES.videoShort, ...encoderConfigToArgs(configPremium), "-t", "1", outputPremium]);
    await execute(["-i", FIXTURES.videoShort, ...encoderConfigToArgs(configEconomy), "-t", "1", outputEconomy]);

    // Economy should produce smaller file
    const premiumSize = statSync(outputPremium).size;
    const economySize = statSync(outputEconomy).size;
    expect(economySize).toBeLessThan(premiumSize);
  });
});
```

#### NVENC E2E tests (gated)

```typescript
const describeWithNvenc = process.env.FFMPEG_HW_TESTS === "1" ? describe : describe.skip;

describeWithNvenc("NVENC encoding", () => {
  it("encodes with h264_nvenc", async () => {
    const config = buildEncoderConfig("standard", "nvidia", "h264");
    const args = encoderConfigToArgs(config);
    const output = tmp("nvenc-h264.mp4");

    await execute(["-hwaccel", "cuda", "-i", FIXTURES.videoShort, ...args, "-t", "1", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectCodec(info, "video", "h264");
  });
});
```

#### Fallback E2E test

```typescript
describeWithFFmpeg("executeWithFallback", () => {
  it("falls back to CPU when hw is unavailable", async () => {
    const output = tmp("fallback.mp4");

    const result = await executeWithFallback(
      (inputArgs, encoder) => [
        ...inputArgs,
        "-i", FIXTURES.videoShort,
        "-c:v", encoder,
        "-t", "1",
        output,
      ],
      { hwAccel: "auto", codec: "h264" },
    );

    expectFileExists(output);
    // On machines without GPU, usedMode should be "cpu"
    // On machines with GPU, usedMode should be the GPU mode
    expect(["cpu", "nvidia", "vaapi", "qsv", "vulkan"]).toContain(result.usedMode);
  });
});
```

---

## Verification Checklist

```bash
# Build compiles with no errors
pnpm build

# Typecheck passes
pnpm typecheck

# Lint passes
pnpm lint

# All unit tests pass
pnpm test:unit

# All E2E tests pass (requires ffmpeg)
pnpm test:e2e

# Run full test suite 3x to verify no flakiness
pnpm test && pnpm test && pnpm test
```

# FFmpeg SDK - Public Interface Specification

> TypeScript SDK for FFmpeg CLI wrapping. Designed from analysis of real-world usage
> (termtube, youtube-ts-auto), FFmpeg 7.1.x capabilities, and local installation profiling.

---

## Table of Contents

1. [Core Execution](#1-core-execution)
2. [Probe (ffprobe)](#2-probe-ffprobe)
3. [Hardware Acceleration](#3-hardware-acceleration)
4. [Encoder Configuration](#4-encoder-configuration)
5. [Operations](#5-operations)
   - [Extract](#51-extract)
   - [Transform](#52-transform)
   - [Audio](#53-audio)
   - [Concat](#54-concat)
   - [Export](#55-export)
   - [Overlay](#56-overlay--compositing)
   - [Text](#57-text--drawtext)
   - [Subtitle](#58-subtitle)
   - [Image](#59-image)
   - [Streaming](#510-streaming)
   - [GIF](#511-gif)
6. [Filter Graph](#6-filter-graph)
7. [Presets](#7-presets)
8. [Types & Enums](#8-types--enums)
9. [Error Handling](#9-error-handling)
10. [Events & Progress](#10-events--progress)

---

## 1. Core Execution

The low-level execution engine. All operations ultimately call through this layer.

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

interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Duration of the execution in milliseconds */
  durationMs: number;
}

/** Core execution function */
function execute(args: string[], options?: ExecuteOptions): Promise<ExecuteResult>;

/** Validate that ffmpeg and ffprobe binaries are available */
function validateInstallation(): Promise<{
  ffmpeg: { path: string; version: string };
  ffprobe: { path: string; version: string };
}>;

/** Parse timecodes in various formats to seconds */
function parseTimecode(timecode: string): number;
// Supports: "HH:MM:SS.ms", "MM:SS.ms", "SS.ms", "123.45", percentage "50%"
```

---

## 2. Probe (ffprobe)

Media metadata extraction via ffprobe.

```typescript
interface ProbeResult {
  format: FormatInfo;
  streams: StreamInfo[];
  chapters: ChapterInfo[];
}

interface FormatInfo {
  filename: string;
  formatName: string;
  formatLongName: string;
  duration: number;         // seconds
  size: number;             // bytes
  bitrate: number;          // bits/sec
  startTime: number;
  nbStreams: number;
  tags: Record<string, string>;
}

interface VideoStreamInfo {
  type: 'video';
  index: number;
  codec: string;
  codecLongName: string;
  profile: string;
  width: number;
  height: number;
  displayAspectRatio: string;     // "16:9"
  sampleAspectRatio: string;      // "1:1"
  pixelFormat: string;            // "yuv420p"
  colorSpace?: string;            // "bt709"
  colorRange?: string;            // "tv" | "pc"
  colorTransfer?: string;         // "bt709" | "smpte2084" (HDR)
  colorPrimaries?: string;        // "bt709" | "bt2020"
  frameRate: number;              // fps as float
  avgFrameRate: number;
  bitrate: number;
  duration: number;
  nbFrames?: number;
  fieldOrder?: string;            // "progressive" | "tt" | "bb" | "tb" | "bt"
  bitsPerRawSample?: number;
  disposition: StreamDisposition;
  tags: Record<string, string>;
  /** Rotation metadata from side data or tags */
  rotation?: number;
}

interface AudioStreamInfo {
  type: 'audio';
  index: number;
  codec: string;
  codecLongName: string;
  profile: string;
  sampleRate: number;
  channels: number;
  channelLayout: string;          // "stereo", "5.1", "mono"
  sampleFormat: string;           // "fltp", "s16"
  bitrate: number;
  duration: number;
  bitsPerRawSample?: number;
  disposition: StreamDisposition;
  tags: Record<string, string>;
}

interface SubtitleStreamInfo {
  type: 'subtitle';
  index: number;
  codec: string;
  codecLongName: string;
  disposition: StreamDisposition;
  tags: Record<string, string>;
}

type StreamInfo = VideoStreamInfo | AudioStreamInfo | SubtitleStreamInfo;

interface StreamDisposition {
  default: boolean;
  dub: boolean;
  original: boolean;
  comment: boolean;
  lyrics: boolean;
  karaoke: boolean;
  forced: boolean;
  hearingImpaired: boolean;
  visualImpaired: boolean;
  attachedPic: boolean;
}

interface ChapterInfo {
  id: number;
  startTime: number;
  endTime: number;
  tags: Record<string, string>;
}

/** Full media probe */
function probe(inputPath: string): Promise<ProbeResult>;

/** Quick duration query */
function getDuration(inputPath: string): Promise<number>;

/** Get specific stream info */
function getVideoStream(inputPath: string): Promise<VideoStreamInfo | null>;
function getAudioStream(inputPath: string): Promise<AudioStreamInfo | null>;
```

---

## 3. Hardware Acceleration

GPU detection, session management, and hardware-accelerated encoding/decoding.

```typescript
type HwAccelMode = 'auto' | 'nvidia' | 'vaapi' | 'qsv' | 'vulkan' | 'cpu';

interface HardwareCapabilities {
  /** Available hardware acceleration methods */
  available: HwAccelMode[];
  /** Detected GPU info */
  gpu?: {
    vendor: 'nvidia' | 'amd' | 'intel' | 'unknown';
    model: string;
    /** Max concurrent encoding sessions */
    maxSessions: number;
  };
  /** Available hardware encoders */
  encoders: {
    h264: string[];    // e.g. ['h264_nvenc', 'h264_vaapi', 'h264_qsv']
    hevc: string[];    // e.g. ['hevc_nvenc', 'hevc_vaapi']
    av1: string[];     // e.g. ['av1_nvenc', 'av1_vaapi']
    vp9: string[];     // e.g. ['vp9_vaapi', 'vp9_qsv']
    vvc: string[];     // e.g. ['libvvenc']
  };
  /** Available hardware decoders */
  decoders: {
    h264: string[];
    hevc: string[];
    av1: string[];
    vp9: string[];
  };
}

/** Detect hardware capabilities (cached after first call) */
function detectHardware(): Promise<HardwareCapabilities>;

/** Acquire a hardware encoding session (reference counted) */
function acquireSession(mode: HwAccelMode): Promise<HwSession>;

/** RAII-style session wrapper */
function withHwSession<T>(
  mode: HwAccelMode,
  operation: (session: HwSession) => Promise<T>
): Promise<T>;

interface HwSession {
  mode: HwAccelMode;
  encoder: string;
  /** Input args for hardware-accelerated decoding */
  inputArgs: string[];
  release(): void;
}
```

---

## 4. Encoder Configuration

Encoder presets, quality tiers, and codec-specific configuration builders.

```typescript
type VideoCodec =
  // H.264/AVC
  | 'libx264' | 'libx264rgb' | 'libopenh264'
  | 'h264_nvenc' | 'h264_amf' | 'h264_vaapi' | 'h264_qsv' | 'h264_vulkan'
  // H.265/HEVC
  | 'libx265'
  | 'hevc_nvenc' | 'hevc_amf' | 'hevc_vaapi' | 'hevc_qsv' | 'hevc_vulkan'
  // AV1
  | 'libaom-av1' | 'libsvtav1' | 'librav1e'
  | 'av1_nvenc' | 'av1_amf' | 'av1_vaapi' | 'av1_qsv'
  // VP8/VP9
  | 'libvpx' | 'libvpx-vp9'
  | 'vp8_vaapi' | 'vp9_vaapi' | 'vp9_qsv'
  // VVC/H.266
  | 'libvvenc'
  // Others
  | 'prores' | 'prores_ks' | 'dnxhd' | 'mjpeg' | 'gif'
  | 'copy';

type AudioCodec =
  | 'aac' | 'libfdk_aac'
  | 'libmp3lame'
  | 'libopus'
  | 'libvorbis'
  | 'flac' | 'alac'
  | 'ac3' | 'eac3'
  | 'pcm_s16le' | 'pcm_s24le' | 'pcm_s32le' | 'pcm_f32le'
  | 'copy';

type QualityTier = 'premium' | 'standard' | 'economy';

type EncodingPreset =
  // libx264/libx265
  | 'ultrafast' | 'superfast' | 'veryfast' | 'faster' | 'fast'
  | 'medium' | 'slow' | 'slower' | 'veryslow' | 'placebo'
  // NVENC
  | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7'
  // SVT-AV1
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'
  | '9' | '10' | '11' | '12' | '13';

type RateControlMode = 'crf' | 'cq' | 'cbr' | 'vbr' | 'abr' | 'constrained-quality';

interface EncoderConfig {
  codec: VideoCodec;
  /** Constant Rate Factor (libx264/libx265: 0-51, lower = better) */
  crf?: number;
  /** Constant Quality (NVENC: 0-51) */
  cq?: number;
  /** Quantization Parameter */
  qp?: number;
  /** Video bitrate (e.g. '5M', '10000k') */
  videoBitrate?: string;
  /** Max bitrate for VBV/VBR modes */
  maxBitrate?: string;
  /** VBV buffer size */
  bufSize?: string;
  /** Encoding speed preset */
  preset?: EncodingPreset;
  /** Codec profile (e.g. 'high', 'main', 'baseline') */
  profile?: string;
  /** Codec level (e.g. '4.1', '5.0') */
  level?: string;
  /** Pixel format (default: 'yuv420p') */
  pixelFormat?: PixelFormat;
  /** Tune parameter (e.g. 'film', 'animation', 'grain', 'zerolatency') */
  tune?: string;
  /** x264/x265 specific params as key=value string */
  codecParams?: string;
  /** Keyframe interval in frames */
  gopSize?: number;
  /** Max B-frames between non-B-frames */
  bFrames?: number;
  /** Enable 2-pass encoding */
  twoPass?: boolean;
  /** Pass number for 2-pass (1 or 2) */
  pass?: 1 | 2;
  /** Passlog file prefix for 2-pass */
  passLogFile?: string;
}

interface AudioEncoderConfig {
  codec: AudioCodec;
  bitrate?: string;          // e.g. '192k', '320k'
  sampleRate?: number;       // e.g. 44100, 48000
  channels?: number;         // 1 = mono, 2 = stereo, 6 = 5.1
  channelLayout?: string;    // 'mono', 'stereo', '5.1'
}

/** Build encoder args for a quality tier + hardware mode */
function buildEncoderArgs(
  tier: QualityTier,
  hwAccel: HwAccelMode,
  options?: { codec?: 'h264' | 'hevc' | 'av1' }
): EncoderConfig;
```

---

## 5. Operations

All operations use a **fluent builder pattern** and return a `Promise<OperationResult>` from `.execute()`.

### 5.1 Extract

Single frame or thumbnail extraction from video.

```typescript
interface ExtractBuilder {
  input(path: string): this;
  /** Seek position: seconds, "HH:MM:SS", or percentage "50%" */
  timestamp(position: string | number): this;
  /** Output dimensions (use -2 for auto-aspect on either axis) */
  size(dimensions: { width?: number; height?: number }): this;
  /** Output image format */
  format(fmt: 'png' | 'jpg' | 'webp' | 'bmp' | 'tiff'): this;
  /** JPEG quality 1-31 (1=best), WebP quality 0-100 */
  quality(q: number): this;
  /** Extract N frames instead of 1 */
  frames(count: number): this;
  /** Use scene detection to pick best thumbnail */
  thumbnail(enabled?: boolean): this;
  output(path: string): this;
  /** Build args without executing (for inspection/debugging) */
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ExtractResult>;
}

interface ExtractResult {
  outputPath: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

function extract(): ExtractBuilder;
```

### 5.2 Transform

Video transformation: scale, crop, effects, speed, trim.

```typescript
type FitMode = 'contain' | 'cover' | 'fill' | 'none';
type ScaleAlgorithm = 'bilinear' | 'bicubic' | 'lanczos' | 'spline' | 'neighbor';

interface Position {
  x: number;  // 0-1 normalized
  y: number;  // 0-1 normalized
}

type NamedPosition = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  | 'top-center' | 'bottom-center' | 'center-left' | 'center-right';

type EasingFunction = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

interface KenBurnsConfig {
  duration: number;
  startZoom: number;
  endZoom: number;
  startPosition: Position | NamedPosition;
  endPosition: Position | NamedPosition;
  easing?: EasingFunction;
  fps?: number;
}

interface CropConfig {
  /** Crop to aspect ratio (e.g. "16:9", "1:1") */
  aspectRatio?: string;
  /** Explicit dimensions */
  width?: number;
  height?: number;
  /** Crop origin */
  x?: number;
  y?: number;
  /** Auto-detect crop (black bars) */
  detect?: boolean;
}

interface TransformBuilder {
  input(path: string): this;
  /** Scale to dimensions (use -2 for auto-aspect) */
  scale(dimensions: { width?: number; height?: number }): this;
  /** How to fit video into target dimensions */
  fit(mode: FitMode): this;
  /** Scaling algorithm */
  scaleAlgorithm(algo: ScaleAlgorithm): this;
  /** Crop video */
  crop(config: CropConfig): this;
  /** Ken Burns pan/zoom effect (typically on still images) */
  kenBurns(config: KenBurnsConfig): this;
  /** Speed multiplier (0.25 = 4x slower, 4.0 = 4x faster) */
  speed(factor: number): this;
  /** Reverse video */
  reverse(): this;
  /** Trim start */
  trimStart(timestamp: string | number): this;
  /** Trim end */
  trimEnd(timestamp: string | number): this;
  /** Set output duration */
  duration(seconds: number): this;
  /** Loop input N times (-1 = infinite for duration) */
  loop(count: number): this;
  /** Set output frame rate */
  fps(rate: number): this;
  /** Frame interpolation for smooth slow-mo */
  interpolate(fps: number, method?: 'minterpolate' | 'framerate'): this;
  /** Pad to dimensions with background color */
  pad(dimensions: { width: number; height: number }, color?: string): this;
  /** Rotate: 90, 180, 270, or arbitrary degrees */
  rotate(degrees: number): this;
  /** Flip horizontally */
  flipH(): this;
  /** Flip vertically */
  flipV(): this;
  /** Video stabilization (libvidstab 2-pass) */
  stabilize(options?: { shakiness?: number; accuracy?: number; smoothing?: number }): this;
  /** Set output resolution shorthand */
  outputSize(width: number, height: number): this;
  /** Hardware acceleration mode */
  hwAccel(mode: HwAccelMode): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<TransformResult>;
}

interface TransformResult {
  outputPath: string;
  duration: number;
  width: number;
  height: number;
  sizeBytes: number;
}

function transform(): TransformBuilder;
```

### 5.3 Audio

Audio extraction, mixing, processing, and effects.

```typescript
type FadeCurve =
  | 'tri' | 'qsin' | 'esin' | 'hsin' | 'log'
  | 'ipar' | 'qua' | 'cub' | 'squ' | 'cbr'
  | 'par' | 'exp' | 'iqsin' | 'ihsin' | 'dese' | 'desi' | 'losi' | 'sinc' | 'isinc' | 'nofade';

interface AudioInputConfig {
  /** Volume adjustment: number (multiplier), string ('-6dB'), 0-based track index for relative */
  volume?: number | string;
  /** Delay in milliseconds before this track starts */
  delay?: number;
  /** Trim start of this audio input */
  trimStart?: number;
  /** Trim end */
  trimEnd?: number;
}

interface DuckConfig {
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

interface NormalizeConfig {
  /** Target integrated loudness (LUFS). YouTube standard: -14 */
  targetLufs: number;
  /** True peak maximum (dBFS, default: -1.5) */
  truePeak?: number;
  /** Loudness range target */
  loudnessRange?: number;
  /** Two-pass normalization for accuracy */
  twoPass?: boolean;
}

interface AudioBuilder {
  /** Single audio input */
  input(path: string): this;
  /** Add input with options (for mixing multiple sources) */
  addInput(path: string, config?: AudioInputConfig): this;
  /** Extract audio from video file */
  extractAudio(options?: {
    codec?: AudioCodec;
    bitrate?: string;
    sampleRate?: number;
    channels?: number;
  }): this;
  /** Sidechain ducking (reduce music when voice is present) */
  duck(config: DuckConfig): this;
  /** EBU R128 loudness normalization */
  normalize(config: NormalizeConfig): this;
  /** Fade in */
  fadeIn(config: { duration: number; curve?: FadeCurve }): this;
  /** Fade out */
  fadeOut(config: { duration: number; startAt?: number; curve?: FadeCurve }): this;
  /** Audio compressor */
  compress(config?: {
    threshold?: number;     // dB
    ratio?: number;         // e.g. 4 = 4:1
    attack?: number;        // ms
    release?: number;       // ms
    makeupGain?: number;    // dB
    knee?: number;          // dB
  }): this;
  /** Limiter */
  limit(config?: { limit?: number; attack?: number; release?: number }): this;
  /** Equalizer band */
  eq(config: {
    frequency: number;
    width?: number;       // Hz or Q
    widthType?: 'h' | 'q' | 'o' | 's';  // Hz, Q, octave, slope
    gain: number;         // dB
  }): this;
  /** High-pass filter */
  highpass(frequency: number, order?: number): this;
  /** Low-pass filter */
  lowpass(frequency: number, order?: number): this;
  /** Bass boost/cut */
  bass(gain: number, frequency?: number): this;
  /** Treble boost/cut */
  treble(gain: number, frequency?: number): this;
  /** Noise gate */
  gate(config?: { threshold?: number; attack?: number; release?: number }): this;
  /** De-noise */
  denoise(config?: { amount?: number; method?: 'afftdn' | 'anlmdn' }): this;
  /** De-esser */
  deess(config?: { frequency?: number; intensity?: number }): this;
  /** Echo/reverb */
  echo(config?: { delay?: number; decay?: number }): this;
  /** Tempo change without pitch shift */
  tempo(factor: number): this;
  /** Pitch shift without tempo change (requires librubberband) */
  pitch(semitones: number): this;
  /** Resample to different sample rate (with optional SoX resampler) */
  resample(sampleRate: number, useSoxr?: boolean): this;
  /** Set output codec */
  codec(codec: AudioCodec): this;
  /** Set output bitrate */
  bitrate(bitrate: string): this;
  /** Set output sample rate */
  sampleRate(rate: number): this;
  /** Set output channels */
  channels(count: number): this;
  /** Set channel layout */
  channelLayout(layout: string): this;
  /** Silence detection - returns detected silence ranges */
  detectSilence(config?: {
    threshold?: number;     // dB (default: -50)
    duration?: number;      // minimum silence duration (seconds)
  }): this;
  /** Per-frame amplitude extraction (for visualization/lip-sync) */
  extractAmplitude(config: { fps: number; outputFormat?: 'f32le' | 'json' }): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<AudioResult>;
}

interface AudioResult {
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

function audio(): AudioBuilder;
```

### 5.4 Concat

Video concatenation with optional transitions.

```typescript
type TransitionType =
  // Basic
  | 'fade' | 'fadeblack' | 'fadewhite' | 'dissolve'
  // Wipes
  | 'wipeleft' | 'wiperight' | 'wipeup' | 'wipedown'
  | 'wipetl' | 'wipetr' | 'wipebl' | 'wipebr'
  // Slides
  | 'slideleft' | 'slideright' | 'slideup' | 'slidedown'
  // Smooth
  | 'smoothleft' | 'smoothright' | 'smoothup' | 'smoothdown'
  // Covers
  | 'coverleft' | 'coverright' | 'coverup' | 'coverdown'
  // Reveals
  | 'revealleft' | 'revealright' | 'revealup' | 'revealdown'
  // Shapes
  | 'circlecrop' | 'rectcrop' | 'circleopen' | 'circleclose'
  | 'vertopen' | 'vertclose' | 'horzopen' | 'horzclose'
  // Effects
  | 'pixelize' | 'distance' | 'fadegrays' | 'hblur'
  | 'zoomin' | 'fadefast' | 'fadeslow' | 'radial'
  // Diagonals
  | 'diagtl' | 'diagtr' | 'diagbl' | 'diagbr'
  // Slices
  | 'hlslice' | 'hrslice' | 'vuslice' | 'vdslice'
  // Squeeze
  | 'squeezeh' | 'squeezev'
  // Wind
  | 'hlwind' | 'hrwind' | 'vuwind' | 'vdwind'
  // Custom expression
  | 'custom';

interface ClipConfig {
  path: string;
  trimStart?: number;
  trimEnd?: number;
  /** Duration override (alternative to trimEnd) */
  duration?: number;
}

interface TransitionConfig {
  type: TransitionType;
  /** Transition duration in seconds (default: 1) */
  duration?: number;
  /** Custom expression (when type is 'custom') */
  expr?: string;
}

interface ConcatBuilder {
  /** Add a clip (string path or full config) */
  addClip(clip: string | ClipConfig): this;
  /** Set transition between clips (applies to next junction) */
  transition(config: TransitionConfig): this;
  /** Set default transition for all junctions */
  defaultTransition(config: TransitionConfig): this;
  /** Audio crossfade duration (independent of video transition) */
  audioCrossfade(duration: number): this;
  /** Normalize all clips to consistent resolution */
  normalizeResolution(width: number, height: number): this;
  /** Normalize all clips to consistent FPS */
  normalizeFps(fps: number): this;
  /** Generate silent audio for clips without audio tracks */
  fillSilence(enabled?: boolean): this;
  /** Hardware acceleration */
  hwAccel(mode: HwAccelMode): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ConcatResult>;
}

interface ConcatResult {
  outputPath: string;
  duration: number;
  clipCount: number;
  sizeBytes: number;
  /** Whether simple (no re-encode) or complex (filter graph) path was used */
  method: 'demuxer' | 'filter_complex';
}

function concat(): ConcatBuilder;
```

### 5.5 Export

Final video export with encoding presets.

```typescript
type ContainerFormat = 'mp4' | 'mkv' | 'webm' | 'mov' | 'avi' | 'ts' | 'flv';
type ExportPreset = 'youtube_hd' | 'youtube_4k' | 'youtube_shorts' | 'youtube_draft'
  | 'twitter' | 'instagram' | 'tiktok' | 'web_720p' | 'web_1080p' | 'archive';

interface ExportBuilder {
  /** Video input file */
  videoInput(path: string): this;
  /** Separate audio input (for muxing) */
  audioInput(path: string): this;
  /** Single input with both video and audio */
  input(path: string): this;
  /** Apply a platform preset */
  preset(preset: ExportPreset): this;
  /** Quality tier (maps to CRF/CQ values) */
  qualityTier(tier: QualityTier): this;
  /** Video codec */
  videoCodec(codec: VideoCodec): this;
  /** CRF value (0-51) */
  crf(value: number): this;
  /** Video bitrate */
  videoBitrate(bitrate: string): this;
  /** Max video bitrate (for VBR) */
  maxVideoBitrate(bitrate: string): this;
  /** Encoding speed preset */
  encodingPreset(preset: EncodingPreset): this;
  /** Pixel format */
  pixelFormat(format: PixelFormat): this;
  /** Codec profile */
  profile(profile: string): this;
  /** Codec level */
  level(level: string): this;
  /** Codec tune */
  tune(tune: string): this;
  /** Audio codec */
  audioCodec(codec: AudioCodec): this;
  /** Audio bitrate */
  audioBitrate(bitrate: string): this;
  /** Audio sample rate */
  audioSampleRate(rate: number): this;
  /** Audio channels */
  audioChannels(count: number): this;
  /** Move moov atom to start for web streaming (default: true for mp4) */
  faststart(enabled?: boolean): this;
  /** Output container format */
  format(fmt: ContainerFormat): this;
  /** Hardware acceleration mode */
  hwAccel(mode: HwAccelMode): this;
  /** 2-pass encoding */
  twoPass(enabled?: boolean): this;
  /** Explicit stream mapping (-map) */
  map(streams: string[]): this;
  /** Additional FFmpeg output args */
  outputArgs(args: string[]): this;
  /** Additional FFmpeg input args (before -i) */
  inputArgs(args: string[]): this;
  /** Metadata key-value pairs */
  metadata(meta: Record<string, string>): this;
  /** Chapter markers */
  chapters(chapters: Array<{ start: number; end: number; title: string }>): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ExportResult>;
}

interface ExportResult {
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

function exportVideo(): ExportBuilder;
```

### 5.6 Overlay / Compositing

Layer videos, images, and effects on top of each other.

```typescript
type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken'
  | 'lighten' | 'dodge' | 'burn' | 'hardlight' | 'softlight'
  | 'difference' | 'exclusion' | 'addition';

interface OverlayPosition {
  /** X position: number (pixels), string (expression like 'W-w-10') */
  x: number | string;
  /** Y position: number (pixels), string (expression like 'H-h-10') */
  y: number | string;
}

type OverlayAnchor = 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

interface OverlayConfig {
  /** Input path for overlay content */
  input: string;
  /** Position on the base video */
  position?: OverlayPosition;
  /** Anchor-based positioning (alternative to x,y) */
  anchor?: OverlayAnchor;
  /** Margin from edges when using anchor positioning */
  margin?: number | { x?: number; y?: number };
  /** Scale overlay to dimensions */
  scale?: { width?: number; height?: number };
  /** Opacity 0-1 */
  opacity?: number;
  /** Start time (seconds) */
  startTime?: number;
  /** End time (seconds) */
  endTime?: number;
  /** Duration */
  duration?: number;
  /** Fade in duration */
  fadeIn?: number;
  /** Fade out duration */
  fadeOut?: number;
  /** Blend mode */
  blendMode?: BlendMode;
  /** Chroma key (green/blue screen removal) */
  chromaKey?: {
    color: string;          // hex color or name
    similarity?: number;    // 0-1
    blend?: number;         // 0-1
  };
  /** Color key */
  colorKey?: {
    color: string;
    similarity?: number;
    blend?: number;
  };
}

interface OverlayBuilder {
  /** Base video input */
  base(path: string): this;
  /** Add an overlay layer */
  addOverlay(config: OverlayConfig): this;
  /** Picture-in-picture shorthand */
  pip(config: {
    input: string;
    position: OverlayAnchor;
    scale: number;        // fraction of base (e.g. 0.25 = quarter size)
    margin?: number;
    borderWidth?: number;
    borderColor?: string;
  }): this;
  /** Watermark shorthand */
  watermark(config: {
    input: string;
    position: OverlayAnchor;
    opacity?: number;
    margin?: number;
    scale?: number;
  }): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<OverlayResult>;
}

interface OverlayResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
}

function overlay(): OverlayBuilder;
```

### 5.7 Text / Drawtext

Burn text onto video frames.

```typescript
interface TextStyle {
  font?: string;              // Font family name (default: 'Sans')
  fontFile?: string;          // Path to .ttf/.otf file
  fontSize?: number | string; // Pixels or expression
  fontColor?: string;         // Color name or hex (default: 'white')
  fontColorExpr?: string;     // Dynamic color expression
  borderWidth?: number;       // Text outline width
  borderColor?: string;       // Outline color
  shadowX?: number;           // Shadow offset X
  shadowY?: number;           // Shadow offset Y
  shadowColor?: string;       // Shadow color
  /** Background box */
  box?: boolean;
  boxColor?: string;          // Including alpha: 'black@0.5'
  boxBorderWidth?: number | string; // Single value or "t|r|b|l"
  /** Text alignment within box */
  textAlign?: 'left' | 'center' | 'right';
  lineSpacing?: number;
  alpha?: number | string;    // 0-1 or expression
}

interface TextConfig {
  /** Static text content */
  text?: string;
  /** Text file path (for dynamic content) */
  textFile?: string;
  /** Reload text file every N frames */
  reloadInterval?: number;
  /** Position */
  x?: number | string;       // Pixels or expression (supports 'w', 'h', 'text_w', 'text_h', 't', 'n')
  y?: number | string;
  /** Anchor-based positioning */
  anchor?: OverlayAnchor;
  margin?: number;
  /** Style */
  style: TextStyle;
  /** Time range */
  startTime?: number;
  endTime?: number;
  /** Timecode display */
  timecode?: string;          // Initial timecode "HH:MM:SS:FF"
  timecodeRate?: number;
  /** Enable/expression for when to show */
  enable?: string;            // FFmpeg expression: 'between(t,5,10)'
}

interface TextBuilder {
  input(path: string): this;
  /** Add a text element */
  addText(config: TextConfig): this;
  /** Scrolling text (credits-style) */
  scroll(config: {
    text: string;
    style: TextStyle;
    speed?: number;           // Pixels per second
    direction?: 'up' | 'down' | 'left' | 'right';
  }): this;
  /** Animated counter/timer */
  counter(config: {
    start: number;
    end: number;
    style: TextStyle;
    position: { x: number | string; y: number | string };
    format?: string;          // printf format, e.g. '%02d'
  }): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<TextResult>;
}

interface TextResult {
  outputPath: string;
  duration: number;
  sizeBytes: number;
}

function text(): TextBuilder;
```

### 5.8 Subtitle

Subtitle handling: soft embedding and hard burning.

```typescript
type SubtitleFormat = 'srt' | 'ass' | 'ssa' | 'webvtt' | 'dvbsub' | 'pgs' | 'mov_text';

interface SubtitleBuilder {
  /** Video input */
  input(path: string): this;
  /** Add subtitle file for soft embedding (muxing) */
  softSub(config: {
    path: string;
    language?: string;        // ISO 639 code
    title?: string;
    default?: boolean;
    forced?: boolean;
  }): this;
  /** Hard burn subtitles into video */
  hardBurn(config: {
    path: string;
    /** ASS/SSA style overrides */
    forceStyle?: string;      // "FontSize=24,PrimaryColour=&H00FFFFFF"
    /** Character encoding */
    charEncoding?: string;
  }): this;
  /** Extract subtitles from a stream */
  extract(config: {
    streamIndex: number;
    format: SubtitleFormat;
  }): this;
  /** Convert subtitle format */
  convert(config: {
    inputPath: string;
    outputFormat: SubtitleFormat;
  }): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<SubtitleResult>;
}

interface SubtitleResult {
  outputPath: string;
  sizeBytes: number;
}

function subtitle(): SubtitleBuilder;
```

### 5.9 Image

Image processing, sequences, and generation.

```typescript
interface ImageBuilder {
  input(path: string): this;
  /** Input is an image sequence (e.g. 'frame_%04d.png') */
  imageSequence(pattern: string, options?: {
    fps?: number;
    startNumber?: number;
    pixelFormat?: PixelFormat;
  }): this;
  /** Convert image format */
  convert(format: 'png' | 'jpg' | 'webp' | 'bmp' | 'tiff' | 'avif' | 'jxl'): this;
  /** Resize */
  resize(dimensions: { width?: number; height?: number }): this;
  /** Create video from single image */
  toVideo(config: {
    duration: number;
    fps?: number;
    codec?: VideoCodec;
  }): this;
  /** Generate color bars / test pattern */
  testPattern(config: {
    type: 'color' | 'smptebars' | 'testsrc' | 'testsrc2' | 'rgbtestsrc';
    width: number;
    height: number;
    duration: number;
    fps?: number;
  }): this;
  /** Generate solid color */
  solidColor(config: {
    color: string;
    width: number;
    height: number;
    duration: number;
  }): this;
  /** Generate silent audio */
  silentAudio(config: {
    duration: number;
    sampleRate?: number;
    channels?: number;
  }): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ImageResult>;
}

interface ImageResult {
  outputPath: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

function image(): ImageBuilder;
```

### 5.10 Streaming

HLS, DASH, and live streaming output.

```typescript
interface HlsBuilder {
  input(path: string): this;
  /** Segment duration in seconds (default: 2) */
  segmentDuration(seconds: number): this;
  /** Maximum playlist entries (default: 5, 0 = unlimited) */
  listSize(count: number): this;
  /** Segment file naming pattern */
  segmentFilename(pattern: string): this;
  /** Segment format: 'mpegts' or 'fmp4' */
  segmentType(type: 'mpegts' | 'fmp4'): this;
  /** fMP4 init filename (default: 'init.mp4') */
  initFilename(name: string): this;
  /** Playlist type */
  playlistType(type: 'event' | 'vod'): this;
  /** AES-128 encryption */
  encrypt(config: {
    keyInfoFile?: string;
    key?: string;             // hex 16 bytes
    keyUrl?: string;
    iv?: string;              // hex 16 bytes
  }): this;
  /** Base URL prepended to each segment entry */
  baseUrl(url: string): this;
  /** HLS flags */
  flags(flags: Array<
    | 'single_file' | 'temp_file' | 'delete_segments'
    | 'round_durations' | 'discont_start' | 'omit_endlist'
    | 'split_by_time' | 'append_list' | 'program_date_time'
    | 'independent_segments' | 'iframes_only' | 'periodic_rekey'
  >): this;
  /** Multi-variant (adaptive) stream configs */
  variants(configs: Array<{
    videoBitrate: string;
    audioBitrate: string;
    resolution: { width: number; height: number };
    codec?: VideoCodec;
  }>): this;
  /** Video encoder settings */
  videoCodec(codec: VideoCodec): this;
  crf(value: number): this;
  /** Audio encoder settings */
  audioCodec(codec: AudioCodec): this;
  audioBitrate(bitrate: string): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<StreamResult>;
}

interface DashBuilder {
  input(path: string): this;
  /** Segment duration in seconds */
  segmentDuration(seconds: number): this;
  /** Adaptation sets */
  adaptationSets(sets: string): this;
  /** Init segment name */
  initSegName(name: string): this;
  /** Media segment name */
  mediaSegName(name: string): this;
  /** Use template */
  useTemplate(enabled?: boolean): this;
  /** Use timeline */
  useTimeline(enabled?: boolean): this;
  /** Single file mode */
  singleFile(enabled?: boolean): this;
  videoCodec(codec: VideoCodec): this;
  audioCodec(codec: AudioCodec): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<StreamResult>;
}

interface StreamResult {
  outputPath: string;
  /** List of generated segment files */
  segments?: string[];
}

function hls(): HlsBuilder;
function dash(): DashBuilder;

/** Push stream to RTMP/SRT endpoint */
function streamTo(config: {
  input: string;
  url: string;                // rtmp://..., srt://...
  protocol: 'rtmp' | 'srt' | 'udp';
  videoCodec?: VideoCodec;
  audioCodec?: AudioCodec;
  videoBitrate?: string;
  audioBitrate?: string;
  format?: string;            // 'flv' for RTMP, 'mpegts' for SRT/UDP
  options?: Record<string, string>;
}): ExportBuilder;
```

### 5.11 GIF

Animated GIF creation with palette optimization.

```typescript
interface GifBuilder {
  input(path: string): this;
  /** Output dimensions */
  size(dimensions: { width?: number; height?: number }): this;
  /** Frame rate (default: 10) */
  fps(rate: number): this;
  /** Trim */
  trimStart(timestamp: string | number): this;
  duration(seconds: number): this;
  /** Dithering algorithm */
  dither(method: 'bayer' | 'heckbert' | 'floyd_steinberg' | 'sierra2' | 'sierra2_4a' | 'none'): this;
  /** Palette mode */
  paletteMode(mode: 'full' | 'diff'): this;
  /** Max colors (2-256) */
  maxColors(count: number): this;
  /** Loop count (0 = infinite, -1 = no loop) */
  loop(count: number): this;
  /** Use 2-pass palette generation for quality */
  optimizePalette(enabled?: boolean): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<GifResult>;
}

interface GifResult {
  outputPath: string;
  sizeBytes: number;
  width: number;
  height: number;
  duration: number;
  frameCount: number;
}

function gif(): GifBuilder;
```

---

## 6. Filter Graph

Low-level filter graph builder for complex operations not covered by the operation builders.

```typescript
interface FilterNode {
  /** Filter name (e.g. 'scale', 'overlay', 'loudnorm') */
  name: string;
  /** Filter options as key-value pairs or positional args */
  options?: Record<string, string | number | boolean> | string;
  /** Input pad labels */
  inputs?: string[];
  /** Output pad labels */
  outputs?: string[];
}

interface FilterGraphBuilder {
  /** Add a video filter to a simple chain (-vf) */
  videoFilter(filter: string | FilterNode): this;
  /** Add an audio filter to a simple chain (-af) */
  audioFilter(filter: string | FilterNode): this;
  /** Build a complex filter graph (-filter_complex) */
  complex(graph: string | FilterNode[]): this;
  /** Named input mapping */
  input(index: number, label: string): this;
  /** Named output mapping */
  output(label: string, streamType: 'v' | 'a'): this;
  /** Build the filter string */
  toString(): string;
  /** Get as args array */
  toArgs(): string[];
}

/** Build a complex filter graph from nodes */
function filterGraph(): FilterGraphBuilder;

/**
 * Convenience: build a single filter string
 * e.g. filter('scale', { w: 1920, h: -2 }) => "scale=w=1920:h=-2"
 */
function filter(name: string, options?: Record<string, string | number | boolean>): string;

/** Chain multiple filters with commas */
function chain(...filters: string[]): string;
```

---

## 7. Presets

Pre-configured encoding profiles.

```typescript
interface PresetConfig {
  video: EncoderConfig;
  audio: AudioEncoderConfig;
  format: ContainerFormat;
  faststart: boolean;
  metadata?: Record<string, string>;
}

/** YouTube export presets */
const YOUTUBE_PRESETS: {
  youtube_hd: PresetConfig;       // 1080p, CRF 18, AAC 192k
  youtube_4k: PresetConfig;       // 2160p, CRF 16, AAC 320k
  youtube_shorts: PresetConfig;   // 1080x1920, CRF 20, AAC 192k
  youtube_draft: PresetConfig;    // 1080p, CRF 28, ultrafast
};

/** Social media presets */
const SOCIAL_PRESETS: {
  twitter: PresetConfig;          // 1280x720, CRF 23, AAC 128k
  instagram: PresetConfig;        // 1080x1080, CRF 22, AAC 128k
  tiktok: PresetConfig;           // 1080x1920, CRF 22, AAC 128k
};

/** Quality tier presets (CPU) */
const QUALITY_PRESETS: Record<QualityTier, EncoderConfig>;

/** Quality tier presets (NVENC) */
const QUALITY_PRESETS_NVENC: Record<QualityTier, EncoderConfig>;

/** Quality tier presets (AV1 / SVT-AV1) */
const QUALITY_PRESETS_AV1: Record<QualityTier, EncoderConfig>;
```

---

## 8. Types & Enums

Shared type definitions.

```typescript
type PixelFormat =
  | 'yuv420p' | 'yuv422p' | 'yuv444p'
  | 'yuv420p10le' | 'yuv422p10le' | 'yuv444p10le'
  | 'yuv420p12le'
  | 'nv12' | 'nv21'
  | 'rgb24' | 'bgr24' | 'rgba' | 'bgra'
  | 'gray' | 'gray10le'
  | 'gbrp' | 'gbrp10le';

type FFmpegLogLevel =
  | 'quiet' | 'panic' | 'fatal' | 'error'
  | 'warning' | 'info' | 'verbose' | 'debug' | 'trace';

type Timestamp = number | string;
// number = seconds (e.g. 90.5)
// string = "HH:MM:SS.ms" | "MM:SS.ms" | "50%" (percentage of duration)

/** Color specification (same formats FFmpeg accepts) */
type Color = string;
// "red", "blue", "#FF0000", "0xFF0000", "red@0.5" (with alpha)
```

---

## 9. Error Handling

Structured error types for different failure modes.

```typescript
enum FFmpegErrorCode {
  /** ffmpeg/ffprobe binary not found in PATH */
  BINARY_NOT_FOUND = 'BINARY_NOT_FOUND',
  /** Input file does not exist or is not readable */
  INPUT_NOT_FOUND = 'INPUT_NOT_FOUND',
  /** Input file is corrupt or unsupported format */
  INVALID_INPUT = 'INVALID_INPUT',
  /** Encoding failed (codec error, unsupported options, etc.) */
  ENCODING_FAILED = 'ENCODING_FAILED',
  /** Operation timed out */
  TIMEOUT = 'TIMEOUT',
  /** Filter graph error (invalid filter, bad connections) */
  FILTER_ERROR = 'FILTER_ERROR',
  /** Hardware acceleration not available or failed */
  HWACCEL_ERROR = 'HWACCEL_ERROR',
  /** Output path not writable or disk full */
  OUTPUT_ERROR = 'OUTPUT_ERROR',
  /** Operation was cancelled via AbortSignal */
  CANCELLED = 'CANCELLED',
  /** NVENC session limit exceeded */
  SESSION_LIMIT = 'SESSION_LIMIT',
  /** Codec/encoder not available in this build */
  CODEC_NOT_AVAILABLE = 'CODEC_NOT_AVAILABLE',
  /** Permission denied */
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  /** Unknown/uncategorized error */
  UNKNOWN = 'UNKNOWN',
}

class FFmpegError extends Error {
  code: FFmpegErrorCode;
  /** Full stderr output from FFmpeg */
  stderr: string;
  /** The FFmpeg command that was executed */
  command: string[];
  /** Exit code from the process */
  exitCode: number;
}
```

---

## 10. Events & Progress

Real-time progress tracking for long-running operations.

```typescript
interface ProgressInfo {
  /** Current frame being processed */
  frame: number;
  /** Processing speed in fps */
  fps: number;
  /** Current bitrate of output */
  bitrate: string;
  /** Total output size so far */
  totalSize: number;
  /** Current processing time position */
  time: number;
  /** Processing speed relative to realtime (e.g. 2.5x) */
  speed: number;
  /** Percentage complete (0-100), null if duration unknown */
  percent: number | null;
  /** Estimated time remaining in seconds, null if unknown */
  eta: number | null;
}

/** Progress callback type */
type OnProgress = (progress: ProgressInfo) => void;
```

---

## Namespace Export

The SDK exports a single namespace for clean API usage:

```typescript
import { ffmpeg } from '@ffmpeg-sdk/core';

// Probe
const info = await ffmpeg.probe('/path/to/video.mp4');

// Operations (all return fluent builders)
await ffmpeg.extract().input('...').timestamp('50%').output('...').execute();
await ffmpeg.transform().input('...').scale({ width: 1920 }).output('...').execute();
await ffmpeg.audio().input('...').normalize({ targetLufs: -14 }).output('...').execute();
await ffmpeg.concat().addClip('...').addClip('...').output('...').execute();
await ffmpeg.exportVideo().videoInput('...').preset('youtube_hd').output('...').execute();
await ffmpeg.overlay().base('...').addOverlay({ input: '...' }).output('...').execute();
await ffmpeg.text().input('...').addText({ text: 'Hello', style: { ... } }).output('...').execute();
await ffmpeg.subtitle().input('...').hardBurn({ path: '...' }).output('...').execute();
await ffmpeg.image().input('...').convert('webp').output('...').execute();
await ffmpeg.hls().input('...').segmentDuration(4).output('...').execute();
await ffmpeg.gif().input('...').fps(15).size({ width: 480 }).output('...').execute();

// Low-level
await ffmpeg.execute(['-i', 'input.mp4', '-c', 'copy', 'output.mkv']);

// Hardware
const hw = await ffmpeg.detectHardware();

// Utilities
ffmpeg.parseTimecode('01:30:00.500'); // => 5400.5
await ffmpeg.validateInstallation();
```

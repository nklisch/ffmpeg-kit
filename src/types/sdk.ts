import type { PipelineBuilder } from "../convenience/pipeline.ts";
import type { InstallationInfo } from "../core/validate.ts";
import type { FilterGraphBuilder } from "../filters/graph.ts";
import type { HardwareCapabilities } from "../hardware/detect.ts";
import type { AudioBuilder } from "../operations/audio.ts";
import type { ConcatBuilder } from "../operations/concat.ts";
import type { ExportBuilder } from "../operations/export.ts";
import type { ExtractBuilder } from "../operations/extract.ts";
import type { GifBuilder } from "../operations/gif.ts";
import type { ImageBuilder } from "../operations/image.ts";
import type { OverlayBuilder } from "../operations/overlay.ts";
import type { DashBuilder, HlsBuilder } from "../operations/streaming.ts";
import type { SubtitleBuilder } from "../operations/subtitle.ts";
import type { TextBuilder } from "../operations/text.ts";
import type { TransformBuilder } from "../operations/transform.ts";
import type { FFmpegLogLevel } from "./base.ts";
import type { HwAccelMode } from "./codecs.ts";
import type { ExecuteOptions, ExecuteResult } from "./options.ts";
import type { AudioStreamInfo, ProbeResult, VideoStreamInfo } from "./probe.ts";
import type {
  BatchResult,
  EstimateResult,
  ExportResult,
  SilenceRange,
  SmartTranscodeResult,
  SplitSegment,
  ThumbnailSheetResult,
  TransformResult,
  WaveformResult,
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
  parseTimecode(timecode: string | number): number;

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
    input: string,
    output: string,
    options?: { quality?: import("./codecs.ts").QualityTier },
    executeOptions?: ExecuteOptions,
  ): Promise<ExportResult>;

  extractAudio(
    input: string,
    output: string,
    options?: { codec?: import("./codecs.ts").AudioCodec; bitrate?: string },
    executeOptions?: ExecuteOptions,
  ): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

  imageToVideo(
    input: string,
    output: string,
    options?: { duration?: number; fps?: number },
    executeOptions?: ExecuteOptions,
  ): Promise<{ outputPath: string; duration: number; sizeBytes: number }>;

  resize(
    input: string,
    output: string,
    options: { width?: number; height?: number },
    executeOptions?: ExecuteOptions,
  ): Promise<TransformResult>;
}

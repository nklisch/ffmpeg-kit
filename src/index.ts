// ffmpeg-kit — public API barrel export

// Args (for advanced users and operation builders)
export {
  buildBaseArgs,
  buildFilter,
  escapeFilterValue,
  flattenArgs,
} from "./core/args.ts";
export type { ExecuteConfig } from "./core/execute.ts";
// Core
export { execute, parseProgressLine } from "./core/execute.ts";
export type { ProbeConfig } from "./core/probe.ts";
export {
  clearProbeCache,
  getAudioStream,
  getDuration,
  getVideoStream,
  probe,
} from "./core/probe.ts";
export type { InstallationInfo } from "./core/validate.ts";
export { parseVersionString, validateInstallation } from "./core/validate.ts";
// Encoding
export type { CodecFamily, CodecMapping } from "./encoding/codecs.ts";
export {
  CODEC_REGISTRY,
  getCodecFamily,
  getCpuEncoder,
  getDefaultAudioCodec,
  getEncoderForMode,
} from "./encoding/codecs.ts";
export {
  audioEncoderConfigToArgs,
  buildEncoderConfig,
  encoderConfigToArgs,
} from "./encoding/config.ts";
export {
  ARCHIVE_PRESET,
  getPreset,
  getPresetNames,
  SOCIAL_PRESETS,
  WEB_PRESETS,
  YOUTUBE_PRESETS,
} from "./encoding/presets.ts";
// Hardware
export type { DetectConfig, HardwareCapabilities } from "./hardware/detect.ts";
export { clearHardwareCache, detectHardware } from "./hardware/detect.ts";
export type { FallbackOptions } from "./hardware/fallback.ts";
export { executeWithFallback } from "./hardware/fallback.ts";
export type { HwSession, SessionConfig } from "./hardware/session.ts";
export { acquireSession, withHwSession } from "./hardware/session.ts";
// Schemas
export {
  audioStreamInfoSchema,
  chapterInfoSchema,
  formatInfoSchema,
  probeResultSchema,
  rawProbeOutputSchema,
  streamDispositionSchema,
  streamInfoSchema,
  subtitleStreamInfoSchema,
  videoStreamInfoSchema,
} from "./schemas/probe.ts";
// Types
export type {
  AudioCodec,
  AudioEncoderConfig,
  AudioResult,
  AudioStreamInfo,
  BlendMode,
  ChapterInfo,
  Color,
  ConcatResult,
  ContainerFormat,
  CropConfig,
  DuckConfig,
  EasingFunction,
  EncoderConfig,
  EncodingPreset,
  ExecuteOptions,
  ExecuteResult,
  ExportPreset,
  ExportResult,
  // Results
  ExtractResult,
  FadeCurve,
  FFmpegLogLevel,
  FilterNode,
  FitMode,
  FormatInfo,
  GifResult,
  HwAccelMode,
  ImageResult,
  KenBurnsConfig,
  NamedPosition,
  NormalizeConfig,
  OnProgress,
  OperationResult,
  OverlayAnchor,
  OverlayPosition,
  OverlayResult,
  PixelFormat,
  Position,
  PresetConfig,
  // Probe
  ProbeResult,
  // Options & progress
  ProgressInfo,
  QualityTier,
  RateControlMode,
  ScaleAlgorithm,
  StreamDisposition,
  StreamInfo,
  StreamResult,
  SubtitleResult,
  SubtitleStreamInfo,
  TextResult,
  // Base
  Timestamp,
  TransformResult,
  // Filters & operation configs
  TransitionType,
  // Codecs & encoding
  VideoCodec,
  VideoStreamInfo,
} from "./types/index.ts";
// Value exports (runtime)
export { FFmpegError, FFmpegErrorCode } from "./types/index.ts";
export type { CacheOptions } from "./util/cache.ts";
export { Cache } from "./util/cache.ts";
export type { Logger, LogLevel } from "./util/logger.ts";
export { createLogger, noopLogger } from "./util/logger.ts";
export type { Platform } from "./util/platform.ts";
export { findExecutable, getPlatform, normalizePath } from "./util/platform.ts";
export type { TempFile, TempFileOptions } from "./util/tempfile.ts";
export { createTempFile, createTempFiles } from "./util/tempfile.ts";
// Utilities
export { parseTimecode } from "./util/timecode.ts";

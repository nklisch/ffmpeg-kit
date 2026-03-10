// ffmpeg-kit — public API barrel export

// ── SDK (primary entry point) ──
export type { FFmpegConfig, FFmpegSDK, BuilderDeps } from "./types/sdk.ts";
export { createFFmpeg, ffmpeg } from "./sdk.ts";

// ── Core types ──
export type { ExecuteOptions, ExecuteResult, ProgressInfo, OnProgress } from "./types/options.ts";
export type {
  ProbeResult,
  FormatInfo,
  VideoStreamInfo,
  AudioStreamInfo,
  StreamInfo,
  StreamDisposition,
  SubtitleStreamInfo,
  ChapterInfo,
} from "./types/probe.ts";
export type {
  AudioCodec,
  AudioEncoderConfig,
  ContainerFormat,
  EncoderConfig,
  EncodingPreset,
  ExportPreset,
  HwAccelMode,
  PixelFormat,
  PresetConfig,
  QualityTier,
  RateControlMode,
  SubtitleFormat,
  VideoCodec,
} from "./types/codecs.ts";
export type { Color, FFmpegLogLevel, Timestamp } from "./types/base.ts";
export type {
  AudioInputConfig,
  BlendMode,
  ClipConfig,
  CropConfig,
  DuckConfig,
  EasingFunction,
  FadeCurve,
  FilterNode,
  FitMode,
  KenBurnsConfig,
  NamedPosition,
  NormalizeConfig,
  OverlayAnchor,
  OverlayPosition,
  Position,
  ScaleAlgorithm,
  TransitionConfig,
  TransitionType,
} from "./types/filters.ts";
export type {
  AudioResult,
  BatchItemResult,
  BatchResult,
  ConcatResult,
  EstimateResult,
  ExportResult,
  ExtractResult,
  GifResult,
  ImageResult,
  OperationResult,
  OverlayResult,
  PipelineResult,
  SilenceRange,
  SmartTranscodeResult,
  SplitSegment,
  StreamResult,
  SubtitleResult,
  TextResult,
  ThumbnailSheetResult,
  TranscodeAction,
  TransformResult,
  WaveformResult,
} from "./types/results.ts";

// ── Builder interfaces (for typing, not construction) ──
export type { AudioBuilder } from "./operations/audio.ts";
export type { ConcatBuilder } from "./operations/concat.ts";
export type { ExportBuilder } from "./operations/export.ts";
export type { ExtractBuilder } from "./operations/extract.ts";
export type { DitherMethod, GifBuilder, PaletteMode } from "./operations/gif.ts";
export type {
  ImageBuilder,
  ImageOutputFormat,
  ImageSequenceConfig,
  SilentAudioConfig,
  SolidColorConfig,
  TestPatternConfig,
  ToVideoConfig,
} from "./operations/image.ts";
export type {
  OverlayBuilder,
  OverlayConfig,
  PipConfig,
  WatermarkConfig,
} from "./operations/overlay.ts";
export type {
  DashBuilder,
  HlsBuilder,
  HlsEncryptConfig,
  HlsFlag,
  HlsPlaylistType,
  HlsSegmentType,
  HlsVariantConfig,
} from "./operations/streaming.ts";
export type {
  ConvertSubConfig,
  ExtractSubConfig,
  HardBurnConfig,
  SoftSubConfig,
  SubtitleBuilder,
} from "./operations/subtitle.ts";
export type {
  CounterConfig,
  ScrollConfig,
  TextBuilder,
  TextConfig,
  TextStyle,
} from "./operations/text.ts";
export type { TransformBuilder } from "./operations/transform.ts";
export type { FilterGraphBuilder } from "./filters/graph.ts";
export type { PipelineBuilder } from "./convenience/pipeline.ts";

// ── Runtime values: errors ──
export { FFmpegError, FFmpegErrorCode } from "./types/errors.ts";

// ── Runtime values: schemas ──
export {
  audioStreamInfoSchema,
  chapterInfoSchema,
  formatInfoSchema,
  probeResultSchema,
  rawProbeOutputSchema,
  streamDispositionSchema,
  streamInfoSchema,
  videoStreamInfoSchema,
} from "./schemas/probe.ts";

// ── Runtime values: pure utilities (no ffmpeg needed) ──
export { parseTimecode } from "./util/timecode.ts";
export type { CacheOptions } from "./util/cache.ts";
export { Cache } from "./util/cache.ts";
export type { Logger, LogLevel } from "./util/logger.ts";
export { createLogger, noopLogger } from "./util/logger.ts";
export type { Platform } from "./util/platform.ts";
export { findExecutable, getPlatform, normalizePath } from "./util/platform.ts";
export type { TempFile, TempFileOptions } from "./util/tempfile.ts";
export { createTempFile, createTempFiles } from "./util/tempfile.ts";
export { parseBitrate, formatBytes } from "./convenience/estimate.ts";

// ── Runtime values: builder utilities ──
export { missingFieldError, wrapTryExecute, defaultDeps } from "./util/builder-helpers.ts";
export { buildBaseArgs, buildFilter, escapeFilterValue, flattenArgs } from "./core/args.ts";
export type { ExecuteConfig } from "./core/execute.ts";
export type { ProbeConfig } from "./core/probe.ts";
export type { InstallationInfo } from "./core/validate.ts";
export { parseVersionString } from "./core/validate.ts";

// ── Runtime values: filters (pure string builders) ──
export { filter, chain, filterGraph } from "./filters/graph.ts";
export {
  acrossfade,
  adelay,
  afade,
  afftdn,
  agate,
  alimiter,
  amix,
  acompressor,
  areverse,
  aresample,
  atempo,
  bass,
  equalizer,
  highpass,
  loudnorm,
  lowpass,
  silencedetect,
  treble,
  volume,
} from "./filters/audio.ts";
export { between, clamp, easing, enable, ifExpr, lerp, timeRange } from "./filters/helpers.ts";
export {
  chromakey,
  colorkey,
  crop as cropFilter,
  drawtext,
  format as formatFilter,
  fps,
  hflip,
  overlayFilter,
  pad,
  reverse as reverseFilter,
  scale as scaleFilter,
  setpts,
  transpose,
  vflip,
  xfade,
  zoompan,
} from "./filters/video.ts";

// ── Runtime values: encoding config (pure builders) ──
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

// ── Hardware types (for typing, not construction) ──
export type { DetectConfig, HardwareCapabilities } from "./hardware/detect.ts";
export type { FallbackOptions } from "./hardware/fallback.ts";
export type { HwSession, SessionConfig } from "./hardware/session.ts";

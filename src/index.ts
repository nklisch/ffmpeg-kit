// ffmpeg-kit — public API barrel export

export { formatBytes, parseBitrate } from "./convenience/estimate.ts";
export type { PipelineBuilder } from "./convenience/pipeline.ts";
export { buildBaseArgs, buildFilter, escapeFilterValue, flattenArgs } from "./core/args.ts";
export type { ExecuteConfig } from "./core/execute.ts";
export type { ProbeConfig } from "./core/probe.ts";
export type { InstallationInfo } from "./core/validate.ts";
export { parseVersionString } from "./core/validate.ts";
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
export {
  acompressor,
  acrossfade,
  adelay,
  afade,
  afftdn,
  agate,
  alimiter,
  amix,
  aresample,
  areverse,
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
export type { FilterGraphBuilder } from "./filters/graph.ts";
// ── Runtime values: filters (pure string builders) ──
export { chain, filter, filterGraph } from "./filters/graph.ts";
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
// ── Hardware types (for typing, not construction) ──
export type { DetectConfig, HardwareCapabilities } from "./hardware/detect.ts";
export type { FallbackOptions } from "./hardware/fallback.ts";
export type { HwSession, SessionConfig } from "./hardware/session.ts";
// ── Builder interfaces (for typing, not construction) ──
export type { AudioBuilder } from "./operations/audio/audio.ts";
export type { ExtractBuilder } from "./operations/image/extract.ts";
export type { DitherMethod, GifBuilder, PaletteMode } from "./operations/image/gif.ts";
export type {
  ImageBuilder,
  ImageOutputFormat,
  ImageSequenceConfig,
  SilentAudioConfig,
  SolidColorConfig,
  TestPatternConfig,
  ToVideoConfig,
} from "./operations/image/image.ts";
export type { ConcatBuilder } from "./operations/io/concat.ts";
export type { ExportBuilder } from "./operations/io/export.ts";
export type {
  OverlayBuilder,
  OverlayConfig,
  PipConfig,
  WatermarkConfig,
} from "./operations/video/overlay.ts";
export type {
  DashBuilder,
  HlsBuilder,
  HlsEncryptConfig,
  HlsFlag,
  HlsPlaylistType,
  HlsSegmentType,
  HlsVariantConfig,
} from "./operations/video/streaming.ts";
export type {
  ConvertSubConfig,
  ExtractSubConfig,
  HardBurnConfig,
  SoftSubConfig,
  SubtitleBuilder,
} from "./operations/video/subtitle.ts";
export type {
  CounterConfig,
  ScrollConfig,
  TextBuilder,
  TextConfig,
  TextStyle,
} from "./operations/video/text.ts";
export type { TransformBuilder } from "./operations/video/transform.ts";
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
export { createFFmpeg, ffmpeg } from "./sdk.ts";
export type { Color, FFmpegLogLevel, Timestamp } from "./types/base.ts";
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
// ── Runtime values: errors ──
export { FFmpegError, FFmpegErrorCode } from "./types/errors.ts";
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
// ── Core types ──
export type { ExecuteOptions, ExecuteResult, OnProgress, ProgressInfo } from "./types/options.ts";
export type {
  AudioStreamInfo,
  ChapterInfo,
  FormatInfo,
  ProbeResult,
  StreamDisposition,
  StreamInfo,
  SubtitleStreamInfo,
  VideoStreamInfo,
} from "./types/probe.ts";
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
// ── SDK (primary entry point) ──
export type { BuilderDeps, FFmpegConfig, FFmpegSDK } from "./types/sdk.ts";
// ── Runtime values: builder utilities ──
export { defaultDeps, missingFieldError, wrapTryExecute } from "./util/builder-helpers.ts";
export type { Cache, CacheOptions } from "./util/cache.ts";
export { createCache } from "./util/cache.ts";
export type { Logger, LogLevel } from "./util/logger.ts";
export { createLogger, noopLogger } from "./util/logger.ts";
export type { Platform } from "./util/platform.ts";
export { findExecutable, getPlatform, normalizePath } from "./util/platform.ts";
export type { TempFile, TempFileOptions } from "./util/tempfile.ts";
export { createTempFile, createTempFiles } from "./util/tempfile.ts";
// ── Runtime values: pure utilities (no ffmpeg needed) ──
export { parseTimecode } from "./util/timecode.ts";

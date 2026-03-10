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
export type { AudioBuilder } from "./operations/audio.ts";
export { audio } from "./operations/audio.ts";
export type { ConcatBuilder } from "./operations/concat.ts";
export { concat } from "./operations/concat.ts";
export type { ExportBuilder } from "./operations/export.ts";
export { exportVideo } from "./operations/export.ts";
export type { ExtractBuilder } from "./operations/extract.ts";
// Operations
export { extract } from "./operations/extract.ts";
export type {
  DitherMethod,
  GifBuilder,
  PaletteMode,
} from "./operations/gif.ts";
export { gif } from "./operations/gif.ts";
export type {
  ImageBuilder,
  ImageOutputFormat,
  ImageSequenceConfig,
  SilentAudioConfig,
  SolidColorConfig,
  TestPatternConfig,
  ToVideoConfig,
} from "./operations/image.ts";
export { image } from "./operations/image.ts";
export type {
  OverlayBuilder,
  OverlayConfig,
  PipConfig,
  WatermarkConfig,
} from "./operations/overlay.ts";
export { overlay } from "./operations/overlay.ts";
export type {
  DashBuilder,
  HlsBuilder,
  HlsEncryptConfig,
  HlsFlag,
  HlsPlaylistType,
  HlsSegmentType,
  HlsVariantConfig,
} from "./operations/streaming.ts";
export { dash, hls } from "./operations/streaming.ts";
export type {
  ConvertSubConfig,
  ExtractSubConfig,
  HardBurnConfig,
  SoftSubConfig,
  SubtitleBuilder,
} from "./operations/subtitle.ts";
export { subtitle } from "./operations/subtitle.ts";
export type {
  CounterConfig,
  ScrollConfig,
  TextBuilder,
  TextConfig,
  TextStyle,
} from "./operations/text.ts";
export { text } from "./operations/text.ts";
export type { TransformBuilder } from "./operations/transform.ts";
export { transform } from "./operations/transform.ts";
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
  AudioInputConfig,
  AudioResult,
  AudioStreamInfo,
  BlendMode,
  ChapterInfo,
  ClipConfig,
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
  SubtitleFormat,
  SubtitleResult,
  SubtitleStreamInfo,
  TextResult,
  // Base
  Timestamp,
  TransformResult,
  // Filters & operation configs
  TransitionConfig,
  TransitionType,
  // Codecs & encoding
  VideoCodec,
  VideoStreamInfo,
} from "./types/index.ts";
// Value exports (runtime)
export { FFmpegError, FFmpegErrorCode } from "./types/index.ts";
export {
  DEFAULT_AUDIO_CODEC_ARGS,
  DEFAULT_VIDEO_CODEC_ARGS,
  missingFieldError,
  wrapTryExecute,
} from "./util/builder-helpers.ts";
export type { CacheOptions } from "./util/cache.ts";
export { Cache } from "./util/cache.ts";
export type { Logger, LogLevel } from "./util/logger.ts";
export { createLogger, noopLogger } from "./util/logger.ts";
export type { Platform } from "./util/platform.ts";
export { findExecutable, getPlatform, normalizePath } from "./util/platform.ts";
export type { TempFile, TempFileOptions } from "./util/tempfile.ts";
export { createTempFile, createTempFiles } from "./util/tempfile.ts";
// Filters
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
  chain,
  filter,
  filterGraph,
} from "./filters/graph.ts";
export type { FilterGraphBuilder } from "./filters/graph.ts";
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
// Utilities
export { parseTimecode } from "./util/timecode.ts";

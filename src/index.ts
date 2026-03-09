// ffmpeg-kit — public API barrel export

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

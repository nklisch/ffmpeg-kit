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
  | { success: false; input: string; error: import("./errors.ts").FFmpegError };

/** Action taken for each stream in smart transcode */
export type TranscodeAction =
  | "copy_video"
  | "transcode_video"
  | "copy_audio"
  | "transcode_audio"
  | "copy_all"
  | "add_audio";

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
  /** Peak amplitude values */
  data: Float32Array;
  /** Total duration of input in seconds */
  duration: number;
}

/** A detected silence range */
export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

/** A segment produced by splitOnSilence */
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

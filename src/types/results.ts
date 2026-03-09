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

import type { FFmpegLogLevel } from "./base.ts";

export interface ProgressInfo {
  /** Current frame being processed */
  frame: number;
  /** Processing speed in fps */
  fps: number;
  /** Current bitrate of output */
  bitrate: string;
  /** Total output size so far in bytes */
  totalSize: number;
  /** Current processing time position in seconds */
  time: number;
  /** Processing speed relative to realtime (e.g. 2.5x) */
  speed: number;
  /** Percentage complete (0-100), null if duration unknown */
  percent: number | null;
  /** Estimated time remaining in seconds, null if unknown */
  eta: number | null;
}

export type OnProgress = (progress: ProgressInfo) => void;

export interface ExecuteOptions {
  /** Working directory for the process */
  cwd?: string;
  /** Timeout in milliseconds (default: 600_000 = 10 min) */
  timeout?: number;
  /** Callback for real-time progress updates */
  onProgress?: OnProgress;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Environment variables to pass to the process */
  env?: Record<string, string>;
  /** Log level for ffmpeg */
  logLevel?: FFmpegLogLevel;
  /** Overwrite output files without asking (-y). Default: true */
  overwrite?: boolean;
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Duration of the execution in milliseconds */
  durationMs: number;
}

/**
 * Timestamp: seconds as number, or string in "HH:MM:SS.ms", "MM:SS.ms", "SS.ms", or "50%" format.
 */
export type Timestamp = number | string;

/**
 * FFmpeg log level.
 */
export type FFmpegLogLevel =
  | "quiet"
  | "panic"
  | "fatal"
  | "error"
  | "warning"
  | "info"
  | "verbose"
  | "debug"
  | "trace";

/**
 * Color specification (same formats FFmpeg accepts).
 * "red", "blue", "#FF0000", "0xFF0000", "red@0.5" (with alpha)
 */
export type Color = string;

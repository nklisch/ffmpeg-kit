import { execute } from "../core/execute.ts";
import { getCpuEncoder } from "../encoding/codecs.ts";
import type { HwAccelMode } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions, ExecuteResult } from "../types/options.ts";
import type { Logger } from "../util/logger.ts";
import { noopLogger } from "../util/logger.ts";
import { acquireSession } from "./session.ts";

/** Options for fallback-aware execution */
export interface FallbackOptions {
  /** The desired hardware acceleration mode */
  hwAccel: HwAccelMode;
  /** Codec family for session selection */
  codec?: "h264" | "hevc" | "av1";
  /** Logger for fallback notifications */
  logger?: Logger;
  /** FFmpeg binary path */
  ffmpegPath?: string;
}

/** Error codes that should NOT trigger fallback — propagate immediately */
const NO_RETRY_CODES = new Set([
  FFmpegErrorCode.TIMEOUT,
  FFmpegErrorCode.CANCELLED,
  FFmpegErrorCode.INPUT_NOT_FOUND,
]);

/**
 * Execute an ffmpeg command with automatic hardware fallback.
 *
 * When hwAccel is "auto":
 * 1. Detect best available hardware mode
 * 2. Acquire a session and attempt hardware-accelerated encoding
 * 3. On HWACCEL_ERROR or ENCODING_FAILED, log and retry with CPU
 *
 * When hwAccel is explicit (e.g., "nvidia"):
 * 1. Attempt with that mode
 * 2. On failure, throw (no automatic fallback)
 *
 * When hwAccel is "cpu":
 * 1. Execute directly, no session management
 */
export async function executeWithFallback(
  buildArgs: (inputArgs: string[], encoder: string) => string[],
  options: FallbackOptions,
  executeOptions?: ExecuteOptions,
): Promise<ExecuteResult & { usedMode: HwAccelMode }> {
  const logger = options.logger ?? noopLogger;
  const codec = options.codec ?? "h264";
  const sessionConfig = { ffmpegPath: options.ffmpegPath };

  // CPU mode: no session management needed
  if (options.hwAccel === "cpu") {
    const cpuEncoder = getCpuEncoder(codec);
    const args = buildArgs([], cpuEncoder);
    const result = await execute(args, executeOptions, { ffmpegPath: options.ffmpegPath });
    return { ...result, usedMode: "cpu" };
  }

  // Explicit mode (non-auto, non-cpu): attempt with that mode, no fallback
  if (options.hwAccel !== "auto") {
    const session = await acquireSession(options.hwAccel, codec, sessionConfig);
    try {
      const args = buildArgs(session.inputArgs, session.encoder);
      const result = await execute(args, executeOptions, { ffmpegPath: options.ffmpegPath });
      return { ...result, usedMode: session.mode };
    } finally {
      session.release();
    }
  }

  // Auto mode: try hardware, fall back to CPU on hwaccel/encoding failure
  const hwSession = await acquireSession("auto", codec, sessionConfig);
  try {
    const hwArgs = buildArgs(hwSession.inputArgs, hwSession.encoder);
    const result = await execute(hwArgs, executeOptions, { ffmpegPath: options.ffmpegPath });
    return { ...result, usedMode: hwSession.mode };
  } catch (err) {
    // For auto mode: retry with CPU for any error EXCEPT timeout/cancel/input-not-found
    if (err instanceof FFmpegError) {
      if (NO_RETRY_CODES.has(err.code)) {
        hwSession.release();
        throw err;
      }
      // All other FFmpegErrors trigger CPU fallback in auto mode
      logger.warn("Hardware encoding failed, falling back to CPU", {
        mode: hwSession.mode,
        error: err.message,
      });
      hwSession.release();

      const cpuSession = await acquireSession("cpu", codec, sessionConfig);
      try {
        const cpuArgs = buildArgs(cpuSession.inputArgs, cpuSession.encoder);
        const result = await execute(cpuArgs, executeOptions, {
          ffmpegPath: options.ffmpegPath,
        });
        return { ...result, usedMode: "cpu" };
      } finally {
        cpuSession.release();
      }
    }
    hwSession.release();
    throw err;
  }
}

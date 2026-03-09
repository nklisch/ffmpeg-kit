import { spawn } from "node:child_process";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions, ExecuteResult, ProgressInfo } from "../types/options.ts";

/** Internal config for the ffmpeg binary path */
export interface ExecuteConfig {
  /** Path to ffmpeg binary. Default: "ffmpeg" (resolved from PATH) */
  ffmpegPath?: string;
}

/**
 * Parse a single progress line from ffmpeg's `-progress pipe:1` output.
 * Returns a partial ProgressInfo — caller accumulates fields across lines.
 */
export function parseProgressLine(
  line: string,
  totalDuration?: number,
): Partial<ProgressInfo> | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) return null;

  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();

  switch (key) {
    case "frame":
      return { frame: parseInt(val, 10) };
    case "fps":
      return { fps: parseFloat(val) };
    case "bitrate":
      return { bitrate: val };
    case "total_size":
      return { totalSize: parseInt(val, 10) };
    case "out_time_us": {
      const time = parseInt(val, 10) / 1_000_000;
      const result: Partial<ProgressInfo> = { time };
      if (totalDuration !== undefined && totalDuration > 0) {
        result.percent = Math.min(100, Math.max(0, (time / totalDuration) * 100));
      }
      return result;
    }
    case "speed": {
      const speed = parseFloat(val.replace(/x$/, ""));
      return { speed };
    }
    case "progress":
      // sentinel lines — not data fields
      return null;
    default:
      return null;
  }
}

function classifyError(stderr: string): FFmpegErrorCode {
  if (stderr.includes("No such file or directory") || stderr.includes("does not exist")) {
    return FFmpegErrorCode.INPUT_NOT_FOUND;
  }
  if (stderr.includes("Invalid data found") || stderr.includes("Invalid argument")) {
    return FFmpegErrorCode.INVALID_INPUT;
  }
  if (
    (stderr.includes("Encoder") && stderr.includes("not found")) ||
    stderr.includes("Unknown encoder")
  ) {
    return FFmpegErrorCode.CODEC_NOT_AVAILABLE;
  }
  if (stderr.includes("Permission denied")) {
    return FFmpegErrorCode.PERMISSION_DENIED;
  }
  if (
    stderr.includes("Error initializing") &&
    (stderr.includes("hwaccel") || stderr.includes("cuda") || stderr.includes("nvenc"))
  ) {
    return FFmpegErrorCode.HWACCEL_ERROR;
  }
  if (
    stderr.includes("No space left on device") ||
    (stderr.includes("could not open") && stderr.length > 0)
  ) {
    return FFmpegErrorCode.OUTPUT_ERROR;
  }
  return FFmpegErrorCode.ENCODING_FAILED;
}

/**
 * Execute an ffmpeg command with process management.
 *
 * Features:
 * - Spawns ffmpeg as a child process
 * - Parses `-progress pipe:1` output for real-time progress
 * - Supports timeout via options.timeout (default: 600_000ms)
 * - Supports cancellation via options.signal (AbortSignal)
 * - Adds `-y` (overwrite) by default unless options.overwrite is false
 * - Classifies exit codes into FFmpegErrorCode
 *
 * Throws FFmpegError on non-zero exit, timeout, or cancellation.
 */
export function execute(
  args: string[],
  options?: ExecuteOptions,
  config?: ExecuteConfig,
): Promise<ExecuteResult> {
  const ffmpegPath = config?.ffmpegPath ?? "ffmpeg";
  const timeout = options?.timeout ?? 600_000;
  const onProgress = options?.onProgress;
  const signal = options?.signal;

  // Build prefix args
  const prefixArgs: string[] = [];
  if (options?.overwrite !== false) {
    prefixArgs.push("-y");
  }
  prefixArgs.push("-loglevel", options?.logLevel ?? "error");
  if (onProgress !== undefined) {
    prefixArgs.push("-progress", "pipe:1", "-stats_period", "0.5");
  }

  const fullArgs = [...prefixArgs, ...args];
  const command = [ffmpegPath, ...fullArgs];

  const spawnOptions: Record<string, unknown> = {
    stdio: ["pipe", "pipe", "pipe"] as const,
  };
  if (options?.cwd !== undefined) spawnOptions.cwd = options.cwd;
  if (options?.env !== undefined) {
    spawnOptions.env = { ...process.env, ...options.env };
  }

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const proc = spawn(ffmpegPath, fullArgs, spawnOptions as Parameters<typeof spawn>[2]);

    let stdoutData = "";
    let stderrData = "";
    let progressAccum: Partial<ProgressInfo> = {};
    let killed = false;
    let killReason: "timeout" | "cancelled" | null = null;

    // Timeout
    const timeoutHandle = setTimeout(() => {
      killed = true;
      killReason = "timeout";
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!proc.killed) proc.kill("SIGKILL");
      }, 5000);
    }, timeout);

    // Cancellation
    const onAbort = () => {
      killed = true;
      killReason = "cancelled";
      proc.kill("SIGTERM");
    };
    if (signal !== undefined) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutData += text;

      if (onProgress !== undefined) {
        const lines = text.split("\n");
        for (const line of lines) {
          const parsed = parseProgressLine(line, options?.signal ? undefined : undefined);
          if (parsed !== null) {
            Object.assign(progressAccum, parsed);
          }
          // Emit on progress sentinel
          if (line.trim().startsWith("progress=")) {
            const info: ProgressInfo = {
              frame: progressAccum.frame ?? 0,
              fps: progressAccum.fps ?? 0,
              bitrate: progressAccum.bitrate ?? "N/A",
              totalSize: progressAccum.totalSize ?? 0,
              time: progressAccum.time ?? 0,
              speed: progressAccum.speed ?? 0,
              percent: progressAccum.percent ?? null,
              eta: progressAccum.eta ?? null,
            };
            onProgress(info);
            progressAccum = {};
          }
        }
      }
    });

    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    proc.on("close", (exitCode) => {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);

      const durationMs = Date.now() - startTime;

      if (killed) {
        reject(
          new FFmpegError({
            code: killReason === "timeout" ? FFmpegErrorCode.TIMEOUT : FFmpegErrorCode.CANCELLED,
            message:
              killReason === "timeout"
                ? `FFmpeg timed out after ${timeout}ms`
                : "FFmpeg was cancelled",
            stderr: stderrData,
            command,
            exitCode: exitCode ?? -1,
          }),
        );
        return;
      }

      const code = exitCode ?? 0;
      if (code !== 0) {
        reject(
          new FFmpegError({
            code: classifyError(stderrData),
            message: `FFmpeg exited with code ${code}`,
            stderr: stderrData,
            command,
            exitCode: code,
          }),
        );
        return;
      }

      resolve({
        stdout: stdoutData,
        stderr: stderrData,
        exitCode: 0,
        durationMs,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutHandle);
      signal?.removeEventListener("abort", onAbort);
      reject(
        new FFmpegError({
          code: FFmpegErrorCode.BINARY_NOT_FOUND,
          message: `Failed to spawn ffmpeg: ${err.message}`,
          stderr: stderrData,
          command,
          exitCode: -1,
          cause: err,
        }),
      );
    });
  });
}

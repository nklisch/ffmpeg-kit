import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import type { ZodSchema } from "zod";
import { probeResultSchema, rawProbeOutputSchema } from "../schemas/probe.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { AudioStreamInfo, ProbeResult, VideoStreamInfo } from "../types/probe.ts";
import { Cache } from "../util/cache.ts";

/** Internal config for the ffprobe binary path */
export interface ProbeConfig {
  /** Path to ffprobe binary. Default: "ffprobe" (resolved from PATH) */
  ffprobePath?: string;
  /** Cache options. Set to false to disable caching. */
  cache?:
    | {
        maxSize?: number;
        ttlMs?: number;
      }
    | false;
}

function zodParseOrThrow<T>(schema: ZodSchema<T>, data: unknown, label: string, command: string[]): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new FFmpegError({
      code: FFmpegErrorCode.INVALID_INPUT,
      message: `${label}: ${result.error.message}`,
      stderr: "",
      command,
      exitCode: 0,
    });
  }
  return result.data;
}

// Module-level singleton cache
let probeCache = new Cache<string, ProbeResult>({ maxSize: 100, ttlMs: 300_000 });

/** Clear the probe result cache. Used for testing or manual cache invalidation. */
export function clearProbeCache(): void {
  probeCache = new Cache<string, ProbeResult>({ maxSize: 100, ttlMs: 300_000 });
}

function spawnFfprobe(inputPath: string, ffprobePath: string): Promise<string> {
  const args = [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    "-show_chapters",
    inputPath,
  ];

  return new Promise((resolve: (value: string) => void, reject) => {
    const proc = spawn(ffprobePath, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (exitCode) => {
      if (exitCode !== 0) {
        if (
          stderr.includes("No such file or directory") ||
          stderr.includes("does not exist") ||
          stderr.includes("No such file")
        ) {
          reject(
            new FFmpegError({
              code: FFmpegErrorCode.INPUT_NOT_FOUND,
              message: `File not found: ${inputPath}`,
              stderr,
              command: [ffprobePath, ...args],
              exitCode: exitCode ?? -1,
            }),
          );
        } else {
          reject(
            new FFmpegError({
              code: FFmpegErrorCode.INVALID_INPUT,
              message: `ffprobe failed with code ${exitCode}`,
              stderr,
              command: [ffprobePath, ...args],
              exitCode: exitCode ?? -1,
            }),
          );
        }
        return;
      }
      resolve(stdout);
    });

    proc.on("error", (err) => {
      reject(
        new FFmpegError({
          code: FFmpegErrorCode.BINARY_NOT_FOUND,
          message: `Failed to spawn ffprobe: ${err.message}`,
          stderr: "",
          command: [ffprobePath, ...args],
          exitCode: -1,
          cause: err,
        }),
      );
    });
  });
}

/**
 * Probe a media file using ffprobe.
 *
 * - Runs ffprobe with JSON output
 * - Validates output through probeResultSchema (Zod)
 * - Caches results by (absolutePath, mtime) — cache hit skips ffprobe spawn
 * - Throws FFmpegError on failure
 */
export async function probe(
  inputPath: string,
  options?: { noCache?: boolean },
  config?: ProbeConfig,
): Promise<ProbeResult> {
  const ffprobePath = config?.ffprobePath ?? "ffprobe";
  const cacheDisabled = config?.cache === false;
  const absolutePath = resolve(inputPath);

  // Build cache key
  let cacheKey: string | null = null;
  if (!cacheDisabled) {
    try {
      const stat = statSync(absolutePath);
      cacheKey = `${absolutePath}:${stat.mtimeMs}`;
    } catch {
      // File doesn't exist — will fail at probe time
    }
  }

  // Check cache
  if (cacheKey !== null && options?.noCache !== true) {
    const cached = probeCache.get(cacheKey);
    if (cached !== undefined) return cached;
  }

  const stdout = await spawnFfprobe(absolutePath, ffprobePath);

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(stdout);
  } catch (err) {
    throw new FFmpegError({
      code: FFmpegErrorCode.INVALID_INPUT,
      message: "Failed to parse ffprobe JSON output",
      stderr: "",
      command: [ffprobePath, absolutePath],
      exitCode: 0,
      cause: err instanceof Error ? err : undefined,
    });
  }

  // Validate raw structure, then parse into ProbeResult
  const cmd = [ffprobePath, absolutePath];
  zodParseOrThrow(rawProbeOutputSchema, rawJson, "ffprobe output validation failed", cmd);
  const probeResult = zodParseOrThrow(probeResultSchema, rawJson, "ffprobe result parsing failed", cmd);

  // Store in cache
  if (!cacheDisabled && cacheKey !== null) {
    probeCache.set(cacheKey, probeResult);
  }

  return probeResult;
}

/**
 * Quick duration query. Equivalent to `probe(path).then(r => r.format.duration)`.
 */
export async function getDuration(inputPath: string, config?: ProbeConfig): Promise<number> {
  const result = await probe(inputPath, undefined, config);
  return result.format.duration;
}

/**
 * Get the first video stream info, or null if none.
 */
export async function getVideoStream(
  inputPath: string,
  config?: ProbeConfig,
): Promise<VideoStreamInfo | null> {
  const result = await probe(inputPath, undefined, config);
  for (const stream of result.streams) {
    if (stream.type === "video") return stream as VideoStreamInfo;
  }
  return null;
}

/**
 * Get the first audio stream info, or null if none.
 */
export async function getAudioStream(
  inputPath: string,
  config?: ProbeConfig,
): Promise<AudioStreamInfo | null> {
  const result = await probe(inputPath, undefined, config);
  for (const stream of result.streams) {
    if (stream.type === "audio") return stream as AudioStreamInfo;
  }
  return null;
}

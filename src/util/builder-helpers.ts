import { statSync } from "node:fs";
import { probe } from "../core/probe.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult } from "../types/results.ts";
import type { ProbeResult } from "../types/probe.ts";

export function missingFieldError(field: string): FFmpegError {
  return new FFmpegError({
    code: FFmpegErrorCode.ENCODING_FAILED,
    message: `${field}() is required`,
    stderr: "",
    command: [],
    exitCode: 0,
  });
}

export function wrapTryExecute<T>(
  executeFn: (options?: ExecuteOptions) => Promise<T>,
): (options?: ExecuteOptions) => Promise<OperationResult<T>> {
  return async (options) => {
    try {
      const data = await executeFn(options);
      return { success: true, data };
    } catch (err) {
      if (err instanceof FFmpegError) {
        return { success: false, error: err };
      }
      throw err;
    }
  };
}

export const DEFAULT_VIDEO_CODEC_ARGS = [
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-crf",
  "23",
  "-pix_fmt",
  "yuv420p",
] as const;

export const DEFAULT_AUDIO_CODEC_ARGS = ["-c:a", "aac", "-b:a", "128k"] as const;

export interface BaseProbeInfo {
  outputPath: string;
  sizeBytes: number;
  duration: number;
  probeResult: ProbeResult;
}

export async function probeOutput(outputPath: string): Promise<BaseProbeInfo> {
  const fileStat = statSync(outputPath);
  const probeResult = await probe(outputPath, { noCache: true });
  const duration = probeResult.format.duration ?? 0;
  return { outputPath, sizeBytes: fileStat.size, duration, probeResult };
}

export function resolveDimensions(
  dims: { width?: number; height?: number } | undefined,
  autoValue = -2,
): { w: number; h: number } {
  if (!dims) return { w: autoValue, h: autoValue };
  return { w: dims.width ?? autoValue, h: dims.height ?? autoValue };
}

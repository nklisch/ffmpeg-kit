import { audio } from "../operations/audio/audio.ts";
import { image } from "../operations/image/image.ts";
import { exportVideo } from "../operations/io/export.ts";
import { transform } from "../operations/video/transform.ts";
import type { AudioCodec, QualityTier } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { ExportResult, TransformResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";

/** Container remux (no re-encoding) */
export async function remux(
  deps: BuilderDeps,
  input: string,
  output: string,
  executeOptions?: ExecuteOptions,
): Promise<ExportResult> {
  return exportVideo(deps)
    .input(input)
    .videoCodec("copy")
    .audioCodec("copy")
    .output(output)
    .execute(executeOptions);
}

/** Quick compress with quality tier */
export async function compress(
  deps: BuilderDeps,
  input: string,
  output: string,
  options?: { quality?: QualityTier },
  executeOptions?: ExecuteOptions,
): Promise<ExportResult> {
  return exportVideo(deps)
    .input(input)
    .qualityTier(options?.quality ?? "standard")
    .output(output)
    .execute(executeOptions);
}

/** Extract audio track from video */
export async function extractAudio(
  deps: BuilderDeps,
  input: string,
  output: string,
  options?: { codec?: AudioCodec; bitrate?: string },
  executeOptions?: ExecuteOptions,
): Promise<{ outputPath: string; duration: number; sizeBytes: number }> {
  const result = await audio(deps)
    .input(input)
    .extractAudio({ codec: options?.codec, bitrate: options?.bitrate })
    .output(output)
    .execute(executeOptions);
  return { outputPath: result.outputPath, duration: result.duration, sizeBytes: result.sizeBytes };
}

/** Create video from a still image */
export async function imageToVideo(
  deps: BuilderDeps,
  input: string,
  output: string,
  options?: { duration?: number; fps?: number },
  executeOptions?: ExecuteOptions,
): Promise<{ outputPath: string; duration: number; sizeBytes: number }> {
  const result = await image(deps)
    .input(input)
    .toVideo({ duration: options?.duration ?? 5, fps: options?.fps ?? 30 })
    .output(output)
    .execute(executeOptions);
  return {
    outputPath: result.outputPath,
    duration: options?.duration ?? 5,
    sizeBytes: result.sizeBytes,
  };
}

/** Resize video */
export async function resize(
  deps: BuilderDeps,
  input: string,
  output: string,
  options: { width?: number; height?: number },
  executeOptions?: ExecuteOptions,
): Promise<TransformResult> {
  return transform(deps)
    .input(input)
    .scale({ width: options.width, height: options.height })
    .output(output)
    .execute(executeOptions);
}

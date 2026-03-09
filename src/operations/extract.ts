import { statSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { getDuration, probe } from "../core/probe.ts";
import type { Timestamp } from "../types/base.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { VideoStreamInfo } from "../types/probe.ts";
import type { ExtractResult, OperationResult } from "../types/results.ts";
import { missingFieldError, wrapTryExecute } from "../util/builder-helpers.ts";
import { parseTimecode } from "../util/timecode.ts";

interface ExtractState {
  inputPath?: string;
  timestampValue?: Timestamp;
  dimensions?: { width?: number; height?: number };
  outputFormat?: "png" | "jpg" | "webp" | "bmp" | "tiff";
  qualityValue?: number;
  frameCount?: number;
  useThumbnail?: boolean;
  outputPath?: string;
}

function validateExtractState(
  state: ExtractState,
): asserts state is ExtractState & { inputPath: string; outputPath: string } {
  if (state.inputPath === undefined) throw missingFieldError("input");
  if (state.outputPath === undefined) throw missingFieldError("output");
}

function buildArgs(state: ExtractState, resolvedTimestamp?: number): string[] {
  const args: string[] = ["-y"];

  // -ss before -i for fast seeking (skip when thumbnail mode scans frames)
  if (resolvedTimestamp !== undefined && !state.useThumbnail) {
    args.push("-ss", String(resolvedTimestamp));
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers (toArgs/execute check input/output before calling buildArgs)
  args.push("-i", state.inputPath!);

  // Video filter chain: thumbnail first (needs to scan), then scale
  const vfilters: string[] = [];
  if (state.useThumbnail) {
    vfilters.push("thumbnail=300");
  }
  if (state.dimensions !== undefined) {
    const w = state.dimensions.width ?? -2;
    const h = state.dimensions.height ?? -2;
    vfilters.push(`scale=${w}:${h}`);
  }
  if (vfilters.length > 0) {
    args.push("-vf", vfilters.join(","));
  }

  // Codec (ffmpeg infers png from extension; others need explicit codec)
  if (state.outputFormat === "jpg") {
    args.push("-c:v", "mjpeg");
  } else if (state.outputFormat === "webp") {
    args.push("-c:v", "libwebp");
  } else if (state.outputFormat === "bmp") {
    args.push("-c:v", "bmp");
  } else if (state.outputFormat === "tiff") {
    args.push("-c:v", "tiff");
  }

  // Quality
  if (state.qualityValue !== undefined) {
    if (state.outputFormat === "jpg") {
      args.push("-q:v", String(state.qualityValue));
    } else if (state.outputFormat === "webp") {
      args.push("-quality", String(state.qualityValue));
    }
  }

  // Frame count (default 1)
  args.push("-frames:v", String(state.frameCount ?? 1));

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push(state.outputPath!);
  return args;
}

export interface ExtractBuilder {
  input(path: string): this;
  timestamp(position: string | number): this;
  size(dimensions: { width?: number; height?: number }): this;
  format(fmt: "png" | "jpg" | "webp" | "bmp" | "tiff"): this;
  quality(q: number): this;
  frames(count: number): this;
  thumbnail(enabled?: boolean): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ExtractResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ExtractResult>>;
}

export function extract(): ExtractBuilder {
  const state: ExtractState = {};

  const builder: ExtractBuilder = {
    input(path) {
      state.inputPath = path;
      return builder;
    },
    timestamp(position) {
      state.timestampValue = position;
      return builder;
    },
    size(dimensions) {
      state.dimensions = dimensions;
      return builder;
    },
    format(fmt) {
      state.outputFormat = fmt;
      return builder;
    },
    quality(q) {
      state.qualityValue = q;
      return builder;
    },
    frames(count) {
      state.frameCount = count;
      return builder;
    },
    thumbnail(enabled = true) {
      state.useThumbnail = enabled;
      return builder;
    },
    output(path) {
      state.outputPath = path;
      return builder;
    },

    toArgs() {
      validateExtractState(state);

      let resolvedTimestamp: number | undefined;
      if (state.timestampValue !== undefined) {
        const ts = state.timestampValue;
        if (typeof ts === "string" && ts.trim().endsWith("%")) {
          throw new FFmpegError({
            code: FFmpegErrorCode.ENCODING_FAILED,
            message: "Percentage timestamps cannot be resolved in toArgs() — use execute() instead",
            stderr: "",
            command: [],
            exitCode: 0,
          });
        }
        resolvedTimestamp = parseTimecode(ts);
      }

      return buildArgs(state, resolvedTimestamp);
    },

    async execute(options) {
      validateExtractState(state);

      let resolvedTimestamp: number | undefined;
      if (state.timestampValue !== undefined) {
        const ts = state.timestampValue;
        if (typeof ts === "string" && ts.trim().endsWith("%")) {
          const duration = await getDuration(state.inputPath);
          resolvedTimestamp = parseTimecode(ts, duration);
        } else {
          resolvedTimestamp = parseTimecode(ts);
        }
      }

      const args = buildArgs(state, resolvedTimestamp);
      await runFFmpeg(args, options);

      const result = await probe(state.outputPath, { noCache: true });
      const stat = statSync(state.outputPath);
      const videoStream = result.streams.find((s): s is VideoStreamInfo => s.type === "video");

      return {
        outputPath: state.outputPath,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        format: result.format.formatName,
        sizeBytes: stat.size,
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

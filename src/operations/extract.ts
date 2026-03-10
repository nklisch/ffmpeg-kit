import type { Timestamp } from "../types/base.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { VideoStreamInfo } from "../types/probe.ts";
import type { ExtractResult, OperationResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";
import { defaultDeps, missingFieldError, probeOutput, resolveDimensions, wrapTryExecute } from "../util/builder-helpers.ts";
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
    const { w, h } = resolveDimensions(state.dimensions);
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

export function extract(deps: BuilderDeps = defaultDeps): ExtractBuilder {
  const state: ExtractState = {};

  const builder: ExtractBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },
    timestamp(position) {
      state.timestampValue = position;
      return this;
    },
    size(dimensions) {
      state.dimensions = dimensions;
      return this;
    },
    format(fmt) {
      state.outputFormat = fmt;
      return this;
    },
    quality(q) {
      state.qualityValue = q;
      return this;
    },
    frames(count) {
      state.frameCount = count;
      return this;
    },
    thumbnail(enabled = true) {
      state.useThumbnail = enabled;
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
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
          const probeResult = await deps.probe(state.inputPath);
          const duration = probeResult.format.duration ?? 0;
          resolvedTimestamp = parseTimecode(ts, duration);
        } else {
          resolvedTimestamp = parseTimecode(ts);
        }
      }

      const args = buildArgs(state, resolvedTimestamp);
      await deps.execute(args, options);

      const { outputPath, sizeBytes, probeResult } = await probeOutput(state.outputPath, deps.probe);
      const videoStream = probeResult.streams.find((s): s is VideoStreamInfo => s.type === "video");

      return {
        outputPath,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        format: probeResult.format.formatName,
        sizeBytes,
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

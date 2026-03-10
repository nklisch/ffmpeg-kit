import { statSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { Timestamp } from "../types/base.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { VideoStreamInfo } from "../types/probe.ts";
import type { GifResult, OperationResult } from "../types/results.ts";
import { missingFieldError, wrapTryExecute } from "../util/builder-helpers.ts";
import { parseTimecode } from "../util/timecode.ts";

type DitherMethod = "bayer" | "heckbert" | "floyd_steinberg" | "sierra2" | "sierra2_4a" | "none";
type PaletteMode = "full" | "diff";

interface GifState {
  inputPath?: string;
  dimensions?: { width?: number; height?: number };
  fpsValue?: number;
  trimStartValue?: Timestamp;
  durationValue?: number;
  ditherMethod?: DitherMethod;
  paletteModeValue?: PaletteMode;
  maxColorsValue?: number;
  loopValue?: number;
  optimizePaletteEnabled?: boolean;
  outputPath?: string;
}

function validateGifState(
  state: GifState,
): asserts state is GifState & { inputPath: string; outputPath: string } {
  if (!state.inputPath) throw missingFieldError("input");
  if (!state.outputPath) throw missingFieldError("output");
}

function buildBaseFilter(state: GifState): string {
  const fps = state.fpsValue ?? 10;
  let filter = `fps=${fps}`;
  if (state.dimensions !== undefined) {
    const w = state.dimensions.width ?? -2;
    const h = state.dimensions.height ?? -2;
    filter += `,scale=${w}:${h}:flags=lanczos`;
  }
  return filter;
}

function buildArgs(state: GifState): string[] {
  const args: string[] = ["-y"];

  if (state.trimStartValue !== undefined) {
    args.push("-ss", String(parseTimecode(state.trimStartValue)));
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push("-i", state.inputPath!);

  if (state.durationValue !== undefined) {
    args.push("-t", String(state.durationValue));
  }

  if (state.optimizePaletteEnabled) {
    const baseFilter = buildBaseFilter(state);
    const maxColors = state.maxColorsValue ?? 256;
    const statsMode = state.paletteModeValue ?? "full";
    const dither = state.ditherMethod ?? "sierra2_4a";

    const filterComplex = [
      `[0:v]${baseFilter}[s]`,
      `[s]split[a][b]`,
      `[a]palettegen=max_colors=${maxColors}:stats_mode=${statsMode}[p]`,
      `[b][p]paletteuse=dither=${dither}`,
    ].join(";");

    args.push("-filter_complex", filterComplex);
  } else {
    args.push("-vf", buildBaseFilter(state));
  }

  if (state.loopValue !== undefined) {
    args.push("-loop", String(state.loopValue));
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push(state.outputPath!);
  return args;
}

export interface GifBuilder {
  input(path: string): this;
  size(dimensions: { width?: number; height?: number }): this;
  fps(rate: number): this;
  trimStart(timestamp: Timestamp): this;
  duration(seconds: number): this;
  dither(method: DitherMethod): this;
  paletteMode(mode: PaletteMode): this;
  maxColors(count: number): this;
  loop(count: number): this;
  optimizePalette(enabled?: boolean): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<GifResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<GifResult>>;
}

export type { DitherMethod, PaletteMode };

export function gif(): GifBuilder {
  const state: GifState = {};

  const builder: GifBuilder = {
    input(path) {
      state.inputPath = path;
      return builder;
    },
    size(dimensions) {
      state.dimensions = dimensions;
      return builder;
    },
    fps(rate) {
      state.fpsValue = rate;
      return builder;
    },
    trimStart(timestamp) {
      state.trimStartValue = timestamp;
      return builder;
    },
    duration(seconds) {
      state.durationValue = seconds;
      return builder;
    },
    dither(method) {
      state.ditherMethod = method;
      return builder;
    },
    paletteMode(mode) {
      state.paletteModeValue = mode;
      return builder;
    },
    maxColors(count) {
      state.maxColorsValue = count;
      return builder;
    },
    loop(count) {
      state.loopValue = count;
      return builder;
    },
    optimizePalette(enabled = true) {
      state.optimizePaletteEnabled = enabled;
      return builder;
    },
    output(path) {
      state.outputPath = path;
      return builder;
    },

    toArgs() {
      validateGifState(state);
      return buildArgs(state);
    },

    async execute(options) {
      validateGifState(state);
      const args = buildArgs(state);
      await runFFmpeg(args, options);

      const result = await probe(state.outputPath, { noCache: true });
      const stat = statSync(state.outputPath);
      const videoStream = result.streams.find((s): s is VideoStreamInfo => s.type === "video");
      const duration = result.format.duration ?? 0;
      const fps = state.fpsValue ?? 10;

      return {
        outputPath: state.outputPath,
        sizeBytes: stat.size,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        duration,
        frameCount: videoStream?.nbFrames ?? Math.round(duration * fps),
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

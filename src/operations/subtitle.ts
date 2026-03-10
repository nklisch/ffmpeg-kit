import { statSync } from "node:fs";
import { extname } from "node:path";
import { escapeSubtitlePath } from "../core/args.ts";
import { execute as runFFmpeg } from "../core/execute.ts";
import type { SubtitleFormat } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, SubtitleResult } from "../types/results.ts";
import {
  DEFAULT_VIDEO_CODEC_ARGS,
  missingFieldError,
  wrapTryExecute,
} from "../util/builder-helpers.ts";

// --- Config Types ---

export interface SoftSubConfig {
  path: string;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
}

export interface HardBurnConfig {
  path: string;
  forceStyle?: string;
  charEncoding?: string;
}

export interface ExtractSubConfig {
  streamIndex: number;
  format: SubtitleFormat;
}

export interface ConvertSubConfig {
  inputPath: string;
  outputFormat: SubtitleFormat;
}

// --- Internal State ---

type SubtitleMode =
  | { type: "softSub"; configs: SoftSubConfig[] }
  | { type: "hardBurn"; config: HardBurnConfig }
  | { type: "extract"; config: ExtractSubConfig }
  | { type: "convert"; config: ConvertSubConfig };

interface SubtitleState {
  inputPath?: string;
  mode?: SubtitleMode;
  outputPath?: string;
}

// --- Validation ---

function validateSubtitleState(
  state: SubtitleState,
): asserts state is SubtitleState & { outputPath: string; mode: SubtitleMode } {
  if (!state.inputPath && state.mode?.type !== "convert") throw missingFieldError("input");
  if (!state.mode) throw missingFieldError("softSub, hardBurn, extract, or convert");
  if (!state.outputPath) throw missingFieldError("output");
}

// --- Codec selection for soft sub based on output extension ---

function softSubCodec(outputPath: string, subPath: string): string {
  const ext = extname(outputPath).toLowerCase();
  if (ext === ".mp4" || ext === ".mov") return "mov_text";
  if (ext === ".mkv") {
    const subExt = extname(subPath).toLowerCase();
    if (subExt === ".ass" || subExt === ".ssa") return "ass";
    return "srt";
  }
  if (ext === ".webm") return "webvtt";
  return "copy";
}

// --- Arg building ---

function buildArgs(state: SubtitleState): string[] {
  const args: string[] = ["-y"];
  const mode = state.mode;

  if (!mode) throw missingFieldError("softSub, hardBurn, extract, or convert");

  if (mode.type === "softSub") {
    // biome-ignore lint/style/noNonNullAssertion: validated by callers
    args.push("-i", state.inputPath!);
    for (const sub of mode.configs) {
      args.push("-i", sub.path);
    }

    // Codec: use the first subtitle's path to determine codec
    const firstSub = mode.configs[0];
    // biome-ignore lint/style/noNonNullAssertion: softSub always has at least one config
    const codec = firstSub !== undefined ? softSubCodec(state.outputPath!, firstSub.path) : "copy";

    args.push("-c:v", "copy", "-c:a", "copy", "-c:s", codec);

    // Map streams
    args.push("-map", "0:v", "-map", "0:a");
    mode.configs.forEach((_, i) => {
      args.push("-map", `${i + 1}:s`);
    });

    // Metadata and disposition
    mode.configs.forEach((sub, i) => {
      if (sub.language !== undefined) {
        args.push(`-metadata:s:s:${i}`, `language=${sub.language}`);
      }
      if (sub.title !== undefined) {
        args.push(`-metadata:s:s:${i}`, `title=${sub.title}`);
      }
      if (sub.default === true) {
        args.push(`-disposition:s:${i}`, "default");
      }
      if (sub.forced === true) {
        args.push(`-disposition:s:${i}`, "forced");
      }
    });
  } else if (mode.type === "hardBurn") {
    const bitmapFormats: SubtitleFormat[] = ["dvbsub", "pgs"];
    const subExt = extname(mode.config.path).toLowerCase().slice(1) as SubtitleFormat;
    if (bitmapFormats.includes(subExt)) {
      throw new FFmpegError({
        code: FFmpegErrorCode.ENCODING_FAILED,
        message: "hardBurn does not support bitmap subtitle formats (dvbsub, pgs)",
        stderr: "",
        command: [],
        exitCode: 0,
      });
    }

    // biome-ignore lint/style/noNonNullAssertion: validated by callers
    args.push("-i", state.inputPath!);

    const escapedPath = escapeSubtitlePath(mode.config.path);
    let filterStr = `subtitles=${escapedPath}`;
    const filterOpts: string[] = [];
    if (mode.config.forceStyle !== undefined) {
      filterOpts.push(`force_style='${mode.config.forceStyle}'`);
    }
    if (mode.config.charEncoding !== undefined) {
      filterOpts.push(`charenc=${mode.config.charEncoding}`);
    }
    if (filterOpts.length > 0) {
      filterStr += `:${filterOpts.join(":")}`;
    }

    args.push("-vf", filterStr);
    args.push(...DEFAULT_VIDEO_CODEC_ARGS);
    args.push("-c:a", "copy");
  } else if (mode.type === "extract") {
    // biome-ignore lint/style/noNonNullAssertion: validated by callers
    args.push("-i", state.inputPath!);
    args.push("-map", `0:${mode.config.streamIndex}`);
    args.push("-c:s", mode.config.format);
  } else if (mode.type === "convert") {
    args.push("-i", mode.config.inputPath);
    args.push("-c:s", mode.config.outputFormat);
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push(state.outputPath!);
  return args;
}

// --- Builder Interface ---

export interface SubtitleBuilder {
  input(path: string): this;
  softSub(config: SoftSubConfig): this;
  hardBurn(config: HardBurnConfig): this;
  extract(config: ExtractSubConfig): this;
  convert(config: ConvertSubConfig): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<SubtitleResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<SubtitleResult>>;
}

export function subtitle(): SubtitleBuilder {
  const state: SubtitleState = {};

  const builder: SubtitleBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },
    softSub(config) {
      if (state.mode?.type === "softSub") {
        state.mode.configs.push(config);
      } else {
        state.mode = { type: "softSub", configs: [config] };
      }
      return this;
    },
    hardBurn(config) {
      state.mode = { type: "hardBurn", config };
      return this;
    },
    extract(config) {
      state.mode = { type: "extract", config };
      return this;
    },
    convert(config) {
      state.mode = { type: "convert", config };
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateSubtitleState(state);
      return buildArgs(state);
    },

    async execute(options) {
      validateSubtitleState(state);
      const args = buildArgs(state);
      await runFFmpeg(args, options);
      const stat = statSync(state.outputPath);
      return {
        outputPath: state.outputPath,
        sizeBytes: stat.size,
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

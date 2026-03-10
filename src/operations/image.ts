import { statSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { PixelFormat, VideoCodec } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { VideoStreamInfo } from "../types/probe.ts";
import type { ImageResult, OperationResult } from "../types/results.ts";
import {
  DEFAULT_AUDIO_CODEC_ARGS,
  DEFAULT_VIDEO_CODEC_ARGS,
  missingFieldError,
  resolveDimensions,
  wrapTryExecute,
} from "../util/builder-helpers.ts";

// --- Config Types ---

export type ImageOutputFormat = "png" | "jpg" | "webp" | "bmp" | "tiff" | "avif" | "jxl";

export interface ImageSequenceConfig {
  pattern: string;
  fps?: number;
  startNumber?: number;
  pixelFormat?: PixelFormat;
}

export interface ToVideoConfig {
  duration: number;
  fps?: number;
  codec?: VideoCodec;
}

export interface TestPatternConfig {
  type: "color" | "smptebars" | "testsrc" | "testsrc2" | "rgbtestsrc";
  width: number;
  height: number;
  duration: number;
  fps?: number;
}

export interface SolidColorConfig {
  color: string;
  width: number;
  height: number;
  duration: number;
}

export interface SilentAudioConfig {
  duration: number;
  sampleRate?: number;
  channels?: number;
}

// --- Internal State ---

interface ImageState {
  inputPath?: string;
  sequenceConfig?: ImageSequenceConfig;
  convertFormat?: ImageOutputFormat;
  resizeDimensions?: { width?: number; height?: number };
  toVideoConfig?: ToVideoConfig;
  testPatternConfig?: TestPatternConfig;
  solidColorConfig?: SolidColorConfig;
  silentAudioConfig?: SilentAudioConfig;
  outputPath?: string;
}

// --- Validation ---

function validateImageState(
  state: ImageState,
): asserts state is ImageState & { outputPath: string } {
  const needsInput =
    !state.testPatternConfig &&
    !state.solidColorConfig &&
    !state.silentAudioConfig &&
    !state.sequenceConfig;
  if (needsInput && !state.inputPath) throw missingFieldError("input");
  if (!state.outputPath) throw missingFieldError("output");
}

// --- Channel layout helper ---

function channelLayout(channels: number | undefined): string {
  if (channels === 1) return "mono";
  if (channels === 6) return "5.1";
  return "stereo";
}

// --- Arg building ---

function buildArgs(state: ImageState): string[] {
  const args: string[] = ["-y"];

  if (state.testPatternConfig !== undefined) {
    const tc = state.testPatternConfig;
    const fps = tc.fps ?? 25;
    let source: string;
    if (tc.type === "color") {
      source = `color=c=black:size=${tc.width}x${tc.height}:rate=${fps}:duration=${tc.duration}`;
    } else {
      source = `${tc.type}=size=${tc.width}x${tc.height}:rate=${fps}:duration=${tc.duration}`;
    }
    args.push("-f", "lavfi", "-i", source);
    args.push(...DEFAULT_VIDEO_CODEC_ARGS);
  } else if (state.solidColorConfig !== undefined) {
    const sc = state.solidColorConfig;
    const source = `color=c=${sc.color}:size=${sc.width}x${sc.height}:rate=25:duration=${sc.duration}`;
    args.push("-f", "lavfi", "-i", source);
    args.push(...DEFAULT_VIDEO_CODEC_ARGS);
  } else if (state.silentAudioConfig !== undefined) {
    const sa = state.silentAudioConfig;
    const sampleRate = sa.sampleRate ?? 48000;
    const layout = channelLayout(sa.channels);
    const source = `anullsrc=r=${sampleRate}:cl=${layout}`;
    args.push("-f", "lavfi", "-i", source);
    args.push("-t", String(sa.duration));
    args.push(...DEFAULT_AUDIO_CODEC_ARGS);
  } else if (state.sequenceConfig !== undefined) {
    const sc = state.sequenceConfig;
    const fps = sc.fps ?? 25;
    args.push("-framerate", String(fps));
    if (sc.startNumber !== undefined) {
      args.push("-start_number", String(sc.startNumber));
    }
    args.push("-i", sc.pattern);
    args.push(...DEFAULT_VIDEO_CODEC_ARGS);
    if (sc.pixelFormat !== undefined) {
      args.push("-pix_fmt", sc.pixelFormat);
    }
  } else if (state.toVideoConfig !== undefined) {
    const tv = state.toVideoConfig;
    args.push("-loop", "1");
    // biome-ignore lint/style/noNonNullAssertion: validated by callers
    args.push("-i", state.inputPath!);
    args.push("-t", String(tv.duration));
    if (tv.fps !== undefined) {
      args.push("-r", String(tv.fps));
    }
    const codec = tv.codec ?? "libx264";
    args.push("-c:v", codec, "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p");
    if (state.resizeDimensions !== undefined) {
      const { w, h } = resolveDimensions(state.resizeDimensions);
      args.push("-vf", `scale=${w}:${h}`);
    }
  } else {
    // standard, convert, or resize — all need an input
    // biome-ignore lint/style/noNonNullAssertion: validated by callers
    args.push("-i", state.inputPath!);

    const vfilters: string[] = [];
    if (state.resizeDimensions !== undefined) {
      const { w, h } = resolveDimensions(state.resizeDimensions);
      vfilters.push(`scale=${w}:${h}`);
    }
    if (vfilters.length > 0) {
      args.push("-vf", vfilters.join(","));
    }

    if (state.convertFormat === "jpg") {
      args.push("-c:v", "mjpeg");
    } else if (state.convertFormat === "webp") {
      args.push("-c:v", "libwebp");
    } else if (state.convertFormat === "avif") {
      args.push("-c:v", "libaom-av1", "-still-picture", "1");
    } else if (state.convertFormat === "jxl") {
      args.push("-c:v", "libjxl");
    }

    // Single image output unless explicitly doing sequences
    args.push("-frames:v", "1");
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push(state.outputPath!);
  return args;
}

// --- Builder Interface ---

export interface ImageBuilder {
  input(path: string): this;
  imageSequence(
    pattern: string,
    options?: { fps?: number; startNumber?: number; pixelFormat?: PixelFormat },
  ): this;
  convert(format: ImageOutputFormat): this;
  resize(dimensions: { width?: number; height?: number }): this;
  toVideo(config: ToVideoConfig): this;
  testPattern(config: TestPatternConfig): this;
  solidColor(config: SolidColorConfig): this;
  silentAudio(config: SilentAudioConfig): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ImageResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ImageResult>>;
}

export function image(): ImageBuilder {
  const state: ImageState = {};

  const builder: ImageBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },
    imageSequence(pattern, options) {
      state.sequenceConfig = { pattern, ...options };
      return this;
    },
    convert(format) {
      state.convertFormat = format;
      return this;
    },
    resize(dimensions) {
      state.resizeDimensions = dimensions;
      return this;
    },
    toVideo(config) {
      state.toVideoConfig = config;
      return this;
    },
    testPattern(config) {
      state.testPatternConfig = config;
      return this;
    },
    solidColor(config) {
      state.solidColorConfig = config;
      return this;
    },
    silentAudio(config) {
      state.silentAudioConfig = config;
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateImageState(state);
      return buildArgs(state);
    },

    async execute(options) {
      validateImageState(state);
      const args = buildArgs(state);
      await runFFmpeg(args, options);

      const stat = statSync(state.outputPath);

      // Try to probe for dimensions
      let width: number | undefined;
      let height: number | undefined;

      try {
        const probeResult = await probe(state.outputPath, { noCache: true });
        const videoStream = probeResult.streams.find(
          (s): s is VideoStreamInfo => s.type === "video",
        );
        if (videoStream !== undefined) {
          width = videoStream.width;
          height = videoStream.height;
        }
      } catch {
        // Silent audio or other non-video output may not probe successfully
      }

      return {
        outputPath: state.outputPath,
        sizeBytes: stat.size,
        width,
        height,
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

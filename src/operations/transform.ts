import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { HwAccelMode } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type {
  CropConfig,
  EasingFunction,
  FitMode,
  KenBurnsConfig,
  NamedPosition,
  Position,
  ScaleAlgorithm,
} from "../types/filters.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { VideoStreamInfo } from "../types/probe.ts";
import type { OperationResult, TransformResult } from "../types/results.ts";
import { buildAtempoChain } from "../util/audio-filters.ts";
import { DEFAULT_VIDEO_CODEC_ARGS, missingFieldError, probeOutput, resolveDimensions, wrapTryExecute } from "../util/builder-helpers.ts";
import { parseTimecode } from "../util/timecode.ts";

interface TransformState {
  inputPath?: string;
  scaleDimensions?: { width?: number; height?: number };
  fitMode?: FitMode;
  scaleAlgo?: ScaleAlgorithm;
  cropConfig?: CropConfig;
  kenBurnsConfig?: KenBurnsConfig;
  speedFactor?: number;
  isReversed?: boolean;
  trimStartValue?: string | number;
  trimEndValue?: string | number;
  durationValue?: number;
  loopCount?: number;
  fpsRate?: number;
  interpolateConfig?: { fps: number; method: "minterpolate" | "framerate" };
  padConfig?: { width: number; height: number; color: string };
  rotateDegrees?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  stabilizeConfig?: { shakiness?: number; accuracy?: number; smoothing?: number };
  outputDimensions?: { width: number; height: number };
  hwAccelMode?: HwAccelMode;
  outputPath?: string;
}

// --- Helper builders ---

function validateTransformState(
  state: TransformState,
): asserts state is TransformState & { inputPath: string; outputPath: string } {
  if (state.inputPath === undefined) throw missingFieldError("input");
  if (state.outputPath === undefined) throw missingFieldError("output");
  if (state.stabilizeConfig !== undefined) {
    throw new FFmpegError({
      code: FFmpegErrorCode.ENCODING_FAILED,
      message: "stabilize() is not yet implemented",
      stderr: "",
      command: [],
      exitCode: 0,
    });
  }
}

function resolvePosition(pos: Position | NamedPosition): { x: number; y: number } {
  if (typeof pos === "object") return pos;
  const map: Record<NamedPosition, { x: number; y: number }> = {
    center: { x: 0.5, y: 0.5 },
    "top-left": { x: 0, y: 0 },
    "top-right": { x: 1, y: 0 },
    "bottom-left": { x: 0, y: 1 },
    "bottom-right": { x: 1, y: 1 },
    "top-center": { x: 0.5, y: 0 },
    "bottom-center": { x: 0.5, y: 1 },
    "center-left": { x: 0, y: 0.5 },
    "center-right": { x: 1, y: 0.5 },
  };
  return map[pos];
}

// `d` is NOT an expression variable in zoompan — embed the literal frame count
// `on` = output frame number (0-indexed)
function buildEasingExpr(easing: EasingFunction, totalFrames: number): string {
  const t = `on/${totalFrames}`;
  switch (easing) {
    case "linear":
      return t;
    case "ease-in":
      return `(${t})*(${t})`;
    case "ease-out":
      return `(${t})*(2-${t})`;
    case "ease-in-out":
      return `if(lt(${t}\\,0.5)\\,2*(${t})*(${t})\\,-1+(4-2*(${t}))*(${t}))`;
  }
}

function buildKenBurnsFilter(config: KenBurnsConfig, width: number, height: number): string {
  const fps = config.fps ?? 30;
  const d = Math.round(config.duration * fps);
  const startPos = resolvePosition(config.startPosition);
  const endPos = resolvePosition(config.endPosition);
  const easing = config.easing ?? "linear";
  const t = buildEasingExpr(easing, d);

  const sz = config.startZoom;
  const ez = config.endZoom;
  const sx = startPos.x;
  const ex = endPos.x;
  const sy = startPos.y;
  const ey = endPos.y;

  const zExpr = ez === sz ? String(sz) : `${sz}+(${ez - sz})*(${t})`;

  // x,y in zoompan = top-left corner of the crop window in input pixel space
  // For normalized center (px,py): top-left = px*iw - iw/(2*zoom)
  const xCenterExpr = ex === sx ? `${sx}*iw` : `(${sx}+(${ex - sx})*(${t}))*iw`;
  const yCenterExpr = ey === sy ? `${sy}*ih` : `(${sy}+(${ey - sy})*(${t}))*ih`;

  const xExpr = `${xCenterExpr}-iw/(2*zoom)`;
  const yExpr = `${yCenterExpr}-ih/(2*zoom)`;

  return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${d}:s=${width}x${height}:fps=${fps}`;
}

function buildScaleFilters(state: TransformState): string[] {
  if (state.scaleDimensions === undefined) return [];

  const { w, h } = resolveDimensions(state.scaleDimensions);
  const flagsSuffix = state.scaleAlgo !== undefined ? `:flags=${state.scaleAlgo}` : "";
  const filters: string[] = [];

  switch (state.fitMode ?? "none") {
    case "none":
    case "fill":
      filters.push(`scale=${w}:${h}${flagsSuffix}`);
      break;
    case "contain":
      filters.push(`scale=${w}:${h}:force_original_aspect_ratio=decrease${flagsSuffix}`);
      filters.push(`pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`);
      break;
    case "cover":
      filters.push(`scale=${w}:${h}:force_original_aspect_ratio=increase${flagsSuffix}`);
      filters.push(`crop=${w}:${h}`);
      break;
  }

  return filters;
}

function buildCropFilter(config: CropConfig): string {
  if (config.detect === true) {
    throw new FFmpegError({
      code: FFmpegErrorCode.ENCODING_FAILED,
      message: "crop detect mode is not yet implemented",
      stderr: "",
      command: [],
      exitCode: 0,
    });
  }

  if (config.aspectRatio !== undefined) {
    const parts = config.aspectRatio.split(":");
    const arW = Number(parts[0]);
    const arH = Number(parts[1]);
    // Commas inside if() must be escaped as \, to avoid being parsed as filter separators
    const wExpr = `if(gte(a\\,${arW}/${arH})\\,ih*${arW}/${arH}\\,iw)`;
    const hExpr = `if(gte(a\\,${arW}/${arH})\\,ih\\,iw*${arH}/${arW})`;
    return `crop=${wExpr}:${hExpr}:(iw-out_w)/2:(ih-out_h)/2`;
  }

  if (config.width !== undefined || config.height !== undefined) {
    const w = config.width !== undefined ? String(config.width) : "iw";
    const h = config.height !== undefined ? String(config.height) : "ih";
    const x = config.x !== undefined ? String(config.x) : `(iw-${w})/2`;
    const y = config.y !== undefined ? String(config.y) : `(ih-${h})/2`;
    return `crop=${w}:${h}:${x}:${y}`;
  }

  throw new FFmpegError({
    code: FFmpegErrorCode.ENCODING_FAILED,
    message: "crop() requires aspectRatio or explicit width/height",
    stderr: "",
    command: [],
    exitCode: 0,
  });
}

function buildRotateFilters(degrees: number): string[] {
  switch (degrees) {
    case 90:
      return ["transpose=1"];
    case 180:
      return ["transpose=1", "transpose=1"];
    case 270:
      return ["transpose=2"];
    default:
      throw new FFmpegError({
        code: FFmpegErrorCode.ENCODING_FAILED,
        message: `Unsupported rotation angle: ${degrees}. Only 90, 180, 270 are supported.`,
        stderr: "",
        command: [],
        exitCode: 0,
      });
  }
}

function buildVideoFilters(
  state: TransformState,
  kenBurnsDimensions?: { width: number; height: number },
): string[] {
  // Ken Burns replaces the entire video filter chain
  if (state.kenBurnsConfig !== undefined) {
    const dims = kenBurnsDimensions ?? state.outputDimensions;
    if (dims === undefined) {
      throw new FFmpegError({
        code: FFmpegErrorCode.ENCODING_FAILED,
        message:
          "kenBurns() requires outputSize() or scale() with explicit dimensions in toArgs(). Use execute() for auto-detection from input.",
        stderr: "",
        command: [],
        exitCode: 0,
      });
    }
    return [buildKenBurnsFilter(state.kenBurnsConfig, dims.width, dims.height)];
  }

  const filters: string[] = [];

  // 1. Scale (with optional fit mode)
  filters.push(...buildScaleFilters(state));

  // 2. Explicit crop
  if (state.cropConfig !== undefined) {
    filters.push(buildCropFilter(state.cropConfig));
  }

  // 3. Explicit pad
  if (state.padConfig !== undefined) {
    const { width, height, color } = state.padConfig;
    filters.push(`pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:${color}`);
  }

  // 4. Flip
  if (state.flipHorizontal === true) filters.push("hflip");
  if (state.flipVertical === true) filters.push("vflip");

  // 5. Rotate
  if (state.rotateDegrees !== undefined) {
    filters.push(...buildRotateFilters(state.rotateDegrees));
  }

  // 6. Speed (setpts)
  if (state.speedFactor !== undefined) {
    filters.push(`setpts=PTS/${state.speedFactor}`);
  }

  // 7. Interpolate (mutually exclusive with fps typically)
  if (state.interpolateConfig !== undefined) {
    const { fps, method } = state.interpolateConfig;
    if (method === "minterpolate") {
      filters.push(`minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1`);
    } else {
      filters.push(`framerate=fps=${fps}`);
    }
  }

  // 8. FPS
  if (state.fpsRate !== undefined) {
    filters.push(`fps=${state.fpsRate}`);
  }

  // 9. Reverse
  if (state.isReversed === true) {
    filters.push("reverse");
  }

  return filters;
}

function buildAudioFilters(state: TransformState): string[] {
  const filters: string[] = [];

  if (state.speedFactor !== undefined) {
    filters.push(buildAtempoChain(state.speedFactor));
  }

  if (state.isReversed === true) {
    filters.push("areverse");
  }

  return filters;
}

function hasFilters(state: TransformState): boolean {
  return (
    state.kenBurnsConfig !== undefined ||
    state.scaleDimensions !== undefined ||
    state.outputDimensions !== undefined ||
    state.cropConfig !== undefined ||
    state.padConfig !== undefined ||
    state.flipHorizontal === true ||
    state.flipVertical === true ||
    state.rotateDegrees !== undefined ||
    state.speedFactor !== undefined ||
    state.fpsRate !== undefined ||
    state.interpolateConfig !== undefined ||
    state.isReversed === true
  );
}

interface ResolvedTrim {
  trimStartSeconds?: number;
  trimEndSeconds?: number;
}

function buildArgs(
  state: TransformState,
  resolved: ResolvedTrim = {},
  kenBurnsDimensions?: { width: number; height: number },
  addLoop?: boolean,
): string[] {
  const args: string[] = ["-y"];

  // -ss before -i for input-level seeking
  if (resolved.trimStartSeconds !== undefined) {
    args.push("-ss", String(resolved.trimStartSeconds));
  }

  // -stream_loop (before -i)
  if (state.loopCount !== undefined) {
    args.push("-stream_loop", String(state.loopCount - 1));
  }

  // -loop 1 for image inputs with Ken Burns
  if (addLoop === true) {
    args.push("-loop", "1");
  }

  // -i input
  // biome-ignore lint/style/noNonNullAssertion: validated by callers (toArgs/execute check input/output before calling buildArgs)
  args.push("-i", state.inputPath!);

  // Trim end / duration (after -i)
  if (state.durationValue !== undefined) {
    args.push("-t", String(state.durationValue));
  } else if (resolved.trimEndSeconds !== undefined) {
    args.push("-to", String(resolved.trimEndSeconds));
  }

  // Ken Burns duration (limit output to kenBurns duration)
  if (
    state.kenBurnsConfig !== undefined &&
    state.durationValue === undefined &&
    resolved.trimEndSeconds === undefined
  ) {
    args.push("-t", String(state.kenBurnsConfig.duration));
  }

  // Video filters
  const vfilters = buildVideoFilters(state, kenBurnsDimensions);
  if (vfilters.length > 0) {
    args.push("-vf", vfilters.join(","));
  }

  // Audio filters
  const afilters = buildAudioFilters(state);
  if (afilters.length > 0) {
    args.push("-af", afilters.join(","));
  }

  // Codec selection
  if (hasFilters(state) || vfilters.length > 0) {
    args.push(...DEFAULT_VIDEO_CODEC_ARGS);
  } else {
    args.push("-c", "copy");
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push(state.outputPath!);
  return args;
}

// --- Public interface ---

export interface TransformBuilder {
  input(path: string): this;
  scale(dimensions: { width?: number; height?: number }): this;
  fit(mode: FitMode): this;
  scaleAlgorithm(algo: ScaleAlgorithm): this;
  crop(config: CropConfig): this;
  kenBurns(config: KenBurnsConfig): this;
  speed(factor: number): this;
  reverse(): this;
  trimStart(timestamp: string | number): this;
  trimEnd(timestamp: string | number): this;
  duration(seconds: number): this;
  loop(count: number): this;
  fps(rate: number): this;
  interpolate(fps: number, method?: "minterpolate" | "framerate"): this;
  pad(dimensions: { width: number; height: number }, color?: string): this;
  rotate(degrees: number): this;
  flipH(): this;
  flipV(): this;
  stabilize(options?: { shakiness?: number; accuracy?: number; smoothing?: number }): this;
  outputSize(width: number, height: number): this;
  hwAccel(mode: HwAccelMode): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<TransformResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<TransformResult>>;
}

export function transform(): TransformBuilder {
  const state: TransformState = {};

  const builder: TransformBuilder = {
    input(path) {
      state.inputPath = path;
      return builder;
    },
    scale(dimensions) {
      state.scaleDimensions = dimensions;
      return builder;
    },
    fit(mode) {
      state.fitMode = mode;
      return builder;
    },
    scaleAlgorithm(algo) {
      state.scaleAlgo = algo;
      return builder;
    },
    crop(config) {
      state.cropConfig = config;
      return builder;
    },
    kenBurns(config) {
      state.kenBurnsConfig = config;
      return builder;
    },
    speed(factor) {
      state.speedFactor = factor;
      return builder;
    },
    reverse() {
      state.isReversed = true;
      return builder;
    },
    trimStart(timestamp) {
      state.trimStartValue = timestamp;
      return builder;
    },
    trimEnd(timestamp) {
      state.trimEndValue = timestamp;
      return builder;
    },
    duration(seconds) {
      state.durationValue = seconds;
      return builder;
    },
    loop(count) {
      state.loopCount = count;
      return builder;
    },
    fps(rate) {
      state.fpsRate = rate;
      return builder;
    },
    interpolate(fps, method = "minterpolate") {
      state.interpolateConfig = { fps, method };
      return builder;
    },
    pad(dimensions, color = "black") {
      state.padConfig = { width: dimensions.width, height: dimensions.height, color };
      return builder;
    },
    rotate(degrees) {
      state.rotateDegrees = degrees;
      return builder;
    },
    flipH() {
      state.flipHorizontal = true;
      return builder;
    },
    flipV() {
      state.flipVertical = true;
      return builder;
    },
    stabilize(options) {
      state.stabilizeConfig = options ?? {};
      return builder;
    },
    outputSize(width, height) {
      // Shorthand for scale() with both dimensions; also stored for Ken Burns s=
      state.scaleDimensions = { width, height };
      state.outputDimensions = { width, height };
      return builder;
    },
    hwAccel(mode) {
      state.hwAccelMode = mode;
      return builder;
    },
    output(path) {
      state.outputPath = path;
      return builder;
    },

    toArgs() {
      validateTransformState(state);

      const resolved: ResolvedTrim = {};
      if (state.trimStartValue !== undefined) {
        resolved.trimStartSeconds = parseTimecode(state.trimStartValue);
      }
      if (state.trimEndValue !== undefined && state.durationValue === undefined) {
        resolved.trimEndSeconds = parseTimecode(state.trimEndValue);
      }

      // For Ken Burns at toArgs() time, need dimensions
      let kenBurnsDimensions: { width: number; height: number } | undefined;
      if (state.kenBurnsConfig !== undefined) {
        const od = state.outputDimensions;
        const sd = state.scaleDimensions;
        const w = od?.width ?? sd?.width;
        const h = od?.height ?? sd?.height;
        if (w === undefined || h === undefined || w < 0 || h < 0) {
          throw new FFmpegError({
            code: FFmpegErrorCode.ENCODING_FAILED,
            message:
              "kenBurns() requires outputSize() or scale() with both explicit dimensions when calling toArgs(). Use execute() for automatic dimension detection.",
            stderr: "",
            command: [],
            exitCode: 0,
          });
        }
        kenBurnsDimensions = { width: w, height: h };
      }

      return buildArgs(state, resolved, kenBurnsDimensions);
    },

    async execute(options) {
      validateTransformState(state);

      const resolved: ResolvedTrim = {};
      if (state.trimStartValue !== undefined) {
        resolved.trimStartSeconds = parseTimecode(state.trimStartValue);
      }
      if (state.trimEndValue !== undefined && state.durationValue === undefined) {
        resolved.trimEndSeconds = parseTimecode(state.trimEndValue);
      }

      // Ken Burns: resolve dimensions from input if not explicitly set
      let kenBurnsDimensions: { width: number; height: number } | undefined;
      let addLoop = false;
      if (state.kenBurnsConfig !== undefined) {
        const od = state.outputDimensions;
        const sd = state.scaleDimensions;
        const w = od?.width ?? sd?.width;
        const h = od?.height ?? sd?.height;

        if (w !== undefined && h !== undefined && w > 0 && h > 0) {
          kenBurnsDimensions = { width: w, height: h };
        } else {
          // Probe input for dimensions
          const inputProbe = await probe(state.inputPath);
          const videoStream = inputProbe.streams.find(
            (s): s is VideoStreamInfo => s.type === "video",
          );
          if (videoStream !== undefined) {
            kenBurnsDimensions = { width: videoStream.width, height: videoStream.height };
          }
          // Detect image input (very short duration → single frame)
          if (inputProbe.format.duration < 0.1) {
            addLoop = true;
          }
        }

        // If explicitly setting scale dims, still check for image input
        if (!addLoop) {
          const inputProbe = await probe(state.inputPath);
          if (inputProbe.format.duration < 0.1) {
            addLoop = true;
          }
        }
      }

      const args = buildArgs(state, resolved, kenBurnsDimensions, addLoop);
      await runFFmpeg(args, options);

      const { outputPath, duration, sizeBytes, probeResult } = await probeOutput(state.outputPath);
      const videoStream = probeResult.streams.find((s): s is VideoStreamInfo => s.type === "video");

      return {
        outputPath,
        duration,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        sizeBytes,
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

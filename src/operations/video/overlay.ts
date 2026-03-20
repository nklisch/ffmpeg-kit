import { enable, timeRange } from "../../filters/helpers.ts";
import { FFmpegError, FFmpegErrorCode } from "../../types/errors.ts";
import type { BlendMode, OverlayAnchor, OverlayPosition } from "../../types/filters.ts";
import type { ExecuteOptions } from "../../types/options.ts";
import type { OperationResult, OverlayResult } from "../../types/results.ts";
import type { BuilderDeps } from "../../types/sdk.ts";
import {
  DEFAULT_AUDIO_CODEC_ARGS,
  DEFAULT_VIDEO_CODEC_ARGS,
  defaultDeps,
  missingFieldError,
  probeOutput,
  wrapTryExecute,
} from "../../util/builder-helpers.ts";

// --- Public Config Types ---

export interface OverlayConfig {
  input: string;
  position?: OverlayPosition;
  anchor?: OverlayAnchor;
  margin?: number | { x?: number; y?: number };
  scale?: { width?: number; height?: number };
  opacity?: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  blendMode?: BlendMode;
  chromaKey?: {
    color: string;
    similarity?: number;
    blend?: number;
  };
  colorKey?: {
    color: string;
    similarity?: number;
    blend?: number;
  };
}

export interface PipConfig {
  input: string;
  position: OverlayAnchor;
  scale: number;
  margin?: number;
  borderWidth?: number;
  borderColor?: string;
}

export interface WatermarkConfig {
  input: string;
  position: OverlayAnchor;
  opacity?: number;
  margin?: number;
  scale?: number;
}

// --- Internal State ---

/** Internal overlay entry that may carry extra properties for pip/watermark */
interface InternalOverlayEntry {
  input: string;
  position?: OverlayPosition;
  anchor?: OverlayAnchor;
  margin?: number | { x?: number; y?: number };
  /** Numeric pixel scale (from addOverlay) */
  scale?: { width?: number; height?: number };
  /** Expression-based scale string like "iw*0.3:ih*0.3" (from pip/watermark) */
  scaleExpr?: string;
  opacity?: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  blendMode?: BlendMode;
  chromaKey?: { color: string; similarity?: number; blend?: number };
  colorKey?: { color: string; similarity?: number; blend?: number };
  /** Border padding for pip (pixels) */
  borderWidth?: number;
  borderColor?: string;
}

interface OverlayState {
  basePath?: string;
  overlays: InternalOverlayEntry[];
  outputPath?: string;
}

// --- Builder Interface ---

export interface OverlayBuilder {
  base(path: string): this;
  addOverlay(config: OverlayConfig): this;
  pip(config: PipConfig): this;
  watermark(config: WatermarkConfig): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<OverlayResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<OverlayResult>>;
}

// --- Helpers ---

function validateOverlayState(
  state: OverlayState,
): asserts state is OverlayState & { basePath: string; outputPath: string } {
  if (!state.basePath) throw missingFieldError("base");
  if (state.overlays.length === 0) throw missingFieldError("addOverlay");
  if (!state.outputPath) throw missingFieldError("output");
}

function normalizeMargin(margin: InternalOverlayEntry["margin"]): { x: number; y: number } {
  if (margin === undefined) return { x: 0, y: 0 };
  if (typeof margin === "number") return { x: margin, y: margin };
  return { x: margin.x ?? 0, y: margin.y ?? 0 };
}

function anchorToPosition(
  anchor: OverlayAnchor,
  margin: { x: number; y: number },
): OverlayPosition {
  switch (anchor) {
    case "top-left":
      return { x: margin.x, y: margin.y };
    case "top-center":
      return { x: "(W-w)/2", y: margin.y };
    case "top-right":
      return { x: `W-w-${margin.x}`, y: margin.y };
    case "center-left":
      return { x: margin.x, y: "(H-h)/2" };
    case "center":
      return { x: "(W-w)/2", y: "(H-h)/2" };
    case "center-right":
      return { x: `W-w-${margin.x}`, y: "(H-h)/2" };
    case "bottom-left":
      return { x: margin.x, y: `H-h-${margin.y}` };
    case "bottom-center":
      return { x: "(W-w)/2", y: `H-h-${margin.y}` };
    case "bottom-right":
      return { x: `W-w-${margin.x}`, y: `H-h-${margin.y}` };
  }
}

function resolvePosition(entry: InternalOverlayEntry): OverlayPosition {
  if (entry.position !== undefined) {
    return entry.position;
  }
  const margin = normalizeMargin(entry.margin);
  if (entry.anchor !== undefined) {
    return anchorToPosition(entry.anchor, margin);
  }
  return { x: margin.x, y: margin.y };
}

function buildFilterComplex(
  state: OverlayState & { basePath: string; outputPath: string },
): string {
  const filterParts: string[] = [];
  let prevLabel = "0:v";

  for (let i = 0; i < state.overlays.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index within bounds
    const entry = state.overlays[i]!;
    const inputLabel = `${i + 1}:v`;
    const ovLabel = `ov${i}`;
    const stageLabel = i === state.overlays.length - 1 ? "vout" : `stage${i}`;

    const chainFilters: string[] = [];

    // Scale: expression-based (pip/watermark) or numeric
    if (entry.scaleExpr !== undefined) {
      chainFilters.push(`scale=${entry.scaleExpr}`);
    } else if (entry.scale !== undefined) {
      const w = entry.scale.width !== undefined ? String(entry.scale.width) : "-1";
      const h = entry.scale.height !== undefined ? String(entry.scale.height) : "-1";
      chainFilters.push(`scale=${w}:${h}`);
    }

    // Border padding (pip)
    if (entry.borderWidth !== undefined) {
      const bw = entry.borderWidth;
      const bc = entry.borderColor ?? "black";
      chainFilters.push(`pad=iw+${2 * bw}:ih+${2 * bw}:${bw}:${bw}:${bc}`);
    }

    // Chroma key
    if (entry.chromaKey !== undefined) {
      const { color, similarity = 0.01, blend = 0.0 } = entry.chromaKey;
      chainFilters.push(`chromakey=${color}:${similarity}:${blend}`);
    }

    // Color key
    if (entry.colorKey !== undefined) {
      const { color, similarity = 0.01, blend = 0.0 } = entry.colorKey;
      chainFilters.push(`colorkey=${color}:${similarity}:${blend}`);
    }

    // Blend mode (only 'normal' supported in v1)
    if (entry.blendMode !== undefined && entry.blendMode !== "normal") {
      throw new FFmpegError({
        code: FFmpegErrorCode.ENCODING_FAILED,
        message: `blendMode '${entry.blendMode}' is not supported — only 'normal' is supported in v1`,
        stderr: "",
        command: [],
        exitCode: 0,
      });
    }

    // Opacity
    if (entry.opacity !== undefined) {
      chainFilters.push("format=rgba", `colorchannelmixer=aa=${entry.opacity}`);
    }

    // Emit per-overlay filter chain
    if (chainFilters.length > 0) {
      filterParts.push(`[${inputLabel}]${chainFilters.join(",")}[${ovLabel}]`);
    } else {
      filterParts.push(`[${inputLabel}]null[${ovLabel}]`);
    }

    // Overlay filter with position
    const pos = resolvePosition(entry);
    const xVal = String(pos.x);
    const yVal = String(pos.y);
    let overlayFilter = `overlay=x=${xVal}:y=${yVal}`;

    // Time enable expression
    const startTime = entry.startTime;
    let endTime = entry.endTime;
    if (startTime !== undefined && entry.duration !== undefined) {
      endTime = startTime + entry.duration;
    }
    const expr = timeRange({ start: startTime, end: endTime });
    if (expr) {
      overlayFilter += `:${enable(expr)}`;
    }

    filterParts.push(`[${prevLabel}][${ovLabel}]${overlayFilter}[${stageLabel}]`);
    prevLabel = stageLabel;
  }

  return filterParts.join(";");
}

function buildOverlayArgs(
  state: OverlayState & { basePath: string; outputPath: string },
): string[] {
  const args: string[] = ["-y"];

  args.push("-i", state.basePath);
  for (const ov of state.overlays) {
    args.push("-i", ov.input);
  }

  args.push("-filter_complex", buildFilterComplex(state));
  args.push("-map", "[vout]", "-map", "0:a?");
  args.push(...DEFAULT_VIDEO_CODEC_ARGS);
  args.push(...DEFAULT_AUDIO_CODEC_ARGS);
  args.push(state.outputPath);

  return args;
}

// --- Factory ---

export function overlay(deps: BuilderDeps = defaultDeps): OverlayBuilder {
  const state: OverlayState = {
    overlays: [],
  };

  const builder: OverlayBuilder = {
    base(path) {
      state.basePath = path;
      return this;
    },

    addOverlay(config) {
      state.overlays.push({ ...config });
      return this;
    },

    pip(config) {
      const entry: InternalOverlayEntry = {
        input: config.input,
        anchor: config.position,
        margin: config.margin ?? 10,
        scaleExpr: `iw*${config.scale}:ih*${config.scale}`,
      };
      if (config.borderWidth !== undefined) {
        entry.borderWidth = config.borderWidth;
        entry.borderColor = config.borderColor ?? "black";
      }
      state.overlays.push(entry);
      return this;
    },

    watermark(config) {
      const entry: InternalOverlayEntry = {
        input: config.input,
        anchor: config.position,
        opacity: config.opacity ?? 0.5,
        margin: config.margin ?? 10,
      };
      if (config.scale !== undefined) {
        entry.scaleExpr = `iw*${config.scale}:ih*${config.scale}`;
      }
      state.overlays.push(entry);
      return this;
    },

    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateOverlayState(state);
      return buildOverlayArgs(state);
    },

    async execute(options) {
      validateOverlayState(state);
      await deps.execute(buildOverlayArgs(state), options);
      const { outputPath, duration, sizeBytes } = await probeOutput(state.outputPath, deps.probe);
      return { outputPath, duration, sizeBytes };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

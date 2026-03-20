import { escapeDrawtext } from "../../core/args.ts";
import { enable, timeRange } from "../../filters/helpers.ts";
import { FFmpegError, FFmpegErrorCode } from "../../types/errors.ts";
import type { OverlayAnchor } from "../../types/filters.ts";
import type { ExecuteOptions } from "../../types/options.ts";
import type { OperationResult, TextResult } from "../../types/results.ts";
import type { BuilderDeps } from "../../types/sdk.ts";
import {
  DEFAULT_VIDEO_CODEC_ARGS,
  defaultDeps,
  missingFieldError,
  probeOutput,
  wrapTryExecute,
} from "../../util/builder-helpers.ts";

// --- Public Config Types ---

export interface TextStyle {
  font?: string;
  fontFile?: string;
  fontSize?: number | string;
  fontColor?: string;
  fontColorExpr?: string;
  borderWidth?: number;
  borderColor?: string;
  shadowX?: number;
  shadowY?: number;
  shadowColor?: string;
  box?: boolean;
  boxColor?: string;
  boxBorderWidth?: number | string;
  textAlign?: "left" | "center" | "right";
  lineSpacing?: number;
  alpha?: number | string;
}

export interface TextConfig {
  text?: string;
  textFile?: string;
  reloadInterval?: number;
  x?: number | string;
  y?: number | string;
  anchor?: OverlayAnchor;
  margin?: number;
  style: TextStyle;
  startTime?: number;
  endTime?: number;
  timecode?: string;
  timecodeRate?: number;
  enable?: string;
}

export interface ScrollConfig {
  text: string;
  style: TextStyle;
  speed?: number;
  direction?: "up" | "down" | "left" | "right";
}

export interface CounterConfig {
  start: number;
  end: number;
  style: TextStyle;
  position: { x: number | string; y: number | string };
  format?: string;
}

// --- Internal State ---

interface TextState {
  inputPath?: string;
  textConfigs: TextConfig[];
  scrollConfig?: ScrollConfig;
  counterConfig?: CounterConfig;
  outputPath?: string;
}

// --- Builder Interface ---

export interface TextBuilder {
  input(path: string): this;
  addText(config: TextConfig): this;
  scroll(config: ScrollConfig): this;
  counter(config: CounterConfig): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<TextResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<TextResult>>;
}

// --- Helpers ---

function validateTextState(
  state: TextState,
): asserts state is TextState & { inputPath: string; outputPath: string } {
  if (!state.inputPath) throw missingFieldError("input");
  if (
    state.textConfigs.length === 0 &&
    state.scrollConfig === undefined &&
    state.counterConfig === undefined
  ) {
    throw missingFieldError("addText, scroll, or counter");
  }
  if (!state.outputPath) throw missingFieldError("output");
}

function anchorToDrawtextXY(anchor: OverlayAnchor, margin: number): { x: string; y: string } {
  switch (anchor) {
    case "top-left":
      return { x: String(margin), y: String(margin) };
    case "top-center":
      return { x: "(w-text_w)/2", y: String(margin) };
    case "top-right":
      return { x: `w-text_w-${margin}`, y: String(margin) };
    case "center-left":
      return { x: String(margin), y: "(h-text_h)/2" };
    case "center":
      return { x: "(w-text_w)/2", y: "(h-text_h)/2" };
    case "center-right":
      return { x: `w-text_w-${margin}`, y: "(h-text_h)/2" };
    case "bottom-left":
      return { x: String(margin), y: `h-text_h-${margin}` };
    case "bottom-center":
      return { x: "(w-text_w)/2", y: `h-text_h-${margin}` };
    case "bottom-right":
      return { x: `w-text_w-${margin}`, y: `h-text_h-${margin}` };
  }
}

function buildStyleParams(style: TextStyle): string[] {
  const params: string[] = [];

  if (style.font !== undefined) params.push(`fontfamily=${style.font}`);
  if (style.fontFile !== undefined) params.push(`fontfile=${style.fontFile}`);
  if (style.fontSize !== undefined) params.push(`fontsize=${style.fontSize}`);
  if (style.fontColor !== undefined) params.push(`fontcolor=${style.fontColor}`);
  if (style.fontColorExpr !== undefined) params.push(`fontcolor_expr=${style.fontColorExpr}`);
  if (style.borderWidth !== undefined) params.push(`borderw=${style.borderWidth}`);
  if (style.borderColor !== undefined) params.push(`bordercolor=${style.borderColor}`);
  if (style.shadowX !== undefined) params.push(`shadowx=${style.shadowX}`);
  if (style.shadowY !== undefined) params.push(`shadowy=${style.shadowY}`);
  if (style.shadowColor !== undefined) params.push(`shadowcolor=${style.shadowColor}`);
  if (style.box === true) params.push("box=1");
  if (style.boxColor !== undefined) params.push(`boxcolor=${style.boxColor}`);
  if (style.boxBorderWidth !== undefined) params.push(`boxborderw=${style.boxBorderWidth}`);
  if (style.lineSpacing !== undefined) params.push(`line_spacing=${style.lineSpacing}`);
  if (style.alpha !== undefined) params.push(`alpha=${style.alpha}`);

  return params;
}

function buildDrawtextFilter(config: TextConfig): string {
  const params: string[] = [];

  // Text source
  if (config.text !== undefined) {
    params.push(`text='${escapeDrawtext(config.text)}'`);
  } else if (config.textFile !== undefined) {
    params.push(`textfile='${config.textFile}'`);
    if (config.reloadInterval !== undefined) {
      params.push("reload=1");
    }
  }

  // Timecode
  if (config.timecode !== undefined) {
    params.push(`timecode='${config.timecode}'`);
    if (config.timecodeRate !== undefined) {
      params.push(`timecode_rate=${config.timecodeRate}`);
    }
  }

  // Position
  if (config.x !== undefined || config.y !== undefined) {
    if (config.x !== undefined) params.push(`x=${config.x}`);
    if (config.y !== undefined) params.push(`y=${config.y}`);
  } else if (config.anchor !== undefined) {
    const margin = config.margin ?? 10;
    const { x, y } = anchorToDrawtextXY(config.anchor, margin);
    params.push(`x=${x}`, `y=${y}`);
  } else {
    params.push("x=0", "y=0");
  }

  // Style
  params.push(...buildStyleParams(config.style));

  // Time range enable
  if (config.enable !== undefined) {
    params.push(`enable='${config.enable}'`);
  } else {
    const expr = timeRange({ start: config.startTime, end: config.endTime });
    if (expr) {
      params.push(enable(expr));
    }
  }

  return `drawtext=${params.join(":")}`;
}

function buildScrollFilter(config: ScrollConfig): string {
  const speed = config.speed ?? 100;
  const direction = config.direction ?? "up";
  const params: string[] = [];

  params.push(`text='${escapeDrawtext(config.text)}'`);

  switch (direction) {
    case "up":
      params.push("x=(w-text_w)/2", `y=h-t*${speed}`);
      break;
    case "down":
      params.push("x=(w-text_w)/2", `y=-text_h+t*${speed}`);
      break;
    case "left":
      params.push(`x=w-t*${speed}`, "y=(h-text_h)/2");
      break;
    case "right":
      params.push(`x=-text_w+t*${speed}`, "y=(h-text_h)/2");
      break;
  }

  params.push(...buildStyleParams(config.style));

  return `drawtext=${params.join(":")}`;
}

function buildCounterFilter(config: CounterConfig, duration: number): string {
  const { start, end, style, position } = config;
  const params: string[] = [];

  // Counter expression: linearly interpolate from start to end over video duration
  const counterExpr = `eif\\: ${start} + (t / ${duration}) * (${end} - ${start}) \\:d`;
  params.push(`text='%{${counterExpr}}'`);

  params.push(`x=${position.x}`, `y=${position.y}`);
  params.push(...buildStyleParams(style));

  return `drawtext=${params.join(":")}`;
}

function buildArgs(
  state: TextState & { inputPath: string; outputPath: string },
  resolvedDuration?: number,
): string[] {
  const filters: string[] = [];

  // Text configs
  for (const config of state.textConfigs) {
    filters.push(buildDrawtextFilter(config));
  }

  // Scroll
  if (state.scrollConfig !== undefined) {
    filters.push(buildScrollFilter(state.scrollConfig));
  }

  // Counter
  if (state.counterConfig !== undefined) {
    if (resolvedDuration === undefined) {
      throw new FFmpegError({
        code: FFmpegErrorCode.ENCODING_FAILED,
        message:
          "counter() requires execute() for duration probing — toArgs() cannot resolve video duration",
        stderr: "",
        command: [],
        exitCode: 0,
      });
    }
    filters.push(buildCounterFilter(state.counterConfig, resolvedDuration));
  }

  const args: string[] = [
    "-y",
    "-i",
    state.inputPath,
    "-vf",
    filters.join(","),
    ...DEFAULT_VIDEO_CODEC_ARGS,
    "-c:a",
    "copy",
    state.outputPath,
  ];

  return args;
}

// --- Factory ---

export function text(deps: BuilderDeps = defaultDeps): TextBuilder {
  const state: TextState = {
    textConfigs: [],
  };

  const builder: TextBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },

    addText(config) {
      state.textConfigs.push({ ...config });
      return this;
    },

    scroll(config) {
      state.scrollConfig = { ...config };
      return this;
    },

    counter(config) {
      state.counterConfig = { ...config };
      return this;
    },

    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateTextState(state);
      return buildArgs(state);
    },

    async execute(options) {
      validateTextState(state);

      let resolvedDuration: number | undefined;
      if (state.counterConfig !== undefined) {
        const inputProbe = await deps.probe(state.inputPath);
        resolvedDuration = inputProbe.format.duration ?? 0;
      }

      await deps.execute(buildArgs(state, resolvedDuration), options);
      const { outputPath, duration, sizeBytes } = await probeOutput(state.outputPath, deps.probe);
      return { outputPath, duration, sizeBytes };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

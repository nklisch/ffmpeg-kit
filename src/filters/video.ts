import { buildFilter, escapeFilterValue } from "../core/args.ts";
import type { FitMode, ScaleAlgorithm } from "../types/filters.ts";

/**
 * Build a scale filter string.
 * scale({ width: 1920 }) → "scale=1920:-2"
 * scale({ width: 1920, height: 1080 }) → "scale=1920:1080"
 * scale({ width: 1920 }, { fit: "contain" }) →
 *   "scale=1920:-2:force_original_aspect_ratio=decrease,pad=1920:ih:(ow-iw)/2:(oh-ih)/2"
 */
export function scale(
  dimensions: { width?: number; height?: number },
  options?: {
    fit?: FitMode;
    algorithm?: ScaleAlgorithm;
    /** Target dimensions for pad (contain mode) */
    padWidth?: number;
    padHeight?: number;
    padColor?: string;
  },
): string {
  const w = dimensions.width ?? -2;
  const h = dimensions.height ?? -2;
  const algoSuffix = options?.algorithm !== undefined ? `:flags=${options.algorithm}` : "";

  if (options?.fit === "contain") {
    const padW = options.padWidth ?? (dimensions.width !== undefined ? dimensions.width : "iw");
    const padH = options.padHeight ?? (dimensions.height !== undefined ? dimensions.height : "ih");
    const containScale = `scale=${w}:${h}:force_original_aspect_ratio=decrease${algoSuffix}`;
    const padStr =
      options.padColor !== undefined
        ? `pad=${padW}:${padH}:(ow-iw)/2:(oh-ih)/2:${options.padColor}`
        : `pad=${padW}:${padH}:(ow-iw)/2:(oh-ih)/2`;
    return `${containScale},${padStr}`;
  }

  if (options?.fit === "cover") {
    const cropW = options.padWidth ?? (dimensions.width !== undefined ? dimensions.width : "iw");
    const cropH = options.padHeight ?? (dimensions.height !== undefined ? dimensions.height : "ih");
    const coverScale = `scale=${w}:${h}:force_original_aspect_ratio=increase${algoSuffix}`;
    return `${coverScale},crop=${cropW}:${cropH}`;
  }

  return `scale=${w}:${h}${algoSuffix}`;
}

/**
 * Build a crop filter string.
 * crop({ width: 640, height: 480 }) → "crop=640:480"
 * crop({ aspectRatio: "16:9" }) → "crop=ih*16/9:ih"
 */
export function crop(config: {
  width?: number;
  height?: number;
  x?: number | string;
  y?: number | string;
  aspectRatio?: string;
}): string {
  if (config.aspectRatio !== undefined) {
    const [num, den] = config.aspectRatio.split(":");
    return `crop=ih*${num}/${den}:ih`;
  }

  const w = config.width ?? "iw";
  const h = config.height ?? "ih";

  if (config.x !== undefined || config.y !== undefined) {
    const x = config.x ?? 0;
    const y = config.y ?? 0;
    return `crop=${w}:${h}:${x}:${y}`;
  }

  return `crop=${w}:${h}`;
}

/**
 * Build an overlay filter string.
 * overlayFilter({ x: 10, y: 10 }) → "overlay=x=10:y=10"
 */
export function overlayFilter(config: {
  x?: number | string;
  y?: number | string;
  enable?: string;
  format?: "yuv420" | "yuv444" | "rgb" | "gbrp";
}): string {
  const opts: Record<string, string | number | boolean> = {};
  if (config.x !== undefined) opts.x = config.x;
  if (config.y !== undefined) opts.y = config.y;
  if (config.format !== undefined) opts.format = config.format;
  if (config.enable !== undefined) opts.enable = `'${config.enable}'`;
  return buildFilter("overlay", opts);
}

/**
 * Build a pad filter string.
 * pad({ width: 1920, height: 1080 }) → "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black"
 */
export function pad(config: {
  width: number | string;
  height: number | string;
  x?: number | string;
  y?: number | string;
  color?: string;
}): string {
  const x = config.x ?? "(ow-iw)/2";
  const y = config.y ?? "(oh-ih)/2";
  const color = config.color ?? "black";
  return `pad=${config.width}:${config.height}:${x}:${y}:${color}`;
}

/**
 * Build a drawtext filter string.
 * Handles escaping of text content and special characters.
 */
export function drawtext(config: {
  text?: string;
  textFile?: string;
  x?: number | string;
  y?: number | string;
  fontFile?: string;
  fontSize?: number | string;
  fontColor?: string;
  borderW?: number;
  borderColor?: string;
  shadowX?: number;
  shadowY?: number;
  shadowColor?: string;
  box?: boolean;
  boxColor?: string;
  boxBorderW?: number | string;
  alpha?: number | string;
  enable?: string;
  [key: string]: string | number | boolean | undefined;
}): string {
  const params: string[] = [];
  const handled = new Set([
    "text",
    "textFile",
    "x",
    "y",
    "fontFile",
    "fontSize",
    "fontColor",
    "borderW",
    "borderColor",
    "shadowX",
    "shadowY",
    "shadowColor",
    "box",
    "boxColor",
    "boxBorderW",
    "alpha",
    "enable",
  ]);

  if (config.text !== undefined) params.push(`text='${escapeFilterValue(config.text)}'`);
  if (config.textFile !== undefined) params.push(`textfile='${config.textFile}'`);
  if (config.x !== undefined) params.push(`x=${config.x}`);
  if (config.y !== undefined) params.push(`y=${config.y}`);
  if (config.fontFile !== undefined) params.push(`fontfile=${config.fontFile}`);
  if (config.fontSize !== undefined) params.push(`fontsize=${config.fontSize}`);
  if (config.fontColor !== undefined) params.push(`fontcolor=${config.fontColor}`);
  if (config.borderW !== undefined) params.push(`borderw=${config.borderW}`);
  if (config.borderColor !== undefined) params.push(`bordercolor=${config.borderColor}`);
  if (config.shadowX !== undefined) params.push(`shadowx=${config.shadowX}`);
  if (config.shadowY !== undefined) params.push(`shadowy=${config.shadowY}`);
  if (config.shadowColor !== undefined) params.push(`shadowcolor=${config.shadowColor}`);
  if (config.box !== undefined) params.push(`box=${config.box ? 1 : 0}`);
  if (config.boxColor !== undefined) params.push(`boxcolor=${config.boxColor}`);
  if (config.boxBorderW !== undefined) params.push(`boxborderw=${config.boxBorderW}`);
  if (config.alpha !== undefined) params.push(`alpha=${config.alpha}`);
  if (config.enable !== undefined) params.push(`enable='${config.enable}'`);

  // Pass through unknown keys
  for (const [key, val] of Object.entries(config)) {
    if (!handled.has(key) && val !== undefined) {
      params.push(`${key}=${val}`);
    }
  }

  return `drawtext=${params.join(":")}`;
}

/**
 * Build a setpts expression for speed change.
 * setpts(2) → "setpts=PTS/2" (2x speed)
 * setpts(0.5) → "setpts=PTS/0.5" (half speed)
 */
export function setpts(speedFactor: number): string {
  return `setpts=PTS/${speedFactor}`;
}

/**
 * Build a transpose filter for rotation.
 * transpose(90) → "transpose=1"
 * transpose(180) → "transpose=1,transpose=1"
 * transpose(270) → "transpose=2"
 */
export function transpose(degrees: 90 | 180 | 270): string {
  switch (degrees) {
    case 90:
      return "transpose=1";
    case 180:
      return "transpose=1,transpose=1";
    case 270:
      return "transpose=2";
  }
}

/**
 * Build an fps filter string.
 * fps(30) → "fps=30"
 */
export function fps(rate: number): string {
  return `fps=${rate}`;
}

/**
 * Build a zoompan filter string for Ken Burns effect.
 */
export function zoompan(config: {
  zoom: string;
  x: string;
  y: string;
  d: number;
  s: string;
  fps?: number;
}): string {
  const opts: Record<string, string | number | boolean> = {
    z: `'${config.zoom}'`,
    x: `'${config.x}'`,
    y: `'${config.y}'`,
    d: config.d,
    s: config.s,
  };
  if (config.fps !== undefined) opts.fps = config.fps;
  return buildFilter("zoompan", opts);
}

/**
 * Build an xfade transition filter string.
 */
export function xfade(config: {
  transition: string;
  duration: number;
  offset: number;
  expr?: string;
}): string {
  const opts: Record<string, string | number | boolean> = {
    transition: config.transition,
    duration: config.duration,
    offset: config.offset,
  };
  if (config.expr !== undefined) opts.expr = `'${config.expr}'`;
  return buildFilter("xfade", opts);
}

/** Common shorthand: "hflip" */
export function hflip(): string {
  return "hflip";
}

/** Common shorthand: "vflip" */
export function vflip(): string {
  return "vflip";
}

/** Common shorthand: "reverse" */
export function reverse(): string {
  return "reverse";
}

/** Build a format filter: format=pix_fmts=yuv420p */
export function format(pixFmt: string): string {
  return `format=pix_fmts=${pixFmt}`;
}

/** Build a chromakey filter */
export function chromakey(config: { color: string; similarity?: number; blend?: number }): string {
  const opts: Record<string, string | number | boolean> = { color: config.color };
  if (config.similarity !== undefined) opts.similarity = config.similarity;
  if (config.blend !== undefined) opts.blend = config.blend;
  return buildFilter("chromakey", opts);
}

/** Build a colorkey filter */
export function colorkey(config: { color: string; similarity?: number; blend?: number }): string {
  const opts: Record<string, string | number | boolean> = { color: config.color };
  if (config.similarity !== undefined) opts.similarity = config.similarity;
  if (config.blend !== undefined) opts.blend = config.blend;
  return buildFilter("colorkey", opts);
}

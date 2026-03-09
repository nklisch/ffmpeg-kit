// --- Transition ---

export type TransitionType =
  // Basic
  | "fade"
  | "fadeblack"
  | "fadewhite"
  | "dissolve"
  // Wipes
  | "wipeleft"
  | "wiperight"
  | "wipeup"
  | "wipedown"
  | "wipetl"
  | "wipetr"
  | "wipebl"
  | "wipebr"
  // Slides
  | "slideleft"
  | "slideright"
  | "slideup"
  | "slidedown"
  // Smooth
  | "smoothleft"
  | "smoothright"
  | "smoothup"
  | "smoothdown"
  // Covers
  | "coverleft"
  | "coverright"
  | "coverup"
  | "coverdown"
  // Reveals
  | "revealleft"
  | "revealright"
  | "revealup"
  | "revealdown"
  // Shapes
  | "circlecrop"
  | "rectcrop"
  | "circleopen"
  | "circleclose"
  | "vertopen"
  | "vertclose"
  | "horzopen"
  | "horzclose"
  // Effects
  | "pixelize"
  | "distance"
  | "fadegrays"
  | "hblur"
  | "zoomin"
  | "fadefast"
  | "fadeslow"
  | "radial"
  // Diagonals
  | "diagtl"
  | "diagtr"
  | "diagbl"
  | "diagbr"
  // Slices
  | "hlslice"
  | "hrslice"
  | "vuslice"
  | "vdslice"
  // Squeeze
  | "squeezeh"
  | "squeezev"
  // Wind
  | "hlwind"
  | "hrwind"
  | "vuwind"
  | "vdwind"
  // Custom expression
  | "custom";

export type FadeCurve =
  | "tri"
  | "qsin"
  | "esin"
  | "hsin"
  | "log"
  | "ipar"
  | "qua"
  | "cub"
  | "squ"
  | "cbr"
  | "par"
  | "exp"
  | "iqsin"
  | "ihsin"
  | "dese"
  | "desi"
  | "losi"
  | "sinc"
  | "isinc"
  | "nofade";

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "dodge"
  | "burn"
  | "hardlight"
  | "softlight"
  | "difference"
  | "exclusion"
  | "addition";

export type FitMode = "contain" | "cover" | "fill" | "none";

export type ScaleAlgorithm = "bilinear" | "bicubic" | "lanczos" | "spline" | "neighbor";

export type EasingFunction = "linear" | "ease-in" | "ease-out" | "ease-in-out";

// --- Position ---

export interface Position {
  /** 0-1 normalized X coordinate */
  x: number;
  /** 0-1 normalized Y coordinate */
  y: number;
}

export type NamedPosition =
  | "center"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "top-center"
  | "bottom-center"
  | "center-left"
  | "center-right";

export type OverlayAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface OverlayPosition {
  /** X position: pixels or expression string (e.g. "W-w-10") */
  x: number | string;
  /** Y position: pixels or expression string (e.g. "H-h-10") */
  y: number | string;
}

// --- Operation Configs ---

export interface KenBurnsConfig {
  duration: number;
  startZoom: number;
  endZoom: number;
  startPosition: Position | NamedPosition;
  endPosition: Position | NamedPosition;
  easing?: EasingFunction;
  fps?: number;
}

export interface CropConfig {
  /** Crop to aspect ratio (e.g. "16:9", "1:1") */
  aspectRatio?: string;
  /** Explicit width */
  width?: number;
  /** Explicit height */
  height?: number;
  /** Crop origin X */
  x?: number;
  /** Crop origin Y */
  y?: number;
  /** Auto-detect crop (black bars) */
  detect?: boolean;
}

export interface DuckConfig {
  /** Index of the trigger track (e.g. voice) */
  trigger: number;
  /** Amount to reduce in dB (negative, e.g. -12) */
  amount: number;
  /** Attack time in ms */
  attackMs?: number;
  /** Release time in ms */
  releaseMs?: number;
  /** Threshold for triggering (dB) */
  threshold?: number;
}

export interface NormalizeConfig {
  /** Target integrated loudness (LUFS). YouTube standard: -14 */
  targetLufs: number;
  /** True peak maximum (dBFS, default: -1.5) */
  truePeak?: number;
  /** Loudness range target */
  loudnessRange?: number;
  /** Two-pass normalization for accuracy */
  twoPass?: boolean;
}

// --- Filter Graph ---

export interface FilterNode {
  /** Filter name (e.g. "scale", "overlay", "loudnorm") */
  name: string;
  /** Filter options as key-value pairs or positional args string */
  options?: Record<string, string | number | boolean> | string;
  /** Input pad labels */
  inputs?: string[];
  /** Output pad labels */
  outputs?: string[];
}

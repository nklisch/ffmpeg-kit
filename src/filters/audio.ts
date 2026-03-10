import { buildFilter } from "../core/args.ts";

/**
 * Build a volume filter string.
 * volume(0.5) → "volume=0.5"
 * volume("-6dB") → "volume=-6dB"
 */
export function volume(level: number | string): string {
  return `volume=${level}`;
}

/**
 * Build a loudnorm filter string.
 * loudnorm({ i: -14, tp: -1.5, lra: 11 }) → "loudnorm=I=-14:TP=-1.5:LRA=11"
 */
export function loudnorm(config: {
  i: number;
  tp?: number;
  lra?: number;
  measuredI?: number;
  measuredTp?: number;
  measuredLra?: number;
  measuredThresh?: number;
  offset?: number;
  linear?: boolean;
}): string {
  const opts: Record<string, string | number | boolean> = { I: config.i };
  if (config.tp !== undefined) opts.TP = config.tp;
  if (config.lra !== undefined) opts.LRA = config.lra;
  if (config.measuredI !== undefined) opts.measured_I = config.measuredI;
  if (config.measuredTp !== undefined) opts.measured_TP = config.measuredTp;
  if (config.measuredLra !== undefined) opts.measured_LRA = config.measuredLra;
  if (config.measuredThresh !== undefined) opts.measured_thresh = config.measuredThresh;
  if (config.offset !== undefined) opts.offset = config.offset;
  if (config.linear !== undefined) opts.linear = config.linear;
  return buildFilter("loudnorm", opts);
}

/**
 * Build an afade filter string.
 * afade("in", { duration: 2 }) → "afade=t=in:d=2"
 * afade("out", { duration: 2, startAt: 8, curve: "exp" }) → "afade=t=out:d=2:st=8:curve=exp"
 */
export function afade(
  type: "in" | "out",
  config: {
    duration: number;
    startAt?: number;
    curve?: string;
  },
): string {
  const opts: Record<string, string | number | boolean> = { t: type, d: config.duration };
  if (config.startAt !== undefined) opts.st = config.startAt;
  if (config.curve !== undefined) opts.curve = config.curve;
  return buildFilter("afade", opts);
}

/**
 * Build an amix filter string.
 * amix({ inputs: 2, duration: "longest" }) → "amix=inputs=2:duration=longest"
 */
export function amix(config: {
  inputs: number;
  duration?: "longest" | "shortest" | "first";
  dropoutTransition?: number;
  weights?: string;
}): string {
  const opts: Record<string, string | number | boolean> = { inputs: config.inputs };
  if (config.duration !== undefined) opts.duration = config.duration;
  if (config.dropoutTransition !== undefined) opts.dropout_transition = config.dropoutTransition;
  if (config.weights !== undefined) opts.weights = config.weights;
  return buildFilter("amix", opts);
}

/**
 * Build an acompressor filter string.
 */
export function acompressor(config?: {
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  makeup?: number;
  knee?: number;
}): string {
  if (config === undefined) return "acompressor";
  const opts: Record<string, string | number | boolean> = {};
  if (config.threshold !== undefined) opts.threshold = config.threshold;
  if (config.ratio !== undefined) opts.ratio = config.ratio;
  if (config.attack !== undefined) opts.attack = config.attack;
  if (config.release !== undefined) opts.release = config.release;
  if (config.makeup !== undefined) opts.makeup = config.makeup;
  if (config.knee !== undefined) opts.knee = config.knee;
  return buildFilter("acompressor", opts);
}

/**
 * Build an alimiter filter string.
 */
export function alimiter(config?: { limit?: number; attack?: number; release?: number }): string {
  if (config === undefined) return "alimiter";
  const opts: Record<string, string | number | boolean> = {};
  if (config.limit !== undefined) opts.limit = config.limit;
  if (config.attack !== undefined) opts.attack = config.attack;
  if (config.release !== undefined) opts.release = config.release;
  return buildFilter("alimiter", opts);
}

/**
 * Build an equalizer filter string.
 * equalizer({ frequency: 1000, gain: 6 }) → "equalizer=f=1000:g=6"
 */
export function equalizer(config: {
  frequency: number;
  width?: number;
  widthType?: "h" | "q" | "o" | "s";
  gain: number;
}): string {
  const opts: Record<string, string | number | boolean> = {
    f: config.frequency,
    g: config.gain,
  };
  if (config.width !== undefined) opts.w = config.width;
  if (config.widthType !== undefined) opts.t = config.widthType;
  return buildFilter("equalizer", opts);
}

/**
 * Build highpass/lowpass filter strings.
 */
export function highpass(frequency: number, order?: number): string {
  const opts: Record<string, string | number | boolean> = { f: frequency };
  if (order !== undefined) opts.p = order;
  return buildFilter("highpass", opts);
}

export function lowpass(frequency: number, order?: number): string {
  const opts: Record<string, string | number | boolean> = { f: frequency };
  if (order !== undefined) opts.p = order;
  return buildFilter("lowpass", opts);
}

/**
 * Build bass/treble filter strings.
 */
export function bass(gain: number, frequency?: number): string {
  const opts: Record<string, string | number | boolean> = { g: gain };
  if (frequency !== undefined) opts.f = frequency;
  return buildFilter("bass", opts);
}

export function treble(gain: number, frequency?: number): string {
  const opts: Record<string, string | number | boolean> = { g: gain };
  if (frequency !== undefined) opts.f = frequency;
  return buildFilter("treble", opts);
}

/**
 * Build an agate filter string (noise gate).
 */
export function agate(config?: { threshold?: number; attack?: number; release?: number }): string {
  if (config === undefined) return "agate";
  const opts: Record<string, string | number | boolean> = {};
  if (config.threshold !== undefined) opts.threshold = config.threshold;
  if (config.attack !== undefined) opts.attack = config.attack;
  if (config.release !== undefined) opts.release = config.release;
  return buildFilter("agate", opts);
}

/**
 * Build an afftdn filter string (FFT denoiser).
 */
export function afftdn(config?: { nr?: number; nf?: number }): string {
  if (config === undefined) return "afftdn";
  const opts: Record<string, string | number | boolean> = {};
  if (config.nr !== undefined) opts.nr = config.nr;
  if (config.nf !== undefined) opts.nf = config.nf;
  return buildFilter("afftdn", opts);
}

/**
 * Build an atempo chain for speed factors outside 0.5-2.0 range.
 * atempo(4) → "atempo=2.0,atempo=2.0"
 * atempo(0.25) → "atempo=0.5,atempo=0.5"
 * atempo(1.5) → "atempo=1.5"
 */
export function atempo(factor: number): string {
  function fmt(n: number): string {
    return Number.isInteger(n) ? `${n}.0` : String(n);
  }

  const parts: string[] = [];
  let remaining = factor;

  if (factor >= 1) {
    while (remaining > 2.0) {
      parts.push(`atempo=2.0`);
      remaining /= 2;
    }
    parts.push(`atempo=${fmt(remaining)}`);
  } else {
    while (remaining < 0.5) {
      parts.push(`atempo=0.5`);
      remaining /= 0.5;
    }
    parts.push(`atempo=${fmt(remaining)}`);
  }

  return parts.join(",");
}

/**
 * Build a silencedetect filter string.
 */
export function silencedetect(config?: { noise?: number; duration?: number }): string {
  if (config === undefined) return "silencedetect";
  const opts: Record<string, string | number | boolean> = {};
  if (config.noise !== undefined) opts.noise = `${config.noise}dB`;
  if (config.duration !== undefined) opts.d = config.duration;
  return buildFilter("silencedetect", opts);
}

/**
 * Build an acrossfade filter string.
 */
export function acrossfade(config: { duration: number; curve1?: string; curve2?: string }): string {
  const opts: Record<string, string | number | boolean> = { d: config.duration };
  if (config.curve1 !== undefined) opts.c1 = config.curve1;
  if (config.curve2 !== undefined) opts.c2 = config.curve2;
  return buildFilter("acrossfade", opts);
}

/**
 * Build an adelay filter string.
 * adelay(500) → "adelay=500|500" (stereo delay in ms)
 */
export function adelay(delayMs: number, channels = 2): string {
  const delays = Array.from({ length: channels }, () => String(delayMs)).join("|");
  return `adelay=${delays}`;
}

/**
 * Build an aresample filter string.
 */
export function aresample(sampleRate: number, useSoxr?: boolean): string {
  if (useSoxr === true) {
    return `aresample=${sampleRate}:resampler=soxr`;
  }
  return `aresample=${sampleRate}`;
}

/** Build an areverse filter: "areverse" */
export function areverse(): string {
  return "areverse";
}

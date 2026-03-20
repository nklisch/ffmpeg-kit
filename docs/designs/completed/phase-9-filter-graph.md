# Design: Phase 9 — Filter Graph Builder

## Overview

Phase 9 implements the low-level filter graph builder layer (`src/filters/`). This layer sits between the encoding/hardware layer and the operation builders in the architecture. It provides:

1. **`FilterGraphBuilder`** — fluent builder for constructing `-vf`, `-af`, and `-filter_complex` argument strings
2. **Video filter helpers** — typed functions that produce correct filter strings for common video filters
3. **Audio filter helpers** — typed functions that produce correct filter strings for common audio filters
4. **Expression helpers** — utilities for building FFmpeg time expressions, math expressions, and conditional enable clauses

The existing `buildFilter()` in `src/core/args.ts` already handles single-filter string construction. Phase 9 builds on top of it to handle **multi-filter chains**, **complex graphs with labeled pads**, and **typed filter constructors** that prevent common mistakes.

### Design Rationale

Currently, each operation builder constructs filter strings by hand with inline string concatenation (e.g., `overlay.ts` lines 196-241, `concat.ts` lines 220-275). This works but:
- Duplicates escaping/formatting logic
- Makes complex graphs error-prone (pad label mismatches)
- Provides no discoverability for users who want custom filter graphs

The filter graph builder provides a structured alternative without forcing operation builders to migrate — they can adopt it incrementally.

---

## Implementation Units

### Unit 1: Filter Expression Helpers

**File**: `src/filters/helpers.ts`

```typescript
import type { Timestamp } from "../types/base.ts";

/**
 * Build an FFmpeg enable expression for a time range.
 * between(t,5,10) — show between 5s and 10s
 * gte(t,5) — show from 5s onward
 * lte(t,10) — show until 10s
 */
export function timeRange(opts: {
  start?: number;
  end?: number;
}): string;

/**
 * Build a "between(t,start,end)" expression.
 */
export function between(start: number, end: number): string;

/**
 * Wrap an expression in enable='...' syntax for filter options.
 */
export function enable(expr: string): string;

/**
 * Linear interpolation expression for FFmpeg.
 * Useful for animated parameters (zoom, position).
 * Returns: "start+(end-start)*t/duration" or equivalent
 */
export function lerp(start: number, end: number, tExpr: string, duration: number): string;

/**
 * Build an easing expression for FFmpeg.
 * Maps EasingFunction to FFmpeg math expressions.
 */
export function easing(
  fn: "linear" | "ease-in" | "ease-out" | "ease-in-out",
  tExpr: string,
  duration: number,
): string;

/**
 * Clamp expression: min(max(expr, lo), hi)
 */
export function clamp(expr: string, lo: number, hi: number): string;

/**
 * Conditional expression: if(condition, then, else)
 */
export function ifExpr(condition: string, thenExpr: string, elseExpr: string): string;
```

**Implementation Notes**:
- `timeRange` returns the raw expression string (no `enable=` wrapper) — callers decide how to use it
- `easing` maps: `linear` → `t/dur`, `ease-in` → `pow(t/dur,2)`, `ease-out` → `1-pow(1-t/dur,2)`, `ease-in-out` → standard smoothstep `3*pow(t/dur,2)-2*pow(t/dur,3)`
- All functions return plain strings — no FFmpeg execution involved

**Acceptance Criteria**:
- [ ] `timeRange({ start: 5, end: 10 })` → `"between(t,5,10)"`
- [ ] `timeRange({ start: 5 })` → `"gte(t,5)"`
- [ ] `timeRange({ end: 10 })` → `"lte(t,10)"`
- [ ] `between(5, 10)` → `"between(t,5,10)"`
- [ ] `enable("between(t,5,10)")` → `"enable='between(t,5,10)'"`
- [ ] `lerp(1, 2, "t", 5)` → `"1+(2-1)*t/5"` or equivalent
- [ ] `easing("ease-in", "t", 5)` returns a valid FFmpeg expression
- [ ] `clamp("x", 0, 100)` → `"min(max(x,0),100)"`
- [ ] `ifExpr("gt(t,5)", "1", "0")` → `"if(gt(t,5),1,0)"`

---

### Unit 2: Video Filter String Builders

**File**: `src/filters/video.ts`

```typescript
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
): string;

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
}): string;

/**
 * Build an overlay filter string.
 * overlay({ x: 10, y: 10 }) → "overlay=x=10:y=10"
 */
export function overlayFilter(config: {
  x?: number | string;
  y?: number | string;
  enable?: string;
  format?: "yuv420" | "yuv444" | "rgb" | "gbrp";
}): string;

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
}): string;

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
}): string;

/**
 * Build a setpts expression for speed change.
 * setpts(2) → "setpts=PTS/2" (2x speed)
 * setpts(0.5) → "setpts=PTS/0.5" (half speed)
 */
export function setpts(speedFactor: number): string;

/**
 * Build a transpose filter for rotation.
 * transpose(90) → "transpose=1"
 * transpose(180) → "transpose=1,transpose=1"
 * transpose(270) → "transpose=2"
 */
export function transpose(degrees: 90 | 180 | 270): string;

/**
 * Build an fps filter string.
 * fps(30) → "fps=30"
 */
export function fps(rate: number): string;

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
}): string;

/**
 * Build an xfade transition filter string.
 */
export function xfade(config: {
  transition: string;
  duration: number;
  offset: number;
  expr?: string;
}): string;

/** Common shorthand: "hflip" */
export function hflip(): string;

/** Common shorthand: "vflip" */
export function vflip(): string;

/** Common shorthand: "reverse" */
export function reverse(): string;

/** Build a format filter: format=pix_fmts=yuv420p */
export function format(pixFmt: string): string;

/** Build a colorkey/chromakey filter */
export function chromakey(config: {
  color: string;
  similarity?: number;
  blend?: number;
}): string;

export function colorkey(config: {
  color: string;
  similarity?: number;
  blend?: number;
}): string;
```

**Implementation Notes**:
- All functions use `buildFilter()` from `src/core/args.ts` internally where appropriate
- `scale` with `fit: "contain"` returns a comma-separated chain: `"scale=...,pad=..."`
- `scale` with `fit: "cover"` returns: `"scale=...,crop=..."`
- `drawtext` must escape text content with `escapeFilterValue()` — colons, backslashes, single quotes
- `transpose` maps: 90→`"transpose=1"`, 270→`"transpose=2"`, 180→`"transpose=1,transpose=1"`

**Acceptance Criteria**:
- [ ] `scale({ width: 1920 })` → `"scale=1920:-2"`
- [ ] `scale({ height: 720 })` → `"scale=-2:720"`
- [ ] `scale({ width: 1920, height: 1080 })` → `"scale=1920:1080"`
- [ ] `scale({ width: 1920 }, { algorithm: "lanczos" })` includes `flags=lanczos`
- [ ] `crop({ aspectRatio: "16:9" })` → aspect-ratio-based crop expression
- [ ] `crop({ width: 640, height: 480, x: 100, y: 50 })` → `"crop=640:480:100:50"`
- [ ] `overlayFilter({ x: "W-w-10", y: "H-h-10" })` → `"overlay=x=W-w-10:y=H-h-10"`
- [ ] `drawtext({ text: "Hello: World" })` escapes the colon
- [ ] `setpts(2)` → `"setpts=PTS/2"`
- [ ] `transpose(90)` → `"transpose=1"`
- [ ] `hflip()` → `"hflip"`
- [ ] `xfade({ transition: "fade", duration: 1, offset: 4 })` → `"xfade=transition=fade:duration=1:offset=4"`

---

### Unit 3: Audio Filter String Builders

**File**: `src/filters/audio.ts`

```typescript
/**
 * Build a volume filter string.
 * volume(0.5) → "volume=0.5"
 * volume("-6dB") → "volume=-6dB"
 */
export function volume(level: number | string): string;

/**
 * Build a loudnorm filter string.
 * loudnorm({ i: -14, tp: -1.5, lra: 11 }) → "loudnorm=I=-14:TP=-1.5:LRA=11"
 */
export function loudnorm(config: {
  i: number;
  tp?: number;
  lra?: number;
  /** For 2nd pass: measured values */
  measuredI?: number;
  measuredTp?: number;
  measuredLra?: number;
  measuredThresh?: number;
  offset?: number;
  linear?: boolean;
}): string;

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
): string;

/**
 * Build an amix filter string.
 * amix({ inputs: 2, duration: "longest" }) → "amix=inputs=2:duration=longest"
 */
export function amix(config: {
  inputs: number;
  duration?: "longest" | "shortest" | "first";
  dropoutTransition?: number;
  weights?: string;
}): string;

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
}): string;

/**
 * Build an alimiter filter string.
 */
export function alimiter(config?: {
  limit?: number;
  attack?: number;
  release?: number;
}): string;

/**
 * Build an equalizer filter string.
 * equalizer({ frequency: 1000, gain: 6 }) → "equalizer=f=1000:g=6"
 */
export function equalizer(config: {
  frequency: number;
  width?: number;
  widthType?: "h" | "q" | "o" | "s";
  gain: number;
}): string;

/**
 * Build highpass/lowpass filter strings.
 */
export function highpass(frequency: number, order?: number): string;
export function lowpass(frequency: number, order?: number): string;

/**
 * Build bass/treble filter strings.
 */
export function bass(gain: number, frequency?: number): string;
export function treble(gain: number, frequency?: number): string;

/**
 * Build an agate filter string (noise gate).
 */
export function agate(config?: {
  threshold?: number;
  attack?: number;
  release?: number;
}): string;

/**
 * Build an afftdn filter string (FFT denoiser).
 */
export function afftdn(config?: { nr?: number; nf?: number }): string;

/**
 * Build an atempo chain for speed factors outside 0.5-2.0 range.
 * atempo(4) → "atempo=2.0,atempo=2.0"
 * atempo(0.25) → "atempo=0.5,atempo=0.5"
 */
export function atempo(factor: number): string;

/**
 * Build a silencedetect filter string.
 */
export function silencedetect(config?: {
  noise?: number;
  duration?: number;
}): string;

/**
 * Build an acrossfade filter string.
 */
export function acrossfade(config: {
  duration: number;
  curve1?: string;
  curve2?: string;
}): string;

/**
 * Build an adelay filter string.
 * adelay(500) → "adelay=500|500" (stereo delay in ms)
 */
export function adelay(delayMs: number, channels?: number): string;

/**
 * Build an aresample filter string.
 */
export function aresample(sampleRate: number, useSoxr?: boolean): string;

/** Build an areverse filter: "areverse" */
export function areverse(): string;
```

**Implementation Notes**:
- `atempo` chains multiple `atempo` filters when factor is outside 0.5-2.0 range (move logic from `src/util/audio-filters.ts` `buildAtempoChain`)
- `loudnorm` with `measuredI` etc. produces the 2nd-pass filter string with all measured values
- All functions return plain strings

**Acceptance Criteria**:
- [ ] `volume(0.5)` → `"volume=0.5"`
- [ ] `volume("-6dB")` → `"volume=-6dB"`
- [ ] `loudnorm({ i: -14, tp: -1.5 })` → `"loudnorm=I=-14:TP=-1.5"`
- [ ] `afade("in", { duration: 2 })` → `"afade=t=in:d=2"`
- [ ] `afade("out", { duration: 2, startAt: 8, curve: "exp" })` includes `st=8:curve=exp`
- [ ] `atempo(4)` → `"atempo=2.0,atempo=2.0"`
- [ ] `atempo(0.25)` → `"atempo=0.5,atempo=0.5"`
- [ ] `atempo(1.5)` → `"atempo=1.5"`
- [ ] `equalizer({ frequency: 1000, gain: 6 })` → `"equalizer=f=1000:g=6"`
- [ ] `highpass(200)` → `"highpass=f=200"`
- [ ] `silencedetect({ noise: -40, duration: 0.5 })` → `"silencedetect=noise=-40dB:d=0.5"`
- [ ] `acrossfade({ duration: 1 })` → `"acrossfade=d=1"`

---

### Unit 4: Filter Graph Builder

**File**: `src/filters/graph.ts`

```typescript
import type { FilterNode } from "../types/filters.ts";

/**
 * Fluent builder for constructing FFmpeg filter graphs.
 *
 * Supports three modes:
 * 1. Simple video filter chain: `-vf "scale=1920:-2,fps=30"`
 * 2. Simple audio filter chain: `-af "loudnorm,afade=t=out:d=2"`
 * 3. Complex filter graph: `-filter_complex "[0:v]scale=1920:-2[v0];[0:a]loudnorm[a0]"`
 */
export interface FilterGraphBuilder {
  /** Add a video filter to the simple video chain (-vf) */
  videoFilter(filter: string | FilterNode): this;

  /** Add an audio filter to the simple audio chain (-af) */
  audioFilter(filter: string | FilterNode): this;

  /**
   * Build a complex filter graph (-filter_complex).
   * Accepts either a raw string or an array of FilterNodes.
   * Once called, videoFilter/audioFilter chains are ignored.
   */
  complex(graph: string | FilterNode[]): this;

  /**
   * Map an input stream to a label for use in complex graphs.
   * input(0, "base") creates label [0:v] → can be referenced as "base"
   */
  input(index: number, label: string, streamType?: "v" | "a"): this;

  /**
   * Map a labeled output for use as a -map argument.
   * output("vout", "v") → the output labeled [vout] is a video stream
   */
  output(label: string, streamType: "v" | "a"): this;

  /** Build the video filter string (for -vf). Returns empty string if no video filters. */
  buildVideoFilter(): string;

  /** Build the audio filter string (for -af). Returns empty string if no audio filters. */
  buildAudioFilter(): string;

  /** Build the complete filter_complex string. Returns empty string if not in complex mode. */
  buildComplex(): string;

  /**
   * Build the complete filter as a string.
   * Returns the filter_complex string if in complex mode,
   * otherwise returns video and audio filter strings.
   */
  toString(): string;

  /**
   * Build as FFmpeg CLI arguments.
   * Returns ["-vf", "..."] and/or ["-af", "..."] for simple mode,
   * or ["-filter_complex", "..."] for complex mode.
   * Includes -map args for labeled outputs in complex mode.
   */
  toArgs(): string[];
}

/**
 * Create a new FilterGraphBuilder.
 */
export function filterGraph(): FilterGraphBuilder;

/**
 * Build a single filter string from name and options.
 * Convenience re-export of buildFilter from core/args.ts.
 * filter("scale", { w: 1920, h: -2 }) → "scale=w=1920:h=-2"
 */
export function filter(
  name: string,
  options?: Record<string, string | number | boolean> | string,
): string;

/**
 * Chain multiple filter strings with commas.
 * chain("scale=1920:-2", "fps=30") → "scale=1920:-2,fps=30"
 */
export function chain(...filters: string[]): string;
```

**Implementation Notes**:

The builder maintains internal state:
```typescript
interface FilterGraphState {
  videoFilters: string[];
  audioFilters: string[];
  complexGraph: string | null;
  complexNodes: FilterNode[] | null;
  inputMappings: Array<{ index: number; label: string; streamType: "v" | "a" }>;
  outputMappings: Array<{ label: string; streamType: "v" | "a" }>;
}
```

Key behaviors:
- `videoFilter(f)` / `audioFilter(f)`: Accepts either a raw filter string (e.g., `"scale=1920:-2"`) or a `FilterNode` object. If `FilterNode`, converts using `buildFilter()`.
- `complex(graph)`: If string, stores as-is. If `FilterNode[]`, serializes using pad labels and semicolons. Each node with `inputs`/`outputs` produces `[in1][in2]filter=opts[out1][out2]`.
- `toArgs()` in simple mode: returns `["-vf", videoChain, "-af", audioChain]` (omitting either if empty).
- `toArgs()` in complex mode: returns `["-filter_complex", complexStr, "-map", "[vout]", "-map", "[aout]", ...]` based on output mappings.
- `FilterNode` serialization: `{ name: "scale", options: { w: 1920, h: -2 }, inputs: ["0:v"], outputs: ["scaled"] }` → `"[0:v]scale=w=1920:h=-2[scaled]"`

**Acceptance Criteria**:
- [ ] Simple video chain: `filterGraph().videoFilter("scale=1920:-2").videoFilter("fps=30").toArgs()` → `["-vf", "scale=1920:-2,fps=30"]`
- [ ] Simple audio chain: `filterGraph().audioFilter("loudnorm").audioFilter("afade=t=out:d=2").toArgs()` → `["-af", "loudnorm,afade=t=out:d=2"]`
- [ ] Combined simple: produces both `-vf` and `-af` args
- [ ] FilterNode input: `filterGraph().videoFilter({ name: "scale", options: { w: 1920, h: -2 } }).buildVideoFilter()` → `"scale=w=1920:h=-2"`
- [ ] Complex string: `filterGraph().complex("[0:v]scale=1920:-2[v0]").toArgs()` → `["-filter_complex", "[0:v]scale=1920:-2[v0]"]`
- [ ] Complex nodes: `filterGraph().complex([{ name: "scale", options: { w: 1920, h: -2 }, inputs: ["0:v"], outputs: ["scaled"] }]).buildComplex()` → `"[0:v]scale=w=1920:h=-2[scaled]"`
- [ ] Multi-node complex: multiple nodes joined with `;`
- [ ] Output mappings: `filterGraph().complex("...").output("vout", "v").output("aout", "a").toArgs()` includes `-map [vout] -map [aout]`
- [ ] `filter("scale", { w: 1920, h: -2 })` → `"scale=w=1920:h=-2"` (delegates to `buildFilter`)
- [ ] `chain("scale=1920:-2", "fps=30")` → `"scale=1920:-2,fps=30"`
- [ ] `chain()` with no args returns `""`
- [ ] Empty filterGraph produces `[]` from `toArgs()`

---

## Implementation Order

1. **Unit 1: `src/filters/helpers.ts`** — No dependencies on other new code. Pure expression builders.
2. **Unit 2: `src/filters/video.ts`** — Depends on `buildFilter` from core/args and helpers from Unit 1. Pure string builders.
3. **Unit 3: `src/filters/audio.ts`** — Depends on `buildFilter` from core/args. Pure string builders. Can be done in parallel with Unit 2.
4. **Unit 4: `src/filters/graph.ts`** — Depends on `buildFilter` from core/args. Uses video/audio helpers conceptually but doesn't import them (they're for the caller to compose). This can also be done in parallel with Units 2-3.
5. **Barrel export** — Update `src/index.ts` to export all new public functions and types.

---

## Testing

### Builder Tests (Tier 1): `__tests__/builder/filter-graph.test.ts`

```
describe("filter helpers", () => {
  // timeRange
  it("builds between expression for start+end")
  it("builds gte expression for start-only")
  it("builds lte expression for end-only")
  // between, enable, lerp, easing, clamp, ifExpr
  it("builds between expression")
  it("wraps expression in enable syntax")
  it("builds lerp expression")
  it("builds easing expressions for all 4 types")
  it("builds clamp expression")
  it("builds conditional if expression")
})

describe("video filters", () => {
  it("scale with width only → -2 height")
  it("scale with height only → -2 width")
  it("scale with both dimensions")
  it("scale with algorithm flag")
  it("scale with fit:contain → scale+pad chain")
  it("scale with fit:cover → scale+crop chain")
  it("crop with explicit dimensions")
  it("crop with aspect ratio")
  it("crop with x,y position")
  it("overlay with x,y position")
  it("overlay with enable expression")
  it("pad with centered position")
  it("pad with custom color")
  it("drawtext with text content, escapes special chars")
  it("drawtext with fontFile, fontSize, fontColor")
  it("setpts for speed factor")
  it("transpose for 90, 180, 270 degrees")
  it("hflip, vflip, reverse return correct strings")
  it("fps returns fps=N")
  it("xfade with transition type, duration, offset")
  it("format returns format=pix_fmts=...")
  it("chromakey with color and options")
})

describe("audio filters", () => {
  it("volume with number")
  it("volume with dB string")
  it("loudnorm with basic params")
  it("loudnorm with measured values (2nd pass)")
  it("afade in with duration")
  it("afade out with startAt and curve")
  it("amix with inputs and duration")
  it("acompressor with all params")
  it("alimiter with limit")
  it("equalizer with frequency and gain")
  it("highpass and lowpass with frequency")
  it("bass and treble with gain")
  it("atempo single (in range)")
  it("atempo chained (factor > 2)")
  it("atempo chained (factor < 0.5)")
  it("silencedetect with noise and duration")
  it("acrossfade with duration")
  it("adelay with ms and channel count")
  it("aresample with sampleRate")
  it("aresample with soxr flag")
  it("areverse returns 'areverse'")
})

describe("FilterGraphBuilder", () => {
  it("empty builder produces empty args")
  it("single video filter → -vf args")
  it("multiple video filters → comma-joined -vf")
  it("single audio filter → -af args")
  it("multiple audio filters → comma-joined -af")
  it("both video and audio → -vf and -af args")
  it("FilterNode objects converted to strings")
  it("complex string passthrough")
  it("complex nodes serialized with pad labels")
  it("multi-node complex joined with semicolons")
  it("output mappings produce -map args")
  it("complex mode ignores simple video/audio filters")
  it("filter() convenience function")
  it("chain() joins with commas")
  it("chain() with empty args returns empty string")
  it("toString() returns filter string")
})
```

### E2E Tests (Tier 2): `__tests__/integration/filter-graph.e2e.test.ts`

```
describeWithFFmpeg("FilterGraphBuilder E2E", () => {
  it("simple video filter chain: scale + fps", async () => {
    // Build args with filterGraph, execute with real ffmpeg
    // Verify output dimensions and frame rate via probe
  })

  it("simple audio filter chain: loudnorm + afade", async () => {
    // Apply audio filters to fixture, verify output exists and duration
  })

  it("complex multi-input filter graph: overlay two videos", async () => {
    // Two inputs, overlay one on top of other using complex graph
    // Verify output has correct dimensions
  })

  it("combined audio + video complex graph", async () => {
    // Scale video + normalize audio in one filter_complex
    // Verify both video dimensions and audio output
  })

  it("video filter helpers produce valid ffmpeg filters", async () => {
    // Use scale(), crop(), fps() helpers in a chain
    // Execute and verify output properties
  })

  it("audio filter helpers produce valid ffmpeg filters", async () => {
    // Use loudnorm(), afade() helpers
    // Execute and verify output properties
  })
})
```

---

## Verification Checklist

```bash
# Type check
pnpm tsc --noEmit

# Lint
pnpm biome check src/filters/

# Unit tests
pnpm vitest run __tests__/builder/filter-graph.test.ts

# E2E tests (requires ffmpeg)
pnpm vitest run __tests__/integration/filter-graph.e2e.test.ts

# Full test suite (no regressions)
pnpm test
```

# Design: Phase 5 — Extract & Transform Operation Builders

## Overview

Phase 5 introduces the first two operation builders: `ExtractBuilder` (frame/thumbnail extraction) and `TransformBuilder` (video transformation). These establish the builder pattern that all subsequent operations will follow.

Both builders use a fluent API with `.toArgs()` for inspection and `.execute()` / `.tryExecute()` for execution. They build on the core layer (`execute`, `probe`, `buildBaseArgs`, `buildFilter`) and types already defined in Phases 1–4.

---

## Implementation Units

### Unit 1: Extract Builder

**File**: `src/operations/extract.ts`

```typescript
import type { ExecuteOptions } from "../types/options.ts";
import type { ExtractResult, OperationResult } from "../types/results.ts";

export interface ExtractBuilder {
  input(path: string): this;
  timestamp(position: string | number): this;
  size(dimensions: { width?: number; height?: number }): this;
  format(fmt: "png" | "jpg" | "webp" | "bmp" | "tiff"): this;
  quality(q: number): this;
  frames(count: number): this;
  thumbnail(enabled?: boolean): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ExtractResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ExtractResult>>;
}

export function extract(): ExtractBuilder;
```

**Internal state:**

```typescript
interface ExtractState {
  inputPath?: string;
  timestampValue?: number;         // always resolved to seconds at toArgs() time
  dimensions?: { width?: number; height?: number };
  outputFormat?: "png" | "jpg" | "webp" | "bmp" | "tiff";
  qualityValue?: number;
  frameCount?: number;             // default: 1
  useThumbnail?: boolean;          // scene-detect thumbnail selection
  outputPath?: string;
}
```

**Implementation Notes:**

1. **`-ss` before `-i` for fast seeking**: When `timestamp` is set, place `-ss <seconds>` before `-i` in the args array. This enables input-level seeking (demuxer seeking) which is much faster than output-level seeking.

2. **Timestamp resolution**: Use `parseTimecode()` from `src/util/timecode.ts`. Percentage timestamps (`"50%"`) require duration — the builder does NOT probe at `toArgs()` time. Instead, percentage timestamps are resolved at `execute()` time by probing the input first. For `toArgs()`, percentage timestamps throw an error (since we can't resolve without probing).

3. **Format mapping**: Map format names to ffmpeg codec/format:
   - `"png"` → no extra codec args needed (ffmpeg infers from extension)
   - `"jpg"` → `-c:v mjpeg`
   - `"webp"` → `-c:v libwebp`
   - `"bmp"` → `-c:v bmp`
   - `"tiff"` → `-c:v tiff`

4. **Quality**: JPEG quality maps to `-q:v` (scale 1–31, 1=best). WebP quality maps to `-quality` (scale 0–100, 100=best). Other formats ignore quality.

5. **Scaling**: When `size` is set, add `-vf scale=W:H` filter. Use `-2` for auto-aspect on either axis (e.g. `scale=320:-2`).

6. **Thumbnail mode**: Uses `-vf thumbnail=N` filter where N is the number of frames to analyze (default: 300). This picks the "best" frame based on scene change detection. When thumbnail mode is on, `-ss` is NOT used (the filter needs to scan frames).

7. **Frame count**: Default 1. When `frames > 1`, use `-frames:v N`. The output path must contain `%d` or similar pattern for multiple frames.

8. **Arg construction order**:
   ```
   [-y] [-ss timestamp] -i input [-vf filters] [-c:v codec] [-q:v quality] [-frames:v N] output
   ```

9. **`execute()` behavior**:
   - Validate: `inputPath` and `outputPath` must be set (throw `FFmpegError` with `ENCODING_FAILED` if missing)
   - If timestamp is a percentage string, probe input to get duration, then resolve
   - Call `execute()` from core
   - Probe output to build `ExtractResult` (width, height, format, sizeBytes from stat)

10. **`tryExecute()` behavior**: Wraps `execute()` in try/catch, returns `OperationResult<ExtractResult>`.

**Acceptance Criteria:**
- [ ] `extract().input("v.mp4").timestamp(5).output("f.png").toArgs()` places `-ss` before `-i`
- [ ] `extract().input("v.mp4").timestamp("01:30").output("f.png").toArgs()` resolves timecode to seconds
- [ ] `extract().input("v.mp4").format("jpg").quality(2).output("f.jpg").toArgs()` includes `-c:v mjpeg -q:v 2`
- [ ] `extract().input("v.mp4").size({ width: 320 }).output("f.png").toArgs()` includes `-vf scale=320:-2`
- [ ] `extract().input("v.mp4").thumbnail().output("f.png").toArgs()` includes `-vf thumbnail=300`, no `-ss`
- [ ] `extract().input("v.mp4").frames(5).output("f_%d.png").toArgs()` includes `-frames:v 5`
- [ ] `extract().output("f.png").toArgs()` throws (no input)
- [ ] `extract().input("v.mp4").toArgs()` throws (no output)
- [ ] `execute()` produces a real image file with correct dimensions
- [ ] `tryExecute()` returns `{ success: false, error }` on bad input

---

### Unit 2: Transform Builder

**File**: `src/operations/transform.ts`

```typescript
import type { HwAccelMode } from "../types/codecs.ts";
import type { CropConfig, FitMode, KenBurnsConfig, ScaleAlgorithm } from "../types/filters.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, TransformResult } from "../types/results.ts";

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

export function transform(): TransformBuilder;
```

**Internal state:**

```typescript
interface TransformState {
  inputPath?: string;
  scaleDimensions?: { width?: number; height?: number };
  fitMode?: FitMode;
  scaleAlgo?: ScaleAlgorithm;
  cropConfig?: CropConfig;
  kenBurnsConfig?: KenBurnsConfig;
  speedFactor?: number;
  isReversed?: boolean;
  trimStartValue?: number;        // resolved to seconds
  trimEndValue?: number;          // resolved to seconds
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
```

**Implementation Notes:**

1. **Scale filter construction**: Build `scale=W:H` where either dimension can be `-2` for auto-aspect. When `fitMode` is set:
   - `"none"` → plain `scale=W:H`
   - `"contain"` → `scale=W:H:force_original_aspect_ratio=decrease` then `pad=W:H:(ow-iw)/2:(oh-ih)/2:color`
   - `"cover"` → `scale=W:H:force_original_aspect_ratio=increase` then `crop=W:H`
   - `"fill"` → `scale=W:H` (stretches)

2. **Scale algorithm**: Append `:flags=<algo>` to scale filter. Map SDK names: `"bilinear"` → `"bilinear"`, `"bicubic"` → `"bicubic"`, `"lanczos"` → `"lanczos"`, `"spline"` → `"spline"`, `"neighbor"` → `"neighbor"`.

3. **Crop filter**:
   - Aspect ratio: Parse `"16:9"` → compute `crop=ih*16/9:ih` (or `iw:iw*9/16` if taller). Center by default.
   - Explicit dimensions: `crop=W:H:X:Y` (X/Y default to centered: `(iw-W)/2:(ih-H)/2`)
   - Detect mode: `-vf cropdetect` (NOT implemented in Phase 5 — out of scope, throw if `detect: true`)

4. **Ken Burns**: Uses the `zoompan` filter. This is the most complex filter:
   ```
   zoompan=z='<zoom_expr>':x='<x_expr>':y='<y_expr>':d=<total_frames>:s=<WxH>:fps=<fps>
   ```
   - `duration * fps = total_frames`
   - Zoom expression: interpolate from `startZoom` to `endZoom` using easing
   - Position: resolve `NamedPosition` to normalized `{x, y}`, then build expressions based on zoom level
   - Easing functions:
     - `"linear"` → `lerp(t) = t`
     - `"ease-in"` → `t*t`
     - `"ease-out"` → `t*(2-t)`
     - `"ease-in-out"` → `t<0.5 ? 2*t*t : -1+(4-2*t)*t`
   - The zoompan filter expression uses `on` (output frame number) and `n` (frame count): `t = on/d`
   - Default fps: 30

5. **Speed**: Affects both video and audio:
   - Video: `-vf setpts=PTS/<factor>` (e.g. 2x speed → `setpts=PTS/2`)
   - Audio: `-af atempo=<factor>`
   - FFmpeg `atempo` is limited to range [0.5, 100]. For factors outside this, chain multiple atempo filters:
     - `speed=4` → `-af atempo=2,atempo=2` (because 4 > 2, chain)
     - `speed=0.25` → `-af atempo=0.5,atempo=0.5` (because 0.25 < 0.5, chain)
   - Reverse video speed (`factor < 0`) is NOT supported — use `reverse()` separately

6. **Reverse**: Add `-vf reverse` and `-af areverse`. Note: FFmpeg loads the entire stream into memory for reverse, so this is only practical for short clips. No guard needed — let FFmpeg handle OOM.

7. **Trim**:
   - `trimStart` → `-ss <seconds>` (before `-i` for input seeking)
   - `trimEnd` → `-to <seconds>` (after `-i`)
   - `duration` → `-t <seconds>` (after `-i`, alternative to `-to`)
   - If both `trimEnd` and `duration` are set, `duration` wins (last flag wins in ffmpeg, but we'll use `duration` and ignore `trimEnd`).

8. **Loop**: `-stream_loop <count>`. Count of 0 means no loop (play once), positive N means loop N additional times (play N+1 total). For consistency, the builder's `loop(count)` means "play count times total", so we pass `-stream_loop <count - 1>`.

9. **FPS**: `-vf fps=<rate>` filter. Goes in the video filter chain.

10. **Interpolate**: Uses `minterpolate` or `framerate` filter for motion-interpolated frame rate change:
    - `minterpolate`: `-vf minterpolate=fps=<fps>:mi_mode=mci:mc_mode=aobmc:vsbmc=1`
    - `framerate`: `-vf framerate=fps=<fps>`

11. **Pad**: `-vf pad=W:H:(ow-iw)/2:(oh-ih)/2:<color>`. Default color: `"black"`.

12. **Rotate**:
    - 90°: `-vf transpose=1`
    - 180°: `-vf transpose=1,transpose=1`
    - 270°: `-vf transpose=2`
    - Arbitrary degrees: `-vf rotate=<radians>:bilinear=1:fillcolor=black` (but this is rare; only support 90/180/270 initially, throw for other values)

13. **Flip**:
    - Horizontal: `-vf hflip`
    - Vertical: `-vf vflip`

14. **Stabilize**: Uses vidstab (2-pass):
    - Phase 5 does NOT implement stabilize (it requires 2-pass execution with temporary transform file). Throw `FFmpegError` with `ENCODING_FAILED` code and message "stabilize() is not yet implemented" if called at `execute()` time.

15. **outputSize**: Shorthand for `.scale({ width, height })`. If scale is already set, `outputSize` overrides it.

16. **hwAccel**: Stored in state but NOT used in Phase 5 arg construction (hardware-accelerated transform requires `scale_cuda`/`scale_vaapi` etc, which is Phase 4+ integration). For now, store it for future use but don't generate hardware-specific args.

17. **Video filter chain ordering**: Filters must be applied in a sensible order. The chain is built as a comma-separated `-vf` string:
    ```
    scale → crop → pad → flip → rotate → speed(setpts) → fps → reverse
    ```
    Ken Burns replaces the entire video filter chain (zoompan produces its own output).

18. **Arg construction order**:
    ```
    [-y] [-ss trimStart] [-stream_loop N] -i input [-t duration | -to trimEnd] [-vf filterchain] [-af audiofilters] [-c:v libx264 -pix_fmt yuv420p] output
    ```
    Note: When video filters are applied, ffmpeg must re-encode. Use `-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p` as sensible defaults for re-encode. When no filters are applied and only trim is used, use `-c copy` for stream copy.

19. **`execute()` behavior**:
    - Validate: `inputPath` and `outputPath` required
    - Resolve timecode strings via `parseTimecode()`
    - Call `execute()` from core
    - Probe output for `TransformResult` (duration, width, height, sizeBytes from stat)

20. **`tryExecute()` behavior**: Same wrapping pattern as ExtractBuilder.

**Acceptance Criteria:**
- [ ] `transform().input("v.mp4").scale({ width: 1920 }).output("o.mp4").toArgs()` includes `-vf scale=1920:-2`
- [ ] `transform().input("v.mp4").scale({ width: 640, height: 360 }).output("o.mp4").toArgs()` includes `-vf scale=640:360`
- [ ] `transform().input("v.mp4").scale({ width: 1920, height: 1080 }).fit("contain").output("o.mp4").toArgs()` includes `scale=...force_original_aspect_ratio=decrease` and `pad=...`
- [ ] `transform().input("v.mp4").scale({ width: 1920, height: 1080 }).fit("cover").output("o.mp4").toArgs()` includes `scale=...force_original_aspect_ratio=increase` and `crop=...`
- [ ] `transform().input("v.mp4").crop({ aspectRatio: "16:9" }).output("o.mp4").toArgs()` produces correct crop expression
- [ ] `transform().input("v.mp4").speed(2).output("o.mp4").toArgs()` includes `setpts=PTS/2` and `atempo=2`
- [ ] `transform().input("v.mp4").speed(4).output("o.mp4").toArgs()` chains `atempo=2,atempo=2`
- [ ] `transform().input("v.mp4").speed(0.5).output("o.mp4").toArgs()` includes `setpts=PTS*2` (i.e. `PTS/0.5`)
- [ ] `transform().input("v.mp4").trimStart(5).output("o.mp4").toArgs()` places `-ss 5` before `-i`
- [ ] `transform().input("v.mp4").trimStart(5).duration(3).output("o.mp4").toArgs()` includes `-ss 5` and `-t 3`
- [ ] `transform().input("v.mp4").reverse().output("o.mp4").toArgs()` includes `reverse` and `areverse`
- [ ] `transform().input("v.mp4").loop(3).output("o.mp4").toArgs()` includes `-stream_loop 2`
- [ ] `transform().input("v.mp4").rotate(90).output("o.mp4").toArgs()` includes `transpose=1`
- [ ] `transform().input("v.mp4").flipH().output("o.mp4").toArgs()` includes `hflip`
- [ ] `transform().input("v.mp4").flipV().output("o.mp4").toArgs()` includes `vflip`
- [ ] `transform().input("v.mp4").pad({ width: 1920, height: 1080 }).output("o.mp4").toArgs()` includes `pad=1920:1080:...`
- [ ] `transform().input("v.mp4").fps(24).output("o.mp4").toArgs()` includes `fps=24` in filter chain
- [ ] When only trim is used (no filters), args include `-c copy`
- [ ] When filters are used, args include `-c:v libx264 -pix_fmt yuv420p`
- [ ] Ken Burns produces `zoompan` filter with correct duration/zoom/position expressions
- [ ] `execute()` with real ffmpeg produces valid output with correct properties
- [ ] `tryExecute()` returns success/failure result type

---

### Unit 3: Barrel Export Updates

**File**: `src/index.ts`

Add exports for the new operation builders:

```typescript
// Operations
export { extract } from "./operations/extract.ts";
export type { ExtractBuilder } from "./operations/extract.ts";
export { transform } from "./operations/transform.ts";
export type { TransformBuilder } from "./operations/transform.ts";
```

**Acceptance Criteria:**
- [ ] `import { extract, transform } from "@ffmpeg-sdk/core"` works
- [ ] `import type { ExtractBuilder, TransformBuilder } from "@ffmpeg-sdk/core"` works

---

### Unit 4: Fixture — `image-1080p.jpg`

**File**: `__tests__/fixtures/generate.sh` (update)

Add generation of `image-1080p.jpg` for Ken Burns and image-based tests:

```bash
# image-1080p.jpg — image for Ken Burns, overlay, image-to-video tests
# 1920x1080 JPEG
ffmpeg -y -f lavfi -i "testsrc2=size=1920x1080:rate=1:duration=1" \
  -frames:v 1 -q:v 2 \
  image-1080p.jpg
```

Also add the fixture to `__tests__/helpers.ts`:

```typescript
export const FIXTURES = {
  videoH264: join(FIXTURES_DIR, "video-h264.mp4"),
  videoShort: join(FIXTURES_DIR, "video-short.mp4"),
  audioSpeech: join(FIXTURES_DIR, "audio-speech.wav"),
  image1080p: join(FIXTURES_DIR, "image-1080p.jpg"),  // NEW
};
```

**Acceptance Criteria:**
- [ ] `generate.sh` produces `image-1080p.jpg` at 1920x1080
- [ ] `FIXTURES.image1080p` resolves to the correct path
- [ ] File size < 200 KB

---

## Implementation Order

1. **Unit 4: Fixture** — Generate `image-1080p.jpg`, update helpers. Must exist before Ken Burns E2E tests.
2. **Unit 1: ExtractBuilder** — Simpler builder, establishes the pattern for all operation builders.
3. **Unit 2: TransformBuilder** — More complex, builds on patterns established by ExtractBuilder.
4. **Unit 3: Barrel exports** — Wire both builders into the public API.

---

## Testing

### Builder Tests (Tier 1)

#### `__tests__/builder/extract.test.ts`

Tests use `.toArgs()` only — no ffmpeg binary needed.

```typescript
describe("ExtractBuilder", () => {
  // Arg construction
  it("places -ss before -i for fast seeking");
  it("resolves HH:MM:SS timecode to seconds");
  it("resolves MM:SS timecode to seconds");
  it("defaults to 1 frame");
  it("includes -frames:v when frames > 1");
  it("includes -c:v mjpeg for jpg format");
  it("includes -c:v libwebp for webp format");
  it("includes -q:v for jpeg quality");
  it("includes -quality for webp quality");
  it("includes scale filter for size");
  it("uses -2 for auto-aspect on missing dimension");
  it("includes thumbnail filter when thumbnail enabled");
  it("omits -ss when thumbnail is enabled");
  it("throws when percentage timestamp used in toArgs() without duration context");

  // Validation
  it("throws when input is missing");
  it("throws when output is missing");
});
```

#### `__tests__/builder/transform.test.ts`

```typescript
describe("TransformBuilder", () => {
  // Scale
  it("produces scale=W:-2 for width-only");
  it("produces scale=-2:H for height-only");
  it("produces scale=W:H for both dimensions");
  it("adds force_original_aspect_ratio for contain mode");
  it("adds pad after scale for contain mode");
  it("adds force_original_aspect_ratio=increase for cover mode");
  it("adds crop after scale for cover mode");
  it("adds scale flags for algorithm");

  // Crop
  it("produces crop expression for aspect ratio");
  it("produces crop=W:H for explicit dimensions");
  it("centers crop by default");
  it("uses explicit x:y when provided");

  // Speed
  it("produces setpts=PTS/2 for speed(2)");
  it("produces setpts=PTS*2 for speed(0.5)");
  it("produces atempo=2 for speed(2)");
  it("chains atempo for speed(4): atempo=2,atempo=2");
  it("chains atempo for speed(0.25): atempo=0.5,atempo=0.5");

  // Trim
  it("places -ss before -i for trimStart");
  it("includes -to for trimEnd");
  it("includes -t for duration");
  it("duration takes precedence over trimEnd");

  // Filters
  it("produces -vf reverse and -af areverse for reverse()");
  it("produces -stream_loop N-1 for loop(N)");
  it("produces transpose=1 for rotate(90)");
  it("produces transpose=1,transpose=1 for rotate(180)");
  it("produces transpose=2 for rotate(270)");
  it("produces hflip filter for flipH()");
  it("produces vflip filter for flipV()");
  it("produces pad filter with centered position");
  it("produces fps=N filter");
  it("produces minterpolate filter for interpolate()");

  // Ken Burns
  it("produces zoompan filter with correct frame count");
  it("includes zoom expression from startZoom to endZoom");

  // Codec selection
  it("uses -c copy when only trimming (no filters)");
  it("uses -c:v libx264 when filters are applied");
  it("applies correct filter chain ordering: scale, crop, pad, flip, rotate, setpts, fps, reverse");

  // Validation
  it("throws when input is missing");
  it("throws when output is missing");
  it("throws for unsupported rotation angle");
});
```

### E2E Tests (Tier 2)

#### `__tests__/integration/extract.e2e.test.ts`

All tests use `describeWithFFmpeg` and real fixtures.

```typescript
describeWithFFmpeg("extract()", () => {
  it("extracts frame at timestamp as PNG", async () => {
    // extract at 1s → verify PNG output, correct dimensions (1920x1080 from video-h264)
  });

  it("extracts frame at percentage", async () => {
    // extract at "50%" → verify frame is from roughly middle of video
  });

  it("extracts with resize", async () => {
    // extract with size({ width: 320 }) → verify output is 320x180
  });

  it("extracts as JPEG with quality", async () => {
    // format("jpg"), quality(2) → verify codec is mjpeg, file exists
  });

  it("extracts as WebP", async () => {
    // format("webp") → verify codec is webp
  });

  it("extracts thumbnail via scene detection", async () => {
    // thumbnail() → verify output exists and has content
  });
});
```

#### `__tests__/integration/transform.e2e.test.ts`

```typescript
describeWithFFmpeg("transform()", () => {
  // Scale
  it("scales to width only (auto height)", async () => {
    // scale({ width: 640 }) → verify 640x360
  });

  it("scales to exact dimensions", async () => {
    // scale({ width: 640, height: 360 }) → verify exact
  });

  it("scales with contain fit (letterbox)", async () => {
    // scale({ width: 640, height: 640 }), fit("contain")
    // → verify output is 640x640 (padded)
  });

  it("scales with cover fit (crop)", async () => {
    // scale({ width: 360, height: 360 }), fit("cover")
    // → verify output is 360x360
  });

  // Crop
  it("crops to aspect ratio", async () => {
    // crop({ aspectRatio: "1:1" }) on 640x360 → verify square output
  });

  it("crops to explicit dimensions", async () => {
    // crop({ width: 320, height: 180 }) → verify exact
  });

  // Ken Burns
  it("creates Ken Burns video from image", async () => {
    // kenBurns({ duration: 3, startZoom: 1, endZoom: 1.5, ... }) on image-1080p.jpg
    // → verify video output with ~3s duration, correct resolution
  });

  // Speed
  it("doubles speed", async () => {
    // speed(2) on 2s video → verify ~1s duration
  });

  it("halves speed", async () => {
    // speed(0.5) on 2s video → verify ~4s duration
  });

  it("quadruples speed (chained atempo)", async () => {
    // speed(4) on 2s video → verify ~0.5s duration
  });

  // Trim
  it("trims start", async () => {
    // trimStart(1) on 2s video → verify ~1s duration
  });

  it("trims with duration", async () => {
    // trimStart(0.5), duration(1) → verify ~1s duration
  });

  // Loop
  it("loops video", async () => {
    // loop(3) on 2s video → verify ~6s duration
  });

  // Rotate
  it("rotates 90 degrees", async () => {
    // rotate(90) on 640x360 → verify 360x640
  });

  // Flip
  it("flips horizontally", async () => {
    // flipH() → verify output valid, same dimensions
  });

  it("flips vertically", async () => {
    // flipV() → verify output valid, same dimensions
  });

  // Pad
  it("pads to larger dimensions", async () => {
    // pad({ width: 800, height: 600 }) on 640x360 → verify 800x600
  });

  // FPS
  it("changes frame rate", async () => {
    // fps(15) → verify output frame rate is ~15
  });

  // Reverse
  it("reverses video", async () => {
    // reverse() → verify output valid, same duration
  });
});
```

---

## Verification Checklist

```bash
# Build
pnpm build

# Type check
pnpm typecheck

# Generate new fixture
cd __tests__/fixtures && bash generate.sh

# Run builder tests (Tier 1)
pnpm vitest run __tests__/builder/extract.test.ts
pnpm vitest run __tests__/builder/transform.test.ts

# Run E2E tests (Tier 2)
pnpm vitest run __tests__/integration/extract.e2e.test.ts
pnpm vitest run __tests__/integration/transform.e2e.test.ts

# Run all tests
pnpm test

# Lint
pnpm check
```

# Design: Phase 7 — Export, Overlay, Text Operation Builders

## Overview

Phase 7 adds three operation builders to `src/operations/`:
- **ExportBuilder** — Final video export with encoding presets, codec configuration, 2-pass, metadata
- **OverlayBuilder** — Video compositing: image/video overlays, PiP, watermarks, chroma key
- **TextBuilder** — Drawtext rendering: styled text, scrolling, counters

All three follow the established builder pattern (factory function → internal state → validate → buildArgs → execute/tryExecute) and reuse existing types from `src/types/` and encoding utilities from `src/encoding/`.

New fixture required: `__tests__/fixtures/image-small.png` (200×200 PNG with alpha).

---

## Implementation Units

### Unit 1: ExportBuilder

**File**: `src/operations/export.ts`

```typescript
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { execute } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import { encoderConfigToArgs, audioEncoderConfigToArgs } from "../encoding/config.ts";
import { getPreset } from "../encoding/presets.ts";
import type {
  AudioCodec,
  ContainerFormat,
  EncodingPreset,
  ExportPreset,
  HwAccelMode,
  PixelFormat,
  QualityTier,
  VideoCodec,
} from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { ExportResult, OperationResult } from "../types/results.ts";
import { missingFieldError, wrapTryExecute } from "../util/builder-helpers.ts";
import { createTempFile } from "../util/tempfile.ts";

interface ExportState {
  videoInputPath?: string;
  audioInputPath?: string;
  inputPath?: string;
  presetName?: ExportPreset;
  qualityTierValue?: QualityTier;
  videoCodecValue?: VideoCodec;
  crfValue?: number;
  videoBitrateValue?: string;
  maxVideoBitrateValue?: string;
  encodingPresetValue?: EncodingPreset;
  pixelFormatValue?: PixelFormat;
  profileValue?: string;
  levelValue?: string;
  tuneValue?: string;
  audioCodecValue?: AudioCodec;
  audioBitrateValue?: string;
  audioSampleRateValue?: number;
  audioChannelsValue?: number;
  faststartEnabled?: boolean;
  formatValue?: ContainerFormat;
  hwAccelMode?: HwAccelMode;
  twoPassEnabled?: boolean;
  mapStreams?: string[];
  outputArgsValue?: string[];
  inputArgsValue?: string[];
  metadataValue?: Record<string, string>;
  chaptersValue?: Array<{ start: number; end: number; title: string }>;
  outputPath?: string;
}

function validateExportState(
  state: ExportState,
): asserts state is ExportState & { outputPath: string } {
  if (!state.inputPath && !state.videoInputPath) throw missingFieldError("input or videoInput");
  if (!state.outputPath) throw missingFieldError("output");
}

function buildArgs(state: ExportState, passNumber?: 1 | 2, passLogFile?: string): string[] {
  // ... implementation details below
}

export interface ExportBuilder {
  videoInput(path: string): this;
  audioInput(path: string): this;
  input(path: string): this;
  preset(preset: ExportPreset): this;
  qualityTier(tier: QualityTier): this;
  videoCodec(codec: VideoCodec): this;
  crf(value: number): this;
  videoBitrate(bitrate: string): this;
  maxVideoBitrate(bitrate: string): this;
  encodingPreset(preset: EncodingPreset): this;
  pixelFormat(format: PixelFormat): this;
  profile(profile: string): this;
  level(level: string): this;
  tune(tune: string): this;
  audioCodec(codec: AudioCodec): this;
  audioBitrate(bitrate: string): this;
  audioSampleRate(rate: number): this;
  audioChannels(count: number): this;
  faststart(enabled?: boolean): this;
  format(fmt: ContainerFormat): this;
  hwAccel(mode: HwAccelMode): this;
  twoPass(enabled?: boolean): this;
  map(streams: string[]): this;
  outputArgs(args: string[]): this;
  inputArgs(args: string[]): this;
  metadata(meta: Record<string, string>): this;
  chapters(chapters: Array<{ start: number; end: number; title: string }>): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ExportResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ExportResult>>;
}

export function exportVideo(): ExportBuilder;
```

**Implementation Notes**:

1. **Preset application**: When `preset()` is called, look up via `getPreset(name)`. The preset's video/audio config is used as defaults — explicit builder calls override preset values. Apply preset in `buildArgs()`, not at `.preset()` call time, so overrides work regardless of call order.

2. **Argument construction order** in `buildArgs()`:
   ```
   -y
   [inputArgs]
   -i videoInput (or -i input)
   [-i audioInput]
   [video codec args from preset/explicit]
   [audio codec args from preset/explicit]
   [-movflags +faststart]  (for mp4/mov, default true)
   [-f format]
   [-map streams...]
   [-metadata key=value...]
   [chapters via metadata file]
   [outputArgs]
   output (or /dev/null for pass 1)
   ```

3. **Video codec resolution** (priority order):
   - Explicit `videoCodecValue` + individual settings (crf, preset, profile, etc.)
   - `qualityTierValue` → `buildEncoderConfig(tier, hwAccelMode ?? 'cpu')`
   - `presetName` → `getPreset(name).video`
   - Default: `DEFAULT_VIDEO_CODEC_ARGS`

4. **Audio codec resolution** (priority order):
   - Explicit `audioCodecValue` + individual audio settings
   - `presetName` → `getPreset(name).audio`
   - Default: `DEFAULT_AUDIO_CODEC_ARGS`

5. **Two-pass encoding**:
   - `toArgs()` returns pass-2 args (the "normal" command). Throws error explaining two-pass requires `execute()`.
   - `execute()` runs two ffmpeg processes:
     - Pass 1: `buildArgs(state, 1, passLogFile)` → output `/dev/null`, `-an` (no audio), adds `-pass 1 -passlogfile <tmpfile>`
     - Pass 2: `buildArgs(state, 2, passLogFile)` → real output, adds `-pass 2 -passlogfile <tmpfile>`
     - Clean up passlog temp files after completion.

6. **Faststart**: Default `true` for mp4/mov containers. Adds `-movflags +faststart`.

7. **Chapters**: Write a temporary ffmetadata file with chapter entries, add `-i <metafile> -map_metadata 1` to args. Clean up after execution.

8. **Stream mapping**: If `mapStreams` is set, add `-map <stream>` for each entry. Otherwise, when `videoInput` + `audioInput` are separate, add `-map 0:v:0 -map 1:a:0`.

9. **Format**: If `formatValue` is set, add `-f <format>`. Otherwise infer from output extension.

10. **execute() return**: Probe output file, extract `videoCodec`, `audioCodec`, `duration`, `sizeBytes`. Parse last progress callback for encoding stats.

**Acceptance Criteria**:
- [ ] `exportVideo().input(v).preset('youtube_hd').output(o).toArgs()` produces correct H.264 + AAC args with `-movflags +faststart`
- [ ] Preset values are overridable by explicit builder calls
- [ ] `videoInput()` + `audioInput()` produces two `-i` flags with correct `-map`
- [ ] `twoPass(true)` causes `execute()` to run ffmpeg twice
- [ ] `toArgs()` with `twoPass(true)` throws error explaining execute() is required
- [ ] `faststart()` defaults true for mp4, false for other containers
- [ ] `metadata({ title: 'Test' })` produces `-metadata title=Test`
- [ ] `chapters()` creates ffmetadata temp file and maps it
- [ ] `map(['0:v:0', '0:a:1'])` produces correct `-map` flags
- [ ] Missing input/output throws `FFmpegError`
- [ ] `format('mkv')` produces `-f matroska`
- [ ] `crf()`, `videoBitrate()`, `encodingPreset()`, `profile()`, `level()`, `tune()` each produce correct flags
- [ ] `outputArgs(['-shortest'])` appends to end before output path

---

### Unit 2: OverlayBuilder

**File**: `src/operations/overlay.ts`

```typescript
import { statSync } from "node:fs";
import { execute } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OverlayResult, OperationResult } from "../types/results.ts";
import type { BlendMode, OverlayAnchor, OverlayPosition } from "../types/filters.ts";
import {
  DEFAULT_VIDEO_CODEC_ARGS,
  DEFAULT_AUDIO_CODEC_ARGS,
  missingFieldError,
  wrapTryExecute,
} from "../util/builder-helpers.ts";

interface OverlayConfig {
  input: string;
  position?: OverlayPosition;
  anchor?: OverlayAnchor;
  margin?: number | { x?: number; y?: number };
  scale?: { width?: number; height?: number };
  opacity?: number;
  startTime?: number;
  endTime?: number;
  duration?: number;
  fadeIn?: number;
  fadeOut?: number;
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

interface PipConfig {
  input: string;
  position: OverlayAnchor;
  scale: number;
  margin?: number;
  borderWidth?: number;
  borderColor?: string;
}

interface WatermarkConfig {
  input: string;
  position: OverlayAnchor;
  opacity?: number;
  margin?: number;
  scale?: number;
}

interface OverlayState {
  basePath?: string;
  overlays: OverlayConfig[];
  outputPath?: string;
}

function validateOverlayState(
  state: OverlayState,
): asserts state is OverlayState & { basePath: string; outputPath: string } {
  if (!state.basePath) throw missingFieldError("base");
  if (state.overlays.length === 0) throw missingFieldError("addOverlay");
  if (!state.outputPath) throw missingFieldError("output");
}

function anchorToPosition(anchor: OverlayAnchor, margin: { x: number; y: number }): OverlayPosition {
  // ... maps anchor names to ffmpeg overlay position expressions
}

function buildFilterComplex(state: OverlayState): string {
  // ... builds the filter_complex string for all overlays
}

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

export function overlay(): OverlayBuilder;
```

**Implementation Notes**:

1. **Anchor → position mapping** (`anchorToPosition`):
   ```
   top-left:      { x: margin.x, y: margin.y }
   top-center:    { x: "(W-w)/2", y: margin.y }
   top-right:     { x: "W-w-{margin.x}", y: margin.y }
   center-left:   { x: margin.x, y: "(H-h)/2" }
   center:        { x: "(W-w)/2", y: "(H-h)/2" }
   center-right:  { x: "W-w-{margin.x}", y: "(H-h)/2" }
   bottom-left:   { x: margin.x, y: "H-h-{margin.y}" }
   bottom-center: { x: "(W-w)/2", y: "H-h-{margin.y}" }
   bottom-right:  { x: "W-w-{margin.x}", y: "H-h-{margin.y}" }
   ```
   Default margin: `{ x: 0, y: 0 }`.

2. **Filter complex construction** — each overlay is a chained stage:
   ```
   Input labels: [0:v] is base, [1:v] is first overlay, [2:v] is second, etc.

   For each overlay i:
     - Start with overlay input label [i+1:v]
     - Apply scale filter if config.scale is set: scale=w:h
     - Apply chromaKey: colorkey=color:similarity:blend
     - Apply colorKey: colorkey=color:similarity:blend
     - Apply opacity: format=rgba,colorchannelmixer=aa=opacity
     - Chain into overlay filter on the accumulated base:
       [prev][ov_i]overlay=x:y[:enable=between(t,start,end)]
     - If fadeIn/fadeOut, use overlay enable + alpha manipulation
   ```

3. **Overlay enable expressions**:
   - `startTime` + `endTime`: `enable='between(t,start,end)'`
   - `startTime` + `duration`: `endTime = startTime + duration`
   - No time constraint: overlay always visible

4. **Opacity**: Apply to overlay input before compositing:
   ```
   [1:v]format=rgba,colorchannelmixer=aa=0.5[ov0];
   ```

5. **Chroma key**: Apply `chromakey` filter to overlay input before compositing:
   ```
   [1:v]chromakey=0x00FF00:0.3:0.1[ov0];
   ```

6. **Color key**: Same as chroma key but uses `colorkey` filter.

7. **Scale overlay**: Apply before compositing:
   ```
   [1:v]scale=200:100[ov0];
   ```

8. **Blend mode**: Use `blend=all_mode=<mode>` filter. Note: FFmpeg's `overlay` filter doesn't natively support blend modes. For blend mode support, composit via `blend` filter instead of `overlay` when blendMode is set and not 'normal'. This is complex — for v1, support `blendMode: 'normal'` only (default overlay behavior) and throw for other modes with a clear message.

9. **pip() shorthand**: Converts to `addOverlay()` with:
   - `anchor` = config.position
   - `scale` = `{ width: Math.round(baseWidth * config.scale) }` — but we don't know base dimensions at build time. Use expression-based scale: `scale=iw*{scale}:ih*{scale}` on the overlay input.
   - `margin` = config.margin ?? 10
   - Border: if borderWidth set, add `pad=iw+2*bw:ih+2*bw:bw:bw:borderColor` on the overlay before compositing.

10. **watermark() shorthand**: Converts to `addOverlay()` with:
    - `anchor` = config.position
    - `opacity` = config.opacity ?? 0.5
    - `margin` = config.margin ?? 10
    - `scale` = if config.scale set, `{ width: Math.round(200 * config.scale) }` — actually, use expression: `scale=iw*{scale}:ih*{scale}`

11. **Argument construction**:
    ```
    -y
    -i basePath
    -i overlay1.input
    [-i overlay2.input ...]
    -filter_complex "filterComplexString"
    -map [vout] -map 0:a?
    DEFAULT_VIDEO_CODEC_ARGS
    DEFAULT_AUDIO_CODEC_ARGS
    output
    ```
    Audio is copied from base via `-map 0:a?` (the `?` makes it optional if base has no audio).

12. **execute() return**: Probe output for duration, sizeBytes.

**Acceptance Criteria**:
- [ ] `overlay().base(v).addOverlay({ input: img }).output(o).toArgs()` produces valid `-filter_complex` with overlay filter
- [ ] Anchor positioning produces correct x/y expressions for all 9 positions
- [ ] Margin is applied correctly to anchor-based positions
- [ ] `scale` on overlay produces `scale=w:h` in filter chain before overlay
- [ ] `opacity` produces `colorchannelmixer=aa=<value>` in filter chain
- [ ] `startTime`/`endTime` produces `enable='between(t,start,end)'`
- [ ] `chromaKey` produces `chromakey` filter before overlay
- [ ] `colorKey` produces `colorkey` filter before overlay
- [ ] `pip()` shorthand produces correct overlay with scaled input
- [ ] `watermark()` shorthand produces overlay with opacity and margin
- [ ] Multiple overlays chain correctly (each stage feeds into next)
- [ ] Missing base/overlay/output throws `FFmpegError`
- [ ] Audio from base is preserved via `-map 0:a?`

---

### Unit 3: TextBuilder

**File**: `src/operations/text.ts`

```typescript
import { statSync } from "node:fs";
import { execute } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { TextResult, OperationResult } from "../types/results.ts";
import type { OverlayAnchor } from "../types/filters.ts";
import {
  DEFAULT_VIDEO_CODEC_ARGS,
  DEFAULT_AUDIO_CODEC_ARGS,
  missingFieldError,
  wrapTryExecute,
} from "../util/builder-helpers.ts";

interface TextStyle {
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

interface TextConfig {
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

interface ScrollConfig {
  text: string;
  style: TextStyle;
  speed?: number;
  direction?: "up" | "down" | "left" | "right";
}

interface CounterConfig {
  start: number;
  end: number;
  style: TextStyle;
  position: { x: number | string; y: number | string };
  format?: string;
}

interface TextState {
  inputPath?: string;
  textConfigs: TextConfig[];
  scrollConfig?: ScrollConfig;
  counterConfig?: CounterConfig;
  outputPath?: string;
}

function validateTextState(
  state: TextState,
): asserts state is TextState & { inputPath: string; outputPath: string } {
  if (!state.inputPath) throw missingFieldError("input");
  if (state.textConfigs.length === 0 && !state.scrollConfig && !state.counterConfig) {
    throw missingFieldError("addText, scroll, or counter");
  }
  if (!state.outputPath) throw missingFieldError("output");
}

function escapeDrawtext(text: string): string {
  // FFmpeg drawtext escaping: escape :, \, ', and ;
}

function anchorToDrawtextXY(anchor: OverlayAnchor, margin: number): { x: string; y: string } {
  // Maps anchor to drawtext x/y expressions using text_w, text_h, w, h
}

function buildDrawtextFilter(config: TextConfig): string {
  // Builds a single drawtext=... filter string
}

function buildArgs(state: TextState): string[] {
  // Builds full ffmpeg argument array
}

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

export function text(): TextBuilder;
```

**Implementation Notes**:

1. **Drawtext escaping** (`escapeDrawtext`):
   FFmpeg drawtext requires specific escaping. The text value must escape: `:` → `\:`, `'` → `'\''` (close, escape, reopen), `\` → `\\`, `;` → `\;`, `[` → `\[`, `]` → `\]`. Use the three-level escaping strategy:
   ```typescript
   function escapeDrawtext(text: string): string {
     return text
       .replace(/\\/g, "\\\\\\\\")  // \ → \\\\
       .replace(/:/g, "\\:")         // : → \:
       .replace(/'/g, "'\\\\\\''")   // ' → '\\\'
       .replace(/;/g, "\\;")         // ; → \;
       .replace(/\[/g, "\\[")        // [ → \[
       .replace(/\]/g, "\\]");       // ] → \]
   }
   ```
   Note: The exact escaping depends on how args are passed. Since we pass via `execute()` which uses `spawn()` (not shell), we only need FFmpeg-level escaping, not shell escaping.

2. **Anchor → drawtext x/y** (`anchorToDrawtextXY`):
   Drawtext uses `w` (video width), `h` (video height), `text_w`/`tw`, `text_h`/`th`:
   ```
   top-left:      x=margin, y=margin
   top-center:    x=(w-text_w)/2, y=margin
   top-right:     x=w-text_w-margin, y=margin
   center-left:   x=margin, y=(h-text_h)/2
   center:        x=(w-text_w)/2, y=(h-text_h)/2
   center-right:  x=w-text_w-margin, y=(h-text_h)/2
   bottom-left:   x=margin, y=h-text_h-margin
   bottom-center: x=(w-text_w)/2, y=h-text_h-margin
   bottom-right:  x=w-text_w-margin, y=h-text_h-margin
   ```
   Default margin: 10.

3. **buildDrawtextFilter** — construct `drawtext=key=val:key=val`:
   ```
   Required: text='escaped' OR textfile='path'
   Position: x=...:y=...
   Style mappings:
     font → fontfamily
     fontFile → fontfile
     fontSize → fontsize
     fontColor → fontcolor
     fontColorExpr → fontcolor_expr
     borderWidth → borderw
     borderColor → bordercolor
     shadowX → shadowx
     shadowY → shadowy
     shadowColor → shadowcolor
     box → box=1
     boxColor → boxcolor
     boxBorderWidth → boxborderw
     lineSpacing → line_spacing
     alpha → alpha (expression or value)
   Time range:
     enable='between(t,startTime,endTime)'
   Timecode:
     timecode='HH:MM:SS:FF':timecode_rate=rate
   Custom enable:
     enable='expression'
   Text alignment (via x expression adjustment):
     textAlign 'center' → default x expression
     textAlign 'right' → x adjusted for right alignment
   Reload:
     reload=1:textfile=path  (when reloadInterval set)
   ```

4. **Multiple text elements**: Each `addText()` config becomes a separate `drawtext` filter. They are chained as a video filter chain via `-vf`:
   ```
   -vf "drawtext=...,drawtext=...,drawtext=..."
   ```

5. **Scroll implementation**: Uses drawtext with animated y position:
   - `direction: 'up'`: `y=h-t*{speed}` (text scrolls upward)
   - `direction: 'down'`: `y=-text_h+t*{speed}`
   - `direction: 'left'`: `x=w-t*{speed}`, `y=(h-text_h)/2`
   - `direction: 'right'`: `x=-text_w+t*{speed}`, `y=(h-text_h)/2`
   - Default speed: 100 pixels/sec
   - Default direction: `'up'`

6. **Counter implementation**: Uses drawtext with `text='%{eif\\:clip(n*{step}+{start}\\,{min}\\,{max})\\:d}'` expression where step is calculated from fps. Actually, simpler approach — use `text='%{eif\:trunc({start}+t*({end}-{start})/{duration})\:d{format}}'`.
   Better approach: use the `%{frame_num}` or expression-based text. For a counter from `start` to `end` over the video duration:
   ```
   text='%{eif\: {start} + (t / {duration}) * ({end} - {start}) \:d}'
   ```
   Where `duration` is resolved from input probe.
   For `format` like `'%02d'`: `%{eif\: expr \:d\:2}` (the eif function supports width).

7. **Argument construction**:
   ```
   -y
   -i inputPath
   -vf "drawtext=...[,drawtext=...]"
   DEFAULT_VIDEO_CODEC_ARGS
   -c:a copy
   output
   ```
   Audio is stream-copied since text only affects video.

8. **execute() return**: Probe output for duration, sizeBytes.

**Acceptance Criteria**:
- [ ] `text().input(v).addText({ text: 'Hello', style: {} }).output(o).toArgs()` produces valid `-vf drawtext=...` args
- [ ] Text with special characters (`:`, `'`, `\`) is properly escaped
- [ ] Anchor positioning produces correct drawtext x/y expressions for all 9 positions
- [ ] `box: true` with `boxColor` produces `box=1:boxcolor=...`
- [ ] `startTime`/`endTime` produces `enable='between(t,start,end)'`
- [ ] Multiple `addText()` calls produce comma-separated drawtext filters
- [ ] `scroll()` produces drawtext with animated position expression
- [ ] `counter()` produces drawtext with eif expression
- [ ] `fontFile` path produces `fontfile=...`
- [ ] Missing input/text/output throws `FFmpegError`
- [ ] Audio is stream-copied (`-c:a copy`)
- [ ] `timecode` produces `timecode=...:timecode_rate=...`

---

### Unit 4: Fixture Generation

**File**: `__tests__/fixtures/generate.sh` (append to existing)

```bash
# image-small.png — 200x200 PNG with alpha channel (for overlay/watermark tests)
ffmpeg -f lavfi -i "color=c=red:size=200x200:duration=1,format=rgba" \
  -frames:v 1 -y image-small.png
```

**Implementation Notes**:
- Generates a 200×200 solid red PNG with alpha channel
- Used by overlay and watermark tests
- Keep under fixture size budget

**Acceptance Criteria**:
- [ ] `image-small.png` exists, is 200×200, and has RGBA pixel format

---

### Unit 5: Test Helpers Update

**File**: `__tests__/helpers.ts` (add to FIXTURES object)

```typescript
export const FIXTURES = {
  // ... existing
  imageSmall: join(FIXTURES_DIR, "image-small.png"),
};
```

**Acceptance Criteria**:
- [ ] `FIXTURES.imageSmall` is available in test helpers

---

### Unit 6: Barrel Export Update

**File**: `src/index.ts` (add exports)

```typescript
// Add to operations exports:
export { exportVideo } from "./operations/export.ts";
export type { ExportBuilder } from "./operations/export.ts";

export { overlay } from "./operations/overlay.ts";
export type { OverlayBuilder } from "./operations/overlay.ts";

export { text } from "./operations/text.ts";
export type { TextBuilder } from "./operations/text.ts";
```

**Acceptance Criteria**:
- [ ] `exportVideo`, `overlay`, `text` and their builder types are importable from `@ffmpeg-sdk/core`

---

## Implementation Order

1. **Unit 4**: Generate `image-small.png` fixture
2. **Unit 5**: Update test helpers with new fixture path
3. **Unit 1**: ExportBuilder (most self-contained, uses existing encoding infrastructure)
4. **Unit 2**: OverlayBuilder (needs the fixture for tests)
5. **Unit 3**: TextBuilder (most complex escaping, independent of others)
6. **Unit 6**: Barrel export update (after all builders exist)

---

## Testing

### Builder Tests: `__tests__/builder/export.test.ts`

```typescript
describe("ExportBuilder", () => {
  // Preset resolution
  it("applies youtube_hd preset defaults");
  it("allows overriding preset values with explicit calls");

  // Video codec args
  it("produces -c:v libx264 for default");
  it("produces -crf flag from crf()");
  it("produces -b:v flag from videoBitrate()");
  it("produces -maxrate flag from maxVideoBitrate()");
  it("produces -preset flag from encodingPreset()");
  it("produces -pix_fmt flag from pixelFormat()");
  it("produces -profile:v flag from profile()");
  it("produces -level flag from level()");
  it("produces -tune flag from tune()");

  // Audio codec args
  it("produces -c:a aac for default");
  it("produces -b:a flag from audioBitrate()");
  it("produces -ar flag from audioSampleRate()");
  it("produces -ac flag from audioChannels()");

  // Container/format
  it("produces -movflags +faststart for mp4");
  it("does not produce faststart for mkv");
  it("produces -f matroska for format('mkv')");
  it("produces -f webm for format('webm')");

  // Inputs
  it("produces separate -i flags for videoInput + audioInput");
  it("produces -map flags for separate inputs");
  it("produces custom -map flags from map()");

  // Metadata
  it("produces -metadata flags from metadata()");

  // Extra args
  it("appends outputArgs before output path");
  it("prepends inputArgs before -i");

  // Two-pass
  it("throws error for toArgs() with twoPass enabled");

  // Validation
  it("throws when input is missing");
  it("throws when output is missing");
});
```

### Builder Tests: `__tests__/builder/overlay.test.ts`

```typescript
describe("OverlayBuilder", () => {
  // Position calculation
  it("maps top-left anchor to x=0:y=0");
  it("maps center anchor to (W-w)/2:(H-h)/2 expressions");
  it("maps bottom-right anchor with margin");
  it("uses explicit x/y position when provided");

  // Filter complex construction
  it("produces -filter_complex with overlay filter");
  it("chains multiple overlays sequentially");
  it("applies scale filter before overlay");
  it("applies opacity via colorchannelmixer");
  it("applies chromakey filter");
  it("applies colorkey filter");
  it("applies time-based enable expression");

  // Shorthands
  it("pip() produces scaled overlay with anchor position");
  it("watermark() produces overlay with opacity");

  // Input mapping
  it("produces correct -i flags for base + overlays");
  it("maps base audio via -map 0:a?");

  // Validation
  it("throws when base is missing");
  it("throws when no overlays added");
  it("throws when output is missing");
});
```

### Builder Tests: `__tests__/builder/text.test.ts`

```typescript
describe("TextBuilder", () => {
  // Drawtext construction
  it("produces -vf drawtext=text=... for basic text");
  it("escapes colons in text content");
  it("escapes single quotes in text content");
  it("escapes backslashes in text content");

  // Positioning
  it("maps center anchor to drawtext x/y expressions");
  it("maps bottom-right anchor with margin");
  it("uses explicit x/y when provided");

  // Style
  it("maps fontSize to fontsize parameter");
  it("maps fontColor to fontcolor parameter");
  it("maps fontFile to fontfile parameter");
  it("maps borderWidth/borderColor to borderw/bordercolor");
  it("maps shadowX/shadowY/shadowColor to shadow params");
  it("maps box/boxColor/boxBorderWidth to box params");

  // Time range
  it("produces enable=between(t,...) for startTime/endTime");

  // Multiple texts
  it("chains multiple drawtext filters with commas");

  // Scroll
  it("produces animated y expression for scroll up");
  it("produces animated x expression for scroll left");

  // Counter
  it("produces eif expression for counter");

  // Timecode
  it("produces timecode and timecode_rate params");

  // Audio handling
  it("stream-copies audio with -c:a copy");

  // Validation
  it("throws when input is missing");
  it("throws when no text/scroll/counter added");
  it("throws when output is missing");
});
```

### E2E Tests: `__tests__/integration/export.e2e.test.ts`

```typescript
describeWithFFmpeg("exportVideo()", () => {
  it("exports with youtube_hd preset", async () => {
    // Verify: H.264, AAC, yuv420p, faststart, correct duration
  });

  it("exports with youtube_4k preset");
  it("exports with youtube_draft preset");

  it("exports with separate video + audio inputs", async () => {
    // Use videoInput(video) + audioInput(audio)
    // Verify: both streams present
  });

  it("exports with custom CRF", async () => {
    // Compare file sizes between CRF 18 and CRF 28
  });

  it("exports as MKV format", async () => {
    // Verify: format is matroska
  });

  it("exports as WebM with VP9 + Opus", async () => {
    // videoCodec('libvpx-vp9'), audioCodec('libopus')
    // Verify: correct codecs
  });

  it("applies faststart for mp4", async () => {
    // Verify: moov atom position (probe or file structure check)
  });

  it("writes metadata tags", async () => {
    // Verify: probe shows metadata
  });

  it("maps specific streams", async () => {
    // Verify: only mapped streams present
  });

  it("performs two-pass encoding", async () => {
    // Verify: output valid, no temp files remain
  }, 60000);
});
```

### E2E Tests: `__tests__/integration/overlay.e2e.test.ts`

```typescript
describeWithFFmpeg("overlay()", () => {
  it("overlays image on video", async () => {
    // Verify: output valid, same duration as base
  });

  it("applies overlay with opacity", async () => {
    // Verify: output valid
  });

  it("applies overlay with time range", async () => {
    // Verify: output valid, duration matches base
  });

  it("creates picture-in-picture", async () => {
    // pip() with videoShort as overlay on videoH264
    // Verify: output dimensions = base dimensions
  });

  it("applies chroma key", async () => {
    // Verify: output valid
  });
});
```

### E2E Tests: `__tests__/integration/text.e2e.test.ts`

```typescript
describeWithFFmpeg("text()", () => {
  it("renders basic drawtext", async () => {
    // Verify: output valid, same duration as input
  });

  it("renders text with box background", async () => {
    // Verify: output valid
  });

  it("renders text with time range", async () => {
    // Verify: output valid
  });

  it("renders multiple text elements", async () => {
    // Verify: output valid
  });
});
```

---

## Verification Checklist

```bash
# Build succeeds
pnpm build

# Type check passes
pnpm typecheck

# Lint passes
pnpm check

# Generate new fixture
cd __tests__/fixtures && bash generate.sh

# Run builder tests
pnpm vitest run __tests__/builder/export.test.ts
pnpm vitest run __tests__/builder/overlay.test.ts
pnpm vitest run __tests__/builder/text.test.ts

# Run E2E tests
pnpm vitest run __tests__/integration/export.e2e.test.ts
pnpm vitest run __tests__/integration/overlay.e2e.test.ts
pnpm vitest run __tests__/integration/text.e2e.test.ts

# Run all tests 3x for flakiness check
pnpm test && pnpm test && pnpm test
```

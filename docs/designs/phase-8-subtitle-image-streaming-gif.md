# Design: Phase 8 — Subtitle, Image, Streaming, GIF Operation Builders

## Overview

Phase 8 adds the four remaining operation builders to `src/operations/`:
- **SubtitleBuilder** — Soft sub embedding (muxing), hard burn, extract, format conversion
- **ImageBuilder** — Image sequences, format conversion, image-to-video, test patterns, solid color, silent audio
- **HlsBuilder / DashBuilder** — HLS and DASH adaptive streaming output
- **GifBuilder** — Animated GIF creation with 1-pass/2-pass palette optimization

All four follow the established builder pattern (factory function → internal state → validate → buildArgs → execute/tryExecute) and reuse existing types from `src/types/` and helpers from `src/util/builder-helpers.ts`.

New types required: `SubtitleFormat` in `src/types/codecs.ts`.

New fixtures required: `subtitle.srt`, `chapters.mkv`.

---

## Implementation Units

### Unit 1: SubtitleFormat Type

**File**: `src/types/codecs.ts` (append)

```typescript
export type SubtitleFormat = "srt" | "ass" | "ssa" | "webvtt" | "dvbsub" | "pgs" | "mov_text";
```

**File**: `src/types/index.ts` (add to codecs re-export)

```typescript
export type {
  // ... existing
  SubtitleFormat,
} from "./codecs.ts";
```

**File**: `src/index.ts` (add to type exports)

```typescript
// In the type export block, add:
SubtitleFormat,
```

**Acceptance Criteria**:
- [ ] `SubtitleFormat` is importable from `@ffmpeg-sdk/core`

---

### Unit 2: SubtitleBuilder

**File**: `src/operations/subtitle.ts`

```typescript
import { statSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { SubtitleFormat } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, SubtitleResult } from "../types/results.ts";
import {
  DEFAULT_AUDIO_CODEC_ARGS,
  DEFAULT_VIDEO_CODEC_ARGS,
  missingFieldError,
  wrapTryExecute,
} from "../util/builder-helpers.ts";

// --- Config Types ---

interface SoftSubConfig {
  path: string;
  language?: string;
  title?: string;
  default?: boolean;
  forced?: boolean;
}

interface HardBurnConfig {
  path: string;
  forceStyle?: string;
  charEncoding?: string;
}

interface ExtractSubConfig {
  streamIndex: number;
  format: SubtitleFormat;
}

interface ConvertSubConfig {
  inputPath: string;
  outputFormat: SubtitleFormat;
}

// --- Internal State ---

type SubtitleMode =
  | { type: "softSub"; configs: SoftSubConfig[] }
  | { type: "hardBurn"; config: HardBurnConfig }
  | { type: "extract"; config: ExtractSubConfig }
  | { type: "convert"; config: ConvertSubConfig };

interface SubtitleState {
  inputPath?: string;
  mode?: SubtitleMode;
  outputPath?: string;
}

// --- Validation ---

function validateSubtitleState(
  state: SubtitleState,
): asserts state is SubtitleState & { outputPath: string; mode: SubtitleMode } {
  if (!state.inputPath && state.mode?.type !== "convert") throw missingFieldError("input");
  if (!state.mode) throw missingFieldError("softSub, hardBurn, extract, or convert");
  if (!state.outputPath) throw missingFieldError("output");
}

// --- Builder Interface ---

export interface SubtitleBuilder {
  input(path: string): this;
  softSub(config: SoftSubConfig): this;
  hardBurn(config: HardBurnConfig): this;
  extract(config: ExtractSubConfig): this;
  convert(config: ConvertSubConfig): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<SubtitleResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<SubtitleResult>>;
}

export type { SoftSubConfig, HardBurnConfig, ExtractSubConfig, ConvertSubConfig };

export function subtitle(): SubtitleBuilder;
```

**Implementation Notes**:

1. **Mode exclusivity**: The builder supports one primary mode at a time. Calling `softSub()` multiple times accumulates subtitle tracks. Calling `hardBurn()`, `extract()`, or `convert()` replaces any previous mode. This is enforced by setting `state.mode` — `softSub` accumulates in its `configs` array, others replace entirely.

2. **Soft sub (muxing)** — embeds subtitle files as streams in the output container:
   ```
   -y
   -i inputPath
   -i sub1.srt
   [-i sub2.ass ...]
   -c:v copy -c:a copy
   -c:s mov_text  (for mp4) | -c:s srt (for mkv) | -c:s webvtt (for webm)
   -map 0:v -map 0:a
   -map 1:s [-map 2:s ...]
   [-metadata:s:s:0 language=eng]
   [-metadata:s:s:0 title="English"]
   [-disposition:s:0 default]
   [-disposition:s:0 forced]
   output
   ```
   Subtitle codec selection based on output container:
   - `.mp4` / `.mov` → `mov_text`
   - `.mkv` → `srt` (or `ass` if input is `.ass`/`.ssa`)
   - `.webm` → `webvtt`
   - Otherwise: `copy` (let ffmpeg decide)

3. **Hard burn** — burns subtitles into the video stream using the `subtitles` or `ass` filter:
   ```
   -y
   -i inputPath
   -vf "subtitles=path[.escaped]:force_style='forceStyle'[:charenc=charEncoding]"
   DEFAULT_VIDEO_CODEC_ARGS
   -c:a copy
   output
   ```
   The subtitle path must be escaped for the filter: replace `\` with `/`, escape `:` and `'` and `[` and `]` with `\`. Use the `subtitles` filter (works for SRT, ASS, SSA). For PGS/DVB bitmap subs, use `overlay` filter approach instead — but for v1, support text-based formats only (SRT, ASS, SSA, WebVTT) and throw for bitmap formats in hardBurn mode.

4. **Extract** — extracts a subtitle stream to a standalone file:
   ```
   -y
   -i inputPath
   -map 0:s:{streamIndex - adjusted}
   -c:s srt|ass|webvtt  (based on config.format)
   output
   ```
   The stream index in the `-map` refers to the subtitle stream index. Use `-map 0:s:N` where N is a 0-based subtitle stream index. If `config.streamIndex` refers to the absolute stream index, use `-map 0:{streamIndex}`.

   Decision: Use absolute stream index (`-map 0:{streamIndex}`) to match what `probe()` returns in `StreamInfo.index`.

5. **Convert** — converts between subtitle formats:
   ```
   -y
   -i config.inputPath
   -c:s srt|ass|webvtt  (based on config.outputFormat)
   output
   ```
   Does not use `state.inputPath` — uses `config.inputPath` instead. The `input()` call is not required for convert mode.

6. **Subtitle path escaping** for the `subtitles` filter:
   ```typescript
   function escapeSubtitlePath(path: string): string {
     return path
       .replace(/\\/g, "/")        // backslash → forward slash
       .replace(/:/g, "\\:")       // escape colons
       .replace(/'/g, "\\'")       // escape quotes
       .replace(/\[/g, "\\[")     // escape brackets
       .replace(/\]/g, "\\]");
   }
   ```

7. **execute() return**: `{ outputPath, sizeBytes }` — probe is not needed since SubtitleResult only has these two fields. Use `statSync` for size.

**Acceptance Criteria**:
- [ ] `subtitle().input(v).softSub({ path: 'sub.srt' }).output(o).toArgs()` produces `-i v -i sub.srt -c:v copy -c:a copy -c:s mov_text -map 0:v -map 0:a -map 1:s` (for mp4 output)
- [ ] Multiple `softSub()` calls add multiple subtitle inputs and mappings
- [ ] `softSub()` with `language`, `title`, `default`, `forced` produces correct metadata/disposition flags
- [ ] `hardBurn({ path: 'sub.srt' })` produces `-vf subtitles=sub.srt` with video re-encoding
- [ ] `hardBurn()` with `forceStyle` produces `force_style='...'` in filter
- [ ] `hardBurn()` escapes special chars in subtitle path
- [ ] `extract({ streamIndex: 2, format: 'srt' })` produces `-map 0:2 -c:s srt`
- [ ] `convert({ inputPath: 'sub.ass', outputFormat: 'srt' })` works without `input()` call
- [ ] Missing required fields throw `FFmpegError`
- [ ] Soft sub auto-selects subtitle codec based on output container extension

---

### Unit 3: ImageBuilder

**File**: `src/operations/image.ts`

```typescript
import { statSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { PixelFormat, VideoCodec } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { ImageResult, OperationResult } from "../types/results.ts";
import {
  DEFAULT_VIDEO_CODEC_ARGS,
  missingFieldError,
  wrapTryExecute,
} from "../util/builder-helpers.ts";

// --- Config Types ---

interface ImageSequenceConfig {
  pattern: string;
  fps?: number;
  startNumber?: number;
  pixelFormat?: PixelFormat;
}

interface ToVideoConfig {
  duration: number;
  fps?: number;
  codec?: VideoCodec;
}

interface TestPatternConfig {
  type: "color" | "smptebars" | "testsrc" | "testsrc2" | "rgbtestsrc";
  width: number;
  height: number;
  duration: number;
  fps?: number;
}

interface SolidColorConfig {
  color: string;
  width: number;
  height: number;
  duration: number;
}

interface SilentAudioConfig {
  duration: number;
  sampleRate?: number;
  channels?: number;
}

// --- Internal State ---

type ImageMode =
  | { type: "standard" }
  | { type: "sequence"; config: ImageSequenceConfig }
  | { type: "convert"; format: ImageOutputFormat }
  | { type: "resize"; dimensions: { width?: number; height?: number } }
  | { type: "toVideo"; config: ToVideoConfig }
  | { type: "testPattern"; config: TestPatternConfig }
  | { type: "solidColor"; config: SolidColorConfig }
  | { type: "silentAudio"; config: SilentAudioConfig };

type ImageOutputFormat = "png" | "jpg" | "webp" | "bmp" | "tiff" | "avif" | "jxl";

interface ImageState {
  inputPath?: string;
  mode: ImageMode;
  resizeDimensions?: { width?: number; height?: number };
  convertFormat?: ImageOutputFormat;
  outputPath?: string;
}

// --- Validation ---

function validateImageState(
  state: ImageState,
): asserts state is ImageState & { outputPath: string } {
  const needsInput = state.mode.type === "standard" || state.mode.type === "convert"
    || state.mode.type === "resize" || state.mode.type === "toVideo";
  if (needsInput && !state.inputPath) throw missingFieldError("input");
  if (!state.outputPath) throw missingFieldError("output");
}

// --- Builder Interface ---

export interface ImageBuilder {
  input(path: string): this;
  imageSequence(pattern: string, options?: {
    fps?: number;
    startNumber?: number;
    pixelFormat?: PixelFormat;
  }): this;
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

export type {
  ImageSequenceConfig,
  ToVideoConfig,
  TestPatternConfig,
  SolidColorConfig,
  SilentAudioConfig,
  ImageOutputFormat,
};

export function image(): ImageBuilder;
```

**Implementation Notes**:

1. **Mode design**: Unlike SubtitleBuilder's exclusive modes, ImageBuilder methods compose more freely. The `mode` field tracks the primary input source, but `resize` and `convert` can layer on top. Better approach: use flags rather than a discriminated union.

   Revised state:
   ```typescript
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
   ```
   Priority in `buildArgs`: `testPatternConfig` > `solidColorConfig` > `silentAudioConfig` > `sequenceConfig` > `toVideoConfig` > standard input. `convert` and `resize` modify the pipeline but don't change the source.

2. **Image sequence → video**:
   ```
   -y
   -framerate {fps ?? 25}
   [-start_number {startNumber}]
   -i {pattern}
   [-pix_fmt {pixelFormat ?? yuv420p}]
   -c:v libx264 -preset ultrafast -crf 23
   output
   ```
   The `-framerate` must come before `-i`.

3. **Image format conversion**:
   ```
   -y
   -i inputPath
   [-vf scale={w}:{h}]  (if resize also set)
   -frames:v 1
   output.{format}
   ```
   For JPEG output, use `-c:v mjpeg`. For WebP, use `-c:v libwebp`. For AVIF, use `-c:v libaom-av1 -still-picture 1`. For JXL, use `-c:v libjxl` (requires ffmpeg with libjxl support). For PNG/BMP/TIFF, ffmpeg infers from extension.

4. **Image to video** (still image → video):
   ```
   -y
   -loop 1
   -i inputPath
   -t {duration}
   [-r {fps ?? 30}]
   -c:v {codec ?? libx264} -preset ultrafast -crf 23 -pix_fmt yuv420p
   [-vf scale={w}:{h}]  (if resize also set)
   output
   ```
   The `-loop 1` must come before `-i`.

5. **Test pattern generation** (lavfi source):
   ```
   -y
   -f lavfi -i "{type}=size={width}x{height}:rate={fps ?? 25}:duration={duration}"
   -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p
   output
   ```
   For `type: "color"`, the source is `color=c=black:size=...` — but that requires a color. Use `testsrc2` as the actual default for "color" type, or treat "color" as a synonym. Actually, `color` is a valid lavfi source: `color=c=black:size=WxH:rate=R:duration=D`. Since no color is specified in `TestPatternConfig`, use `smptebars` as fallback or require color. Looking at INTERFACE.md, `testPattern` has a `type` field — `color` is listed. For `color` type, generate a black color source since no color param exists in `TestPatternConfig`. Actually, this is fine — the user picks the pattern type.

   Source filter mapping:
   - `"color"` → `color=c=black:size={w}x{h}:rate={fps}:duration={d}`
   - `"smptebars"` → `smptebars=size={w}x{h}:rate={fps}:duration={d}`
   - `"testsrc"` → `testsrc=size={w}x{h}:rate={fps}:duration={d}`
   - `"testsrc2"` → `testsrc2=size={w}x{h}:rate={fps}:duration={d}`
   - `"rgbtestsrc"` → `rgbtestsrc=size={w}x{h}:rate={fps}:duration={d}`

6. **Solid color generation**:
   ```
   -y
   -f lavfi -i "color=c={color}:size={width}x{height}:rate=25:duration={duration}"
   -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p
   output
   ```

7. **Silent audio generation**:
   ```
   -y
   -f lavfi -i "anullsrc=r={sampleRate ?? 48000}:cl={channels === 1 ? 'mono' : 'stereo'}"
   -t {duration}
   -c:a aac -b:a 128k
   output
   ```
   Channel layout mapping: `1` → `mono`, `2` → `stereo`, `6` → `5.1`. Default channels: 2.

8. **Resize** can compose with `convert`, `toVideo`, or standalone:
   - Standalone resize: `-i input -vf scale=w:h -frames:v 1 output`
   - With convert: add scale filter before codec
   - With toVideo: add scale filter in the pipeline

9. **execute() return**: Probe for width/height when output is video or image. Use `statSync` for sizeBytes. For silent audio, width/height are undefined.

**Acceptance Criteria**:
- [ ] `image().input(img).convert('webp').output(o).toArgs()` produces correct format conversion args
- [ ] `image().input(img).resize({ width: 640 }).output(o).toArgs()` produces scale filter
- [ ] `image().input(img).toVideo({ duration: 5 }).output(o).toArgs()` produces `-loop 1 -t 5` with video encoding
- [ ] `image().imageSequence('frame_%04d.png', { fps: 30 }).output(o).toArgs()` produces `-framerate 30 -i frame_%04d.png`
- [ ] `image().testPattern({ type: 'testsrc2', width: 1920, height: 1080, duration: 5 }).output(o).toArgs()` produces lavfi source
- [ ] `image().solidColor({ color: 'red', width: 640, height: 480, duration: 3 }).output(o).toArgs()` produces color source
- [ ] `image().silentAudio({ duration: 5 }).output(o).toArgs()` produces anullsrc
- [ ] `resize` + `convert` compose correctly (scale filter + format)
- [ ] `resize` + `toVideo` compose correctly
- [ ] Missing required fields throw `FFmpegError`
- [ ] `-framerate` appears before `-i` for image sequences
- [ ] `-loop 1` appears before `-i` for toVideo

---

### Unit 4: HlsBuilder and DashBuilder

**File**: `src/operations/streaming.ts`

```typescript
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { execute as runFFmpeg } from "../core/execute.ts";
import type { AudioCodec, VideoCodec } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, StreamResult } from "../types/results.ts";
import { missingFieldError, wrapTryExecute } from "../util/builder-helpers.ts";

// --- HLS Types ---

type HlsFlag =
  | "single_file"
  | "temp_file"
  | "delete_segments"
  | "round_durations"
  | "discont_start"
  | "omit_endlist"
  | "split_by_time"
  | "append_list"
  | "program_date_time"
  | "independent_segments"
  | "iframes_only"
  | "periodic_rekey";

type HlsSegmentType = "mpegts" | "fmp4";
type HlsPlaylistType = "event" | "vod";

interface HlsEncryptConfig {
  keyInfoFile?: string;
  key?: string;
  keyUrl?: string;
  iv?: string;
}

interface HlsVariantConfig {
  videoBitrate: string;
  audioBitrate: string;
  resolution: { width: number; height: number };
  codec?: VideoCodec;
}

// --- HLS Internal State ---

interface HlsState {
  inputPath?: string;
  segmentDurationValue?: number;
  listSizeValue?: number;
  segmentFilenameValue?: string;
  segmentTypeValue?: HlsSegmentType;
  initFilenameValue?: string;
  playlistTypeValue?: HlsPlaylistType;
  encryptConfig?: HlsEncryptConfig;
  baseUrlValue?: string;
  hlsFlags?: HlsFlag[];
  variantsValue?: HlsVariantConfig[];
  videoCodecValue?: VideoCodec;
  crfValue?: number;
  audioCodecValue?: AudioCodec;
  audioBitrateValue?: string;
  outputPath?: string;
}

// --- HLS Builder Interface ---

export interface HlsBuilder {
  input(path: string): this;
  segmentDuration(seconds: number): this;
  listSize(count: number): this;
  segmentFilename(pattern: string): this;
  segmentType(type: HlsSegmentType): this;
  initFilename(name: string): this;
  playlistType(type: HlsPlaylistType): this;
  encrypt(config: HlsEncryptConfig): this;
  baseUrl(url: string): this;
  flags(flags: HlsFlag[]): this;
  variants(configs: HlsVariantConfig[]): this;
  videoCodec(codec: VideoCodec): this;
  crf(value: number): this;
  audioCodec(codec: AudioCodec): this;
  audioBitrate(bitrate: string): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<StreamResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<StreamResult>>;
}

export type { HlsFlag, HlsSegmentType, HlsPlaylistType, HlsEncryptConfig, HlsVariantConfig };

export function hls(): HlsBuilder;

// --- DASH Types ---

interface DashState {
  inputPath?: string;
  segmentDurationValue?: number;
  adaptationSetsValue?: string;
  initSegNameValue?: string;
  mediaSegNameValue?: string;
  useTemplateValue?: boolean;
  useTimelineValue?: boolean;
  singleFileValue?: boolean;
  videoCodecValue?: VideoCodec;
  audioCodecValue?: AudioCodec;
  outputPath?: string;
}

export interface DashBuilder {
  input(path: string): this;
  segmentDuration(seconds: number): this;
  adaptationSets(sets: string): this;
  initSegName(name: string): this;
  mediaSegName(name: string): this;
  useTemplate(enabled?: boolean): this;
  useTimeline(enabled?: boolean): this;
  singleFile(enabled?: boolean): this;
  videoCodec(codec: VideoCodec): this;
  audioCodec(codec: AudioCodec): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<StreamResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<StreamResult>>;
}

export function dash(): DashBuilder;
```

**Implementation Notes**:

1. **HLS argument construction** (single variant):
   ```
   -y
   -i inputPath
   [-c:v {videoCodec ?? libx264}]
   [-crf {crfValue}]
   [-c:a {audioCodec ?? aac}]
   [-b:a {audioBitrate ?? '128k'}]
   -f hls
   -hls_time {segmentDuration ?? 2}
   -hls_list_size {listSize ?? 0}
   [-hls_segment_filename {segmentFilename}]
   [-hls_segment_type {segmentType}]
   [-hls_fmp4_init_filename {initFilename}]  (only when segmentType is fmp4)
   [-hls_playlist_type {playlistType}]
   [-hls_base_url {baseUrl}]
   [-hls_flags {flags joined by '+'}]
   [-hls_key_info_file {keyInfoFile}]
   output.m3u8
   ```

2. **HLS segment type defaults**:
   - `mpegts` (default): Generates `.ts` segment files
   - `fmp4`: Generates `.m4s` segments with an `init.mp4` initialization segment

3. **HLS with fmp4**:
   When `segmentType` is `fmp4`, add `-hls_segment_type fmp4`. If `initFilename` not set, default to `init.mp4`. Add `-hls_fmp4_init_filename {initFilename}`.

4. **HLS default segment filename**:
   If not explicitly set:
   - mpegts: `segment_%03d.ts`
   - fmp4: `segment_%03d.m4s`

5. **HLS encryption**: If `encryptConfig` is set:
   - `keyInfoFile`: `-hls_key_info_file {path}`
   - For inline key/iv: Generate a temporary key info file containing the key URL, key file path, and IV. This is complex — for v1, only support `keyInfoFile` and document that users must create the key info file themselves. Throw if `key`/`iv` are set without `keyInfoFile`.

6. **HLS variants (adaptive bitrate)**: Multi-variant HLS is complex and requires multiple output streams. For v1, support single-stream HLS only. If `variants()` is called, throw an error explaining that multi-variant HLS is not yet supported and the user should create multiple HLS outputs manually. This keeps Phase 8 scoped.

7. **DASH argument construction**:
   ```
   -y
   -i inputPath
   [-c:v {videoCodec ?? libx264}]
   [-c:a {audioCodec ?? aac}]
   -f dash
   [-seg_duration {segmentDuration}]
   [-adaptation_sets {adaptationSets ?? "id=0,streams=v id=1,streams=a"}]
   [-init_seg_name {initSegName}]
   [-media_seg_name {mediaSegName}]
   [-use_template {1 if useTemplate}]
   [-use_timeline {1 if useTimeline}]
   [-single_file {1 if singleFile}]
   output.mpd
   ```

8. **DASH defaults**:
   - `adaptationSets`: `"id=0,streams=v id=1,streams=a"` (one video, one audio adaptation set)
   - `useTemplate`: `true` (default)
   - `useTimeline`: `true` (default)

9. **execute() return**: After execution, scan the output directory for generated segment files to populate `StreamResult.segments`. Use `readdirSync` on the output directory and filter for `.ts`, `.m4s`, `.m4a`, or `.mp4` extensions (segments), excluding the manifest.

   ```typescript
   function collectSegments(outputPath: string): string[] {
     const dir = dirname(outputPath);
     const files = readdirSync(dir);
     return files
       .filter(f => /\.(ts|m4s|m4a|mp4)$/.test(f) && f !== basename(outputPath))
       .map(f => join(dir, f))
       .sort();
   }
   ```

**Acceptance Criteria**:
- [ ] `hls().input(v).output(o).toArgs()` produces `-f hls -hls_time 2 -hls_list_size 0`
- [ ] `hls().input(v).segmentDuration(4).output(o).toArgs()` produces `-hls_time 4`
- [ ] `hls().input(v).segmentType('fmp4').output(o).toArgs()` produces `-hls_segment_type fmp4 -hls_fmp4_init_filename init.mp4`
- [ ] `hls().input(v).playlistType('vod').output(o).toArgs()` produces `-hls_playlist_type vod`
- [ ] `hls().input(v).flags(['independent_segments', 'program_date_time']).output(o).toArgs()` produces `-hls_flags independent_segments+program_date_time`
- [ ] `hls().input(v).videoCodec('libx264').crf(23).audioCodec('aac').audioBitrate('192k').output(o).toArgs()` produces correct codec args
- [ ] `hls().input(v).listSize(5).output(o).toArgs()` produces `-hls_list_size 5`
- [ ] `hls().input(v).baseUrl('https://cdn.example.com/').output(o).toArgs()` produces `-hls_base_url`
- [ ] `dash().input(v).output(o).toArgs()` produces `-f dash` with default adaptation sets
- [ ] `dash().input(v).segmentDuration(4).output(o).toArgs()` produces `-seg_duration 4`
- [ ] `dash().input(v).useTemplate(true).useTimeline(true).output(o).toArgs()` produces `-use_template 1 -use_timeline 1`
- [ ] `dash().input(v).singleFile(true).output(o).toArgs()` produces `-single_file 1`
- [ ] Missing input/output throws `FFmpegError`
- [ ] `variants()` throws not-yet-supported error
- [ ] `execute()` returns segments list after completion

---

### Unit 5: GifBuilder

**File**: `src/operations/gif.ts`

```typescript
import { statSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { Timestamp } from "../types/base.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { GifResult, OperationResult } from "../types/results.ts";
import { missingFieldError, wrapTryExecute } from "../util/builder-helpers.ts";
import { parseTimecode } from "../util/timecode.ts";

// --- Types ---

type DitherMethod = "bayer" | "heckbert" | "floyd_steinberg" | "sierra2" | "sierra2_4a" | "none";
type PaletteMode = "full" | "diff";

// --- Internal State ---

interface GifState {
  inputPath?: string;
  dimensions?: { width?: number; height?: number };
  fpsValue?: number;
  trimStartValue?: Timestamp;
  durationValue?: number;
  ditherMethod?: DitherMethod;
  paletteModeValue?: PaletteMode;
  maxColorsValue?: number;
  loopValue?: number;
  optimizePaletteEnabled?: boolean;
  outputPath?: string;
}

// --- Validation ---

function validateGifState(
  state: GifState,
): asserts state is GifState & { inputPath: string; outputPath: string } {
  if (!state.inputPath) throw missingFieldError("input");
  if (!state.outputPath) throw missingFieldError("output");
}

// --- Builder Interface ---

export interface GifBuilder {
  input(path: string): this;
  size(dimensions: { width?: number; height?: number }): this;
  fps(rate: number): this;
  trimStart(timestamp: Timestamp): this;
  duration(seconds: number): this;
  dither(method: DitherMethod): this;
  paletteMode(mode: PaletteMode): this;
  maxColors(count: number): this;
  loop(count: number): this;
  optimizePalette(enabled?: boolean): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<GifResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<GifResult>>;
}

export type { DitherMethod, PaletteMode };

export function gif(): GifBuilder;
```

**Implementation Notes**:

1. **1-pass GIF** (default, when `optimizePalette` is false or unset):
   ```
   -y
   [-ss {trimStart}]
   -i inputPath
   [-t {duration}]
   -vf "fps={fps ?? 10}[,scale={w}:{h}:flags=lanczos]"
   [-loop {loop ?? 0}]
   output.gif
   ```
   Simple approach — ffmpeg auto-generates a palette. Quality is lower than 2-pass.

2. **2-pass GIF** (when `optimizePalette` is true):
   This uses the `palettegen` + `paletteuse` technique. Two approaches:

   **Approach A — single command with split filter** (preferred, avoids temp files):
   ```
   -y
   [-ss {trimStart}]
   -i inputPath
   [-t {duration}]
   -filter_complex "[0:v]fps={fps}[,scale={w}:{h}:flags=lanczos][s];
     [s]split[a][b];
     [a]palettegen=max_colors={maxColors ?? 256}:stats_mode={paletteMode ?? 'full'}[p];
     [b][p]paletteuse=dither={dither ?? 'sierra2_4a'}"
   [-loop {loop ?? 0}]
   output.gif
   ```

   This is a single ffmpeg invocation using `filter_complex` with `split`, `palettegen`, and `paletteuse`. It avoids needing a temp palette PNG file.

3. **Filter construction details**:
   - Base filter chain: always starts with `fps={fps ?? 10}`
   - If dimensions set: append `,scale={w}:{h}:flags=lanczos` (use -2 for auto-aspect)
   - For 1-pass: use as simple `-vf`
   - For 2-pass: wrap in `filter_complex` with split/palettegen/paletteuse

4. **Loop**: `-loop` is an output option for GIF. `0` = infinite loop (default), `-1` = no loop, positive N = loop N times.

5. **Max colors**: Default 256. Range 2-256. Passed to `palettegen=max_colors={n}`.

6. **Palette mode**: `full` generates one palette for the entire GIF. `diff` generates per-frame palettes (better for varied content, larger files). Passed to `palettegen=stats_mode={mode}`.

7. **Dither method**: Passed to `paletteuse=dither={method}`. Default for 2-pass: `sierra2_4a`. For 1-pass, dithering is handled internally by ffmpeg.

8. **toArgs()**: For 2-pass (optimizePalette), returns the single-command filter_complex approach. This makes `toArgs()` always return a valid single-invocation command.

9. **execute() return**: Probe the output GIF for width, height, duration. Calculate frameCount from probed video stream's `nbFrames` if available, or from `duration * fps`. Use `statSync` for sizeBytes.

   GIF probe notes: ffprobe on GIF returns the frame rate and duration. `nbFrames` may not always be populated. Fallback: `Math.round(duration * (state.fpsValue ?? 10))`.

**Acceptance Criteria**:
- [ ] `gif().input(v).output(o).toArgs()` produces simple 1-pass GIF args with default 10 fps
- [ ] `gif().input(v).fps(15).size({ width: 480 }).output(o).toArgs()` produces `fps=15,scale=480:-2:flags=lanczos`
- [ ] `gif().input(v).optimizePalette().output(o).toArgs()` produces `filter_complex` with split/palettegen/paletteuse
- [ ] `gif().input(v).optimizePalette().dither('bayer').output(o).toArgs()` includes `dither=bayer`
- [ ] `gif().input(v).optimizePalette().maxColors(128).output(o).toArgs()` includes `max_colors=128`
- [ ] `gif().input(v).optimizePalette().paletteMode('diff').output(o).toArgs()` includes `stats_mode=diff`
- [ ] `gif().input(v).trimStart(2).duration(3).output(o).toArgs()` produces `-ss 2 -t 3`
- [ ] `gif().input(v).loop(-1).output(o).toArgs()` produces `-loop -1`
- [ ] `gif().input(v).loop(0).output(o).toArgs()` produces `-loop 0`
- [ ] Missing input/output throws `FFmpegError`
- [ ] 2-pass GIF is a single ffmpeg invocation (no temp files needed)

---

### Unit 6: Fixture Generation

**File**: `__tests__/fixtures/generate.sh` (append to existing)

```bash
# subtitle.srt — SRT subtitle file for subtitle tests
# 3 entries over 5 seconds
cat > subtitle.srt << 'SRTEOF'
1
00:00:00,500 --> 00:00:02,000
First subtitle line

2
00:00:02,500 --> 00:00:04,000
Second subtitle line

3
00:00:04,000 --> 00:00:05,000
Third subtitle line
SRTEOF

# chapters.mkv — MKV with chapters for probe chapter test
# 640x360, 5s, 2 chapters (0-2.5s "Chapter 1", 2.5-5s "Chapter 2")
cat > /tmp/ffmpeg-chapters-meta.txt << 'METAEOF'
;FFMETADATA1

[CHAPTER]
TIMEBASE=1/1000
START=0
END=2500
title=Chapter 1

[CHAPTER]
TIMEBASE=1/1000
START=2500
END=5000
title=Chapter 2
METAEOF

ffmpeg -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=5" \
  -f lavfi -i "sine=frequency=440:duration=5:sample_rate=48000" \
  -i /tmp/ffmpeg-chapters-meta.txt \
  -map 0:v -map 1:a -map_metadata 2 \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  chapters.mkv

rm -f /tmp/ffmpeg-chapters-meta.txt
```

**Implementation Notes**:
- `subtitle.srt` is a plain text file, created via `cat` heredoc (no ffmpeg needed)
- `chapters.mkv` requires ffmetadata file for chapter markers — uses a temp metadata file
- Both fixtures are small (SRT is < 1KB, MKV is similar to `video-short.mp4`)

**Acceptance Criteria**:
- [ ] `subtitle.srt` exists with 3 subtitle entries spanning 0-5 seconds
- [ ] `chapters.mkv` exists with 2 chapters, is playable, has correct duration (~5s)
- [ ] Total fixture size remains under 5 MB budget

---

### Unit 7: Test Helpers Update

**File**: `__tests__/helpers.ts` (add to FIXTURES object)

```typescript
export const FIXTURES = {
  // ... existing entries
  subtitle: join(FIXTURES_DIR, "subtitle.srt"),
  chapters: join(FIXTURES_DIR, "chapters.mkv"),
};
```

**Acceptance Criteria**:
- [ ] `FIXTURES.subtitle` and `FIXTURES.chapters` are available in test helpers

---

### Unit 8: Barrel Export Update

**File**: `src/index.ts` (add exports)

```typescript
// Operations - add:
export type { SubtitleBuilder, SoftSubConfig, HardBurnConfig, ExtractSubConfig, ConvertSubConfig } from "./operations/subtitle.ts";
export { subtitle } from "./operations/subtitle.ts";

export type { ImageBuilder, ImageSequenceConfig, ToVideoConfig, TestPatternConfig, SolidColorConfig, SilentAudioConfig, ImageOutputFormat } from "./operations/image.ts";
export { image } from "./operations/image.ts";

export type { HlsBuilder, DashBuilder, HlsFlag, HlsSegmentType, HlsPlaylistType, HlsEncryptConfig, HlsVariantConfig } from "./operations/streaming.ts";
export { hls, dash } from "./operations/streaming.ts";

export type { GifBuilder, DitherMethod, PaletteMode } from "./operations/gif.ts";
export { gif } from "./operations/gif.ts";
```

**Acceptance Criteria**:
- [ ] `subtitle`, `image`, `hls`, `dash`, `gif` factory functions and all their types are importable from `@ffmpeg-sdk/core`

---

## Implementation Order

1. **Unit 1**: SubtitleFormat type addition (dependency for SubtitleBuilder)
2. **Unit 6**: Generate fixtures (`subtitle.srt`, `chapters.mkv`)
3. **Unit 7**: Update test helpers with new fixture paths
4. **Unit 5**: GifBuilder (simplest builder, no new types/dependencies beyond what exists)
5. **Unit 2**: SubtitleBuilder (uses new SubtitleFormat type)
6. **Unit 3**: ImageBuilder (moderately complex, multiple modes)
7. **Unit 4**: HlsBuilder + DashBuilder (two builders in one file, streaming-specific concerns)
8. **Unit 8**: Barrel export update (after all builders exist)

---

## Testing

### Builder Tests: `__tests__/builder/subtitle.test.ts`

```typescript
describe("SubtitleBuilder", () => {
  // Soft sub
  it("produces -c:v copy -c:a copy -c:s mov_text for mp4 output");
  it("produces -c:s srt for mkv output");
  it("produces -c:s webvtt for webm output");
  it("adds -i for each subtitle file");
  it("produces -map flags for video, audio, and each subtitle");
  it("produces -metadata:s:s:N language=... for language");
  it("produces -metadata:s:s:N title=... for title");
  it("produces -disposition:s:N default for default flag");
  it("produces -disposition:s:N forced for forced flag");
  it("accumulates multiple softSub calls");

  // Hard burn
  it("produces -vf subtitles=path for hard burn");
  it("escapes colons in subtitle path");
  it("escapes backslashes in subtitle path");
  it("includes force_style when set");
  it("includes charenc when set");
  it("uses DEFAULT_VIDEO_CODEC_ARGS for hard burn");
  it("stream-copies audio with -c:a copy for hard burn");

  // Extract
  it("produces -map 0:{index} for extract");
  it("produces -c:s {format} for extract output codec");

  // Convert
  it("does not require input() for convert mode");
  it("uses config.inputPath as -i for convert");
  it("produces correct -c:s for output format");

  // Validation
  it("throws when input is missing (non-convert mode)");
  it("throws when no mode selected");
  it("throws when output is missing");
});
```

### Builder Tests: `__tests__/builder/image.test.ts`

```typescript
describe("ImageBuilder", () => {
  // Image sequence
  it("produces -framerate before -i for image sequence");
  it("includes -start_number when set");
  it("includes -pix_fmt when set");

  // Format conversion
  it("produces -c:v mjpeg for jpg conversion");
  it("produces -c:v libwebp for webp conversion");
  it("produces -frames:v 1 for single image output");

  // Resize
  it("produces -vf scale=W:H for resize");
  it("uses -2 for auto-aspect when only width set");
  it("uses -2 for auto-aspect when only height set");

  // To video
  it("produces -loop 1 before -i for toVideo");
  it("produces -t {duration} for toVideo");
  it("produces -r {fps} for toVideo");

  // Test pattern
  it("produces -f lavfi -i testsrc2=... for test pattern");
  it("produces -f lavfi -i smptebars=... for smptebars");
  it("includes size, rate, duration in lavfi source");

  // Solid color
  it("produces -f lavfi -i color=c={color}:...");

  // Silent audio
  it("produces -f lavfi -i anullsrc=...");
  it("produces -t {duration} for silent audio");
  it("maps channels to channel layout string");

  // Composition
  it("combines resize with convert");
  it("combines resize with toVideo");

  // Validation
  it("throws when input is missing for standard operations");
  it("does not require input for testPattern/solidColor/silentAudio");
  it("throws when output is missing");
});
```

### Builder Tests: `__tests__/builder/streaming.test.ts`

```typescript
describe("HlsBuilder", () => {
  it("produces -f hls with default segment duration");
  it("produces -hls_time from segmentDuration()");
  it("produces -hls_list_size from listSize()");
  it("produces -hls_segment_filename from segmentFilename()");
  it("produces -hls_segment_type fmp4 for fmp4");
  it("produces -hls_fmp4_init_filename for fmp4 init");
  it("produces -hls_playlist_type from playlistType()");
  it("produces -hls_base_url from baseUrl()");
  it("joins flags with + for -hls_flags");
  it("produces video/audio codec args");
  it("produces -crf from crf()");
  it("produces -hls_key_info_file from encrypt()");
  it("throws for variants() (not yet supported)");
  it("throws when input is missing");
  it("throws when output is missing");
});

describe("DashBuilder", () => {
  it("produces -f dash with default adaptation sets");
  it("produces -seg_duration from segmentDuration()");
  it("produces -adaptation_sets from adaptationSets()");
  it("produces -init_seg_name from initSegName()");
  it("produces -media_seg_name from mediaSegName()");
  it("produces -use_template 1 from useTemplate()");
  it("produces -use_timeline 1 from useTimeline()");
  it("produces -single_file 1 from singleFile()");
  it("produces video/audio codec args");
  it("throws when input is missing");
  it("throws when output is missing");
});
```

### Builder Tests: `__tests__/builder/gif.test.ts`

```typescript
describe("GifBuilder", () => {
  // 1-pass (simple)
  it("produces -vf fps=10 as default");
  it("produces -vf fps={n} from fps()");
  it("produces -vf fps=N,scale=W:-2:flags=lanczos from size()");
  it("produces -ss from trimStart()");
  it("produces -t from duration()");
  it("produces -loop from loop()");

  // 2-pass (optimized palette)
  it("produces -filter_complex with split/palettegen/paletteuse from optimizePalette()");
  it("includes dither method in paletteuse");
  it("includes max_colors in palettegen");
  it("includes stats_mode in palettegen from paletteMode()");
  it("includes scale in filter_complex when size is set");

  // Validation
  it("throws when input is missing");
  it("throws when output is missing");
});
```

### E2E Tests: `__tests__/integration/subtitle.e2e.test.ts`

```typescript
describeWithFFmpeg("subtitle()", () => {
  it("embeds soft sub SRT into MKV", async () => {
    // subtitle().input(videoShort).softSub({ path: subtitle.srt }).output(tmp.mkv)
    // Verify: subtitle stream present in output probe
    // Verify: video and audio streams copied (not re-encoded)
  });

  it("embeds soft sub with language and title metadata", async () => {
    // softSub({ path: srt, language: 'eng', title: 'English' })
    // Verify: subtitle stream present
  });

  it("hard burns SRT into video", async () => {
    // subtitle().input(videoShort).hardBurn({ path: subtitle.srt }).output(tmp.mp4)
    // Verify: no subtitle stream in output (burned in)
    // Verify: video was re-encoded (not copy)
    // Verify: duration matches input
  });

  it("extracts subtitle stream", async () => {
    // First embed a subtitle, then extract it
    // Or use a fixture with subtitles
    // Verify: output file exists with content
  });

  it("tryExecute() returns success result", async () => {
    // Verify tryExecute works
  });
}, 60000);
```

### E2E Tests: `__tests__/integration/image.e2e.test.ts`

```typescript
describeWithFFmpeg("image()", () => {
  it("converts image format (jpg → png)", async () => {
    // image().input(image1080p).convert('png').output(tmp.png)
    // Verify: output is PNG format, has correct dimensions
  });

  it("resizes image", async () => {
    // image().input(image1080p).resize({ width: 640 }).output(tmp.jpg)
    // Verify: output width is 640, height auto-calculated
  });

  it("creates video from still image", async () => {
    // image().input(image1080p).toVideo({ duration: 3, fps: 30 }).output(tmp.mp4)
    // Verify: video output with ~3s duration, correct fps
  });

  it("generates test pattern video", async () => {
    // image().testPattern({ type: 'testsrc2', width: 640, height: 480, duration: 2 }).output(tmp.mp4)
    // Verify: video with 640x480 dimensions, ~2s duration
  });

  it("generates solid color video", async () => {
    // image().solidColor({ color: 'blue', width: 320, height: 240, duration: 1 }).output(tmp.mp4)
    // Verify: video with 320x240, ~1s duration
  });

  it("generates silent audio", async () => {
    // image().silentAudio({ duration: 2, sampleRate: 48000 }).output(tmp.aac)
    // Verify: audio output with ~2s duration, 48000 sample rate
  });

  it("tryExecute() returns success result", async () => {
    // Verify tryExecute works
  });
}, 60000);
```

### E2E Tests: `__tests__/integration/streaming.e2e.test.ts`

```typescript
describeWithFFmpeg("hls()", () => {
  it("creates HLS output with mpegts segments", async () => {
    // hls().input(videoShort).segmentDuration(1).output(tmp/output.m3u8)
    // Verify: .m3u8 playlist exists
    // Verify: .ts segment files exist
  });

  it("creates HLS output with fmp4 segments", async () => {
    // hls().input(videoShort).segmentType('fmp4').segmentDuration(1).output(tmp/output.m3u8)
    // Verify: .m3u8 exists
    // Verify: init.mp4 exists
    // Verify: .m4s segment files exist
  });

  it("respects segment duration", async () => {
    // Use videoH264 (5s) with segmentDuration(2)
    // Verify: roughly 3 segments created
  });

  it("creates HLS with VOD playlist type", async () => {
    // hls().input(videoShort).playlistType('vod').output(tmp/output.m3u8)
    // Verify: playlist file contains #EXT-X-PLAYLIST-TYPE:VOD and #EXT-X-ENDLIST
  });
}, 60000);

describeWithFFmpeg("dash()", () => {
  it("creates DASH output", async () => {
    // dash().input(videoShort).output(tmp/output.mpd)
    // Verify: .mpd manifest exists
    // Verify: segment files exist
  });

  it("respects segment duration", async () => {
    // dash().input(videoShort).segmentDuration(2).output(tmp/output.mpd)
    // Verify: output valid
  });
}, 60000);
```

### E2E Tests: `__tests__/integration/gif.e2e.test.ts`

```typescript
describeWithFFmpeg("gif()", () => {
  it("creates basic GIF from video", async () => {
    // gif().input(videoShort).fps(10).size({ width: 320 }).output(tmp.gif)
    // Verify: output is valid GIF
    // Verify: dimensions roughly 320xAuto
    // Verify: file has content (> 1000 bytes)
  });

  it("creates GIF with palette optimization", async () => {
    // gif().input(videoShort).fps(10).size({ width: 320 }).optimizePalette().output(tmp.gif)
    // Verify: output valid
    // Verify: potentially better quality or different size than 1-pass
  });

  it("respects FPS setting", async () => {
    // gif().input(videoShort).fps(5).output(tmp.gif)
    // Probe output: verify frame rate is ~5 fps
  });

  it("respects trim and duration", async () => {
    // gif().input(videoH264).trimStart(1).duration(2).fps(10).output(tmp.gif)
    // Verify: duration ~2s
  });

  it("supports loop control", async () => {
    // gif().input(videoShort).fps(10).loop(1).output(tmp.gif)
    // Verify: output valid (loop metadata hard to verify programmatically)
  });

  it("tryExecute() returns success result", async () => {
    // Verify tryExecute works
  });
}, 60000);
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

# Generate new fixtures
cd __tests__/fixtures && bash generate.sh

# Run builder tests
pnpm vitest run __tests__/builder/subtitle.test.ts
pnpm vitest run __tests__/builder/image.test.ts
pnpm vitest run __tests__/builder/streaming.test.ts
pnpm vitest run __tests__/builder/gif.test.ts

# Run E2E tests
pnpm vitest run __tests__/integration/subtitle.e2e.test.ts
pnpm vitest run __tests__/integration/image.e2e.test.ts
pnpm vitest run __tests__/integration/streaming.e2e.test.ts
pnpm vitest run __tests__/integration/gif.e2e.test.ts

# Run all tests 3x for flakiness check
pnpm test && pnpm test && pnpm test
```

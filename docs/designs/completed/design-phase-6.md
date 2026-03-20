# Design: Phase 6 — Audio & Concat Operation Builders

## Overview

Phase 6 adds two operation builders: `AudioBuilder` (audio extraction, mixing, processing, effects) and `ConcatBuilder` (video concatenation with optional transitions). These are the two most complex operation builders in the SDK.

Both follow the established builder pattern from Phase 5 (extract/transform): closure-based state, fluent chaining, `toArgs()` for inspection, `execute()`/`tryExecute()` for execution.

### Key Decisions

- **AudioBuilder normalization**: Both single-pass and two-pass `loudnorm` are implemented directly in `AudioBuilder.execute()`. Single-pass (default) uses the dynamic loudnorm compressor — fast but alters audio character (±2 LUFS accuracy). Two-pass (`twoPass: true`) runs ffmpeg twice: first pass measures loudness from stderr JSON, second pass applies a precise linear gain (±0.1 LUFS, EBU R128 compliant, transparent). `toArgs()` throws for two-pass since it requires two invocations.
- **ConcatBuilder dual path**: Uses concat demuxer (no re-encode) when there are no transitions and no normalization. Falls back to `filter_complex` with xfade/acrossfade when transitions are needed.
- **New fixtures**: `audio-music.wav`, `audio-silence.wav`, `video-no-audio.mp4` for ducking, silence detection, and concat missing-audio tests.

---

## Implementation Units

### Unit 1: New Types — AudioInputConfig, ClipConfig, TransitionConfig

**File**: `src/types/filters.ts` (append to existing)

```typescript
export interface AudioInputConfig {
  /** Volume adjustment: number (multiplier), string ('-6dB') */
  volume?: number | string;
  /** Delay in milliseconds before this track starts */
  delay?: number;
  /** Trim start of this audio input (seconds) */
  trimStart?: number;
  /** Trim end (seconds) */
  trimEnd?: number;
}

export interface ClipConfig {
  path: string;
  trimStart?: number;
  trimEnd?: number;
  /** Duration override (alternative to trimEnd) */
  duration?: number;
}

export interface TransitionConfig {
  type: TransitionType;
  /** Transition duration in seconds (default: 1) */
  duration?: number;
  /** Custom expression (when type is 'custom') */
  expr?: string;
}
```

**Implementation Notes**:
- These are pure data interfaces — no logic.
- `AudioInputConfig.volume` supports both multiplier numbers (e.g., `0.5`) and dB strings (e.g., `'-6dB'`). The builder resolves this to ffmpeg's `volume` filter syntax.
- `ClipConfig` is used by `ConcatBuilder.addClip()` — when a string is passed, it's wrapped as `{ path: str }`.

**Acceptance Criteria**:
- [ ] Types are exported from `src/types/filters.ts`
- [ ] Types are re-exported from `src/types/index.ts`
- [ ] Types are re-exported from `src/index.ts`

---

### Unit 2: AudioBuilder

**File**: `src/operations/audio.ts`

```typescript
import { statSync, writeFileSync, unlinkSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe } from "../core/probe.ts";
import type { AudioCodec } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { AudioInputConfig, DuckConfig, FadeCurve, NormalizeConfig } from "../types/filters.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { AudioStreamInfo } from "../types/probe.ts";
import type { AudioResult, OperationResult } from "../types/results.ts";

// --- Internal State ---

interface AudioState {
  inputPath?: string;
  additionalInputs: Array<{ path: string; config?: AudioInputConfig }>;
  extractAudioConfig?: {
    codec?: AudioCodec;
    bitrate?: string;
    sampleRate?: number;
    channels?: number;
  };
  duckConfig?: DuckConfig;
  normalizeConfig?: NormalizeConfig;
  fadeInConfig?: { duration: number; curve?: FadeCurve };
  fadeOutConfig?: { duration: number; startAt?: number; curve?: FadeCurve };
  compressConfig?: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
    makeupGain?: number;
    knee?: number;
  };
  limitConfig?: { limit?: number; attack?: number; release?: number };
  eqConfigs: Array<{
    frequency: number;
    width?: number;
    widthType?: "h" | "q" | "o" | "s";
    gain: number;
  }>;
  highpassFreq?: { frequency: number; order?: number };
  lowpassFreq?: { frequency: number; order?: number };
  bassConfig?: { gain: number; frequency?: number };
  trebleConfig?: { gain: number; frequency?: number };
  gateConfig?: { threshold?: number; attack?: number; release?: number };
  denoiseConfig?: { amount?: number; method?: "afftdn" | "anlmdn" };
  deessConfig?: { frequency?: number; intensity?: number };
  echoConfig?: { delay?: number; decay?: number };
  tempoFactor?: number;
  pitchSemitones?: number;
  resampleConfig?: { sampleRate: number; useSoxr?: boolean };
  codecValue?: AudioCodec;
  bitrateValue?: string;
  sampleRateValue?: number;
  channelsValue?: number;
  channelLayoutValue?: string;
  detectSilenceConfig?: { threshold?: number; duration?: number };
  extractAmplitudeConfig?: { fps: number; outputFormat?: "f32le" | "json" };
  outputPath?: string;
}

// --- Builder Interface ---

export interface AudioBuilder {
  input(path: string): this;
  addInput(path: string, config?: AudioInputConfig): this;
  extractAudio(options?: {
    codec?: AudioCodec;
    bitrate?: string;
    sampleRate?: number;
    channels?: number;
  }): this;
  duck(config: DuckConfig): this;
  normalize(config: NormalizeConfig): this;
  fadeIn(config: { duration: number; curve?: FadeCurve }): this;
  fadeOut(config: { duration: number; startAt?: number; curve?: FadeCurve }): this;
  compress(config?: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
    makeupGain?: number;
    knee?: number;
  }): this;
  limit(config?: { limit?: number; attack?: number; release?: number }): this;
  eq(config: {
    frequency: number;
    width?: number;
    widthType?: "h" | "q" | "o" | "s";
    gain: number;
  }): this;
  highpass(frequency: number, order?: number): this;
  lowpass(frequency: number, order?: number): this;
  bass(gain: number, frequency?: number): this;
  treble(gain: number, frequency?: number): this;
  gate(config?: { threshold?: number; attack?: number; release?: number }): this;
  denoise(config?: { amount?: number; method?: "afftdn" | "anlmdn" }): this;
  deess(config?: { frequency?: number; intensity?: number }): this;
  echo(config?: { delay?: number; decay?: number }): this;
  tempo(factor: number): this;
  pitch(semitones: number): this;
  resample(sampleRate: number, useSoxr?: boolean): this;
  codec(codec: AudioCodec): this;
  bitrate(bitrate: string): this;
  sampleRate(rate: number): this;
  channels(count: number): this;
  channelLayout(layout: string): this;
  detectSilence(config?: { threshold?: number; duration?: number }): this;
  extractAmplitude(config: { fps: number; outputFormat?: "f32le" | "json" }): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<AudioResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<AudioResult>>;
}

// --- Factory ---

export function audio(): AudioBuilder;
```

**Implementation Notes**:

#### Argument Construction (`buildArgs`)

The builder must handle three distinct modes:

1. **Single input with filters** — Standard `-i input -af filters output` path. Used for most operations (normalize, fade, compress, EQ, etc.).

2. **Multi-input mixing** — Uses `-filter_complex` with `amix` or `amerge`. Each input gets `-i`, then a filter_complex graph merges them. Volume adjustments are per-input `volume` filters. Delays use `adelay`.

3. **Extract audio** — Strips video: `-vn`, applies codec/bitrate/sampleRate/channels.

#### Audio Filter Chain Order

Filters are applied in this order (matching typical audio processing signal flow):

```
highpass → lowpass → gate → denoise → deess → eq → bass → treble
→ compress → limit → normalize → duck → tempo → pitch → volume
→ fadeIn → fadeOut → echo → resample
```

**Rationale**: Noise reduction before dynamics processing before EQ before effects.

#### Filter Construction Details

- **volume**: `volume=0.5` for multiplier, `volume=-6dB` for dB string (pass through as-is if string contains `dB`)
- **highpass**: `highpass=f={freq}:poles={order}` (order default: 2)
- **lowpass**: `lowpass=f={freq}:poles={order}` (order default: 2)
- **gate**: `agate=threshold={threshold}:attack={attack}:release={release}` (defaults: threshold=-30, attack=20, release=250)
- **denoise afftdn**: `afftdn=nf={amount}` (default amount: -25)
- **denoise anlmdn**: `anlmdn=s={amount}` (default amount: 1)
- **deess**: `adeclick=w={frequency}:p={intensity}` — Note: FFmpeg doesn't have a native de-esser. Implement as a bandreject or parametric EQ targeting sibilance frequencies. Use `equalizer=f={frequency}:t=q:w=2:g={-intensity}` (default freq: 6000, intensity: 6)
- **eq**: `equalizer=f={freq}:width_type={widthType}:w={width}:g={gain}` (default widthType: 'q', width: 1)
- **bass**: `bass=g={gain}:f={frequency}` (default freq: 100)
- **treble**: `treble=g={gain}:f={frequency}` (default freq: 3000)
- **compress**: `acompressor=threshold={threshold}:ratio={ratio}:attack={attack}:release={release}:makeup={makeupGain}:knee={knee}` (defaults: threshold=-20dB, ratio=4, attack=20ms, release=250ms, makeupGain=0, knee=2.8)
- **limit**: `alimiter=limit={limit}:attack={attack}:release={release}` (defaults: limit=1, attack=5, release=50)
- **normalize (single-pass)**: `loudnorm=I={targetLufs}:TP={truePeak}:LRA={loudnessRange}` (defaults: truePeak=-1.5, loudnessRange=11). Dynamic mode — modifies audio character.
- **normalize (two-pass)**: When `twoPass: true`, `execute()` runs two ffmpeg invocations:
  1. **Measurement pass**: `ffmpeg -i input -af "loudnorm=I={targetLufs}:TP={truePeak}:LRA={loudnessRange}:print_format=json" -f null -` — parse the JSON block from stderr (lines between `{` and `}` after `[Parsed_loudnorm`). Extract: `input_i`, `input_tp`, `input_lra`, `input_thresh`, `target_offset`.
  2. **Correction pass**: `ffmpeg -i input -af "loudnorm=I={targetLufs}:TP={truePeak}:LRA={loudnessRange}:measured_I={input_i}:measured_TP={input_tp}:measured_LRA={input_lra}:measured_thresh={input_thresh}:offset={target_offset}:linear=true" output` — linear gain, transparent, EBU R128 compliant.
  - `toArgs()` throws `FFmpegError` with code `ENCODING_FAILED` and message `"Two-pass normalization requires two ffmpeg invocations — use execute() instead of toArgs()"` when `twoPass: true`.
- **duck**: Requires multi-input. Uses sidechain compressor: input 0 = main audio, input `trigger` = sidechain trigger. Filter: `[main][trigger]sidechaincompress=threshold={threshold}:ratio=20:attack={attackMs}:release={releaseMs}:level_sc=1` (defaults: threshold=-30, attackMs=20, releaseMs=250). The `amount` field controls the sidechain compress output mix — map it to a volume reduction after the sidechain. In practice, use `sidechaincompress` with `ratio` derived from `amount`.
- **tempo**: Uses `atempo` with chaining for values outside 0.5-2.0 range (reuse `buildAtempoChain` logic from transform.ts — extract to a shared utility)
- **pitch**: `rubberband=pitch={2^(semitones/12)}` — requires librubberband. Calculate the pitch scale factor.
- **fadeIn**: `afade=t=in:d={duration}:curve={curve}` (default curve: 'tri')
- **fadeOut**: `afade=t=out:d={duration}:st={startAt}:curve={curve}` — `startAt` is auto-calculated at execute() time from input duration if not provided (probe input → `duration - fadeOut.duration`)
- **echo**: `aecho=0.8:0.88:{delay}:{decay}` (defaults: delay=60ms, decay=0.4)
- **resample**: `aresample={sampleRate}` with optional `:resampler=soxr` if useSoxr is true

#### Multi-Input / Ducking Filter Graph

When `addInput()` is used (multi-input mixing):

```
ffmpeg -i input0 -i input1 ... -filter_complex "
  [0:a]volume=1.0,adelay=0|0[a0];
  [1:a]volume=0.5,adelay=500|500[a1];
  [a0][a1]amix=inputs=2:duration=longest[out]
" -map "[out]" output
```

When `duck()` is used (sidechain compression):

```
ffmpeg -i main.wav -i voice.wav -filter_complex "
  [1:a]asplit[sc][voice];
  [0:a][sc]sidechaincompress=threshold=-30dB:ratio=20:attack=0.02:release=0.25[ducked];
  [ducked][voice]amix=inputs=2:duration=longest[out]
" -map "[out]" output
```

Wait — the duck interface says `trigger` is the index of the trigger track, and `amount` is the dB reduction. The simpler approach:

```
ffmpeg -i input0 -i input1 -filter_complex "
  [0:a][{trigger}:a]sidechaincompress=threshold={threshold}dB:ratio=20:attack={attackMs/1000}:release={releaseMs/1000}[out]
" -map "[out]" output
```

The `amount` maps to `ratio` — higher amount means more compression. Use `ratio = 10^(abs(amount)/20)` as an approximation for the target reduction.

#### Silence Detection

When `detectSilence()` is used, the builder runs ffmpeg with `silencedetect` filter and parses stderr for silence ranges:

```
ffmpeg -i input -af silencedetect=noise={threshold}dB:d={duration} -f null -
```

Parse stderr lines matching:
- `silence_start: {time}`
- `silence_end: {time} | silence_duration: {duration}`

Return parsed ranges in `AudioResult.silenceRanges`.

#### Execute Result Population

After execution, probe the output file to populate `AudioResult`:
- `outputPath`, `sizeBytes` from statSync
- `duration` from probe format
- `codec`, `sampleRate`, `channels` from audio stream probe
- `silenceRanges` from stderr parsing (if detectSilence was used)
- `loudness` — for single-pass loudnorm, parse loudnorm stats from stderr (lines like `[Parsed_loudnorm...] Input Integrated: -23.1 LUFS`)

**Acceptance Criteria**:
- [ ] `audio()` returns a builder with all methods from the interface
- [ ] Single-input filter chain produces correct `-af` argument
- [ ] Multi-input mixing produces correct `-filter_complex` with `amix`
- [ ] `extractAudio()` produces `-vn` and codec args
- [ ] `duck()` produces sidechain compress filter graph
- [ ] `normalize()` produces `loudnorm` filter with correct params
- [ ] `tempo()` chains `atempo` for values outside 0.5-2.0
- [ ] `fadeOut()` without `startAt` auto-calculates from duration at execute() time
- [ ] `detectSilence()` parses silence ranges from stderr
- [ ] `toArgs()` throws for missing `input()` and `output()`
- [ ] `tryExecute()` catches `FFmpegError` and returns failure result
- [ ] `normalize({ twoPass: true })` works in `execute()` — probes loudness in pass 1, applies linear gain in pass 2
- [ ] `normalize({ twoPass: true })` in `toArgs()` throws with informative message

---

### Unit 3: Shared Utility — `buildAtempoChain`

**File**: `src/util/audio-filters.ts`

```typescript
/**
 * Build a chain of atempo filters for speed factors outside the 0.5-2.0 range.
 * FFmpeg's atempo filter only supports 0.5 to 100.0 per instance,
 * but for accuracy and compatibility, we chain at the 0.5/2.0 boundaries.
 */
export function buildAtempoChain(factor: number): string;
```

**Implementation Notes**:
- Extract the existing `buildAtempoChain` function from `src/operations/transform.ts` (lines 200-219) into this shared utility.
- Update `transform.ts` to import from `../util/audio-filters.ts`.
- AudioBuilder imports the same function for its `tempo()` method.

**Acceptance Criteria**:
- [ ] `buildAtempoChain(2)` → `"atempo=2"`
- [ ] `buildAtempoChain(4)` → `"atempo=2,atempo=2"`
- [ ] `buildAtempoChain(0.25)` → `"atempo=0.5,atempo=0.5"`
- [ ] `transform.ts` uses the extracted utility (no behavior change)

---

### Unit 4: ConcatBuilder

**File**: `src/operations/concat.ts`

```typescript
import { statSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execute as runFFmpeg } from "../core/execute.ts";
import { probe, getAudioStream } from "../core/probe.ts";
import type { HwAccelMode } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ClipConfig, TransitionConfig, TransitionType } from "../types/filters.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { ConcatResult, OperationResult } from "../types/results.ts";

// --- Internal State ---

interface ConcatState {
  clips: Array<ClipConfig & { transitionAfter?: TransitionConfig }>;
  defaultTransitionConfig?: TransitionConfig;
  audioCrossfadeDuration?: number;
  normalizeWidth?: number;
  normalizeHeight?: number;
  normalizeFpsValue?: number;
  fillSilenceEnabled?: boolean;
  hwAccelMode?: HwAccelMode;
  outputPath?: string;
}

// --- Builder Interface ---

export interface ConcatBuilder {
  addClip(clip: string | ClipConfig): this;
  transition(config: TransitionConfig): this;
  defaultTransition(config: TransitionConfig): this;
  audioCrossfade(duration: number): this;
  normalizeResolution(width: number, height: number): this;
  normalizeFps(fps: number): this;
  fillSilence(enabled?: boolean): this;
  hwAccel(mode: HwAccelMode): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ConcatResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ConcatResult>>;
}

// --- Factory ---

export function concat(): ConcatBuilder;
```

**Implementation Notes**:

#### Dual-Path Architecture

The builder chooses between two FFmpeg concat strategies:

**Path 1: Concat Demuxer** (fast, no re-encode)
- Used when: no transitions, no `normalizeResolution`, no `normalizeFps`, no `fillSilence`
- Creates a temporary concat list file:
  ```
  file '/path/to/clip1.mp4'
  file '/path/to/clip2.mp4'
  ```
- Args: `ffmpeg -y -f concat -safe 0 -i list.txt -c copy output.mp4`
- Per-clip trimming via `-ss`/`-to` is NOT supported in demuxer mode — if any clip has `trimStart`/`trimEnd`/`duration`, fall back to filter_complex path.

**Path 2: Filter Complex** (transitions, normalization, trimming)
- Used when: transitions present, OR normalizeResolution/normalizeFps set, OR fillSilence enabled, OR per-clip trimming is used.
- Builds a complex filter graph with xfade (video) and acrossfade (audio).

#### Transition Logic — `transition()` Method

`transition(config)` sets the transition AFTER the most recently added clip. So the workflow is:

```typescript
concat()
  .addClip('a.mp4')
  .transition({ type: 'dissolve', duration: 1 })  // transition between a and b
  .addClip('b.mp4')
  .transition({ type: 'wipeleft', duration: 0.5 }) // transition between b and c
  .addClip('c.mp4')
```

Internally, calling `.transition()` sets `transitionAfter` on the last clip in the `clips` array.

If `defaultTransition` is set and a junction has no explicit transition, the default is used.

#### Filter Complex Construction (Transitions)

For N clips with transitions, build xfade chains. Example with 3 clips:

```
ffmpeg -i clip0 -i clip1 -i clip2 -filter_complex "
  [0:v][1:v]xfade=transition=dissolve:duration=1:offset={clip0_dur - 1}[v01];
  [v01][2:v]xfade=transition=wipeleft:duration=0.5:offset={v01_dur - 0.5}[vout];
  [0:a][1:a]acrossfade=d=1:c1=tri:c2=tri[a01];
  [a01][2:a]acrossfade=d=1:c1=tri:c2=tri[aout]
" -map "[vout]" -map "[aout]" output.mp4
```

The `offset` for each xfade = cumulative duration of previous output minus transition duration.

Audio crossfade duration defaults to the video transition duration, but can be overridden with `audioCrossfade()`.

#### Normalization Preprocessing

When `normalizeResolution` and/or `normalizeFps` are set, each input gets scale+fps filters prepended:

```
[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[v0];
[1:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[v1];
```

#### Silent Audio Fill

When `fillSilence(true)` is set, at `execute()` time the builder probes each clip. For clips without an audio stream, it generates a silent audio source in the filter graph:

```
anullsrc=r=48000:cl=stereo[silence0];
```

And maps it as the audio input for that clip in the concat/xfade chain.

In `toArgs()` mode (no probing available), if `fillSilence` is set but we can't probe, throw an error directing users to use `execute()`.

#### Per-Clip Trimming in Filter Complex Mode

When a clip has `trimStart`/`trimEnd`/`duration`, apply trim before the concat chain:

```
[0:v]trim=start={trimStart}:end={trimEnd},setpts=PTS-STARTPTS[v0];
[0:a]atrim=start={trimStart}:end={trimEnd},asetpts=PTS-STARTPTS[a0];
```

#### Codec Selection

- Demuxer path: `-c copy` (no re-encode)
- Filter complex path: `-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k`

#### toArgs() Limitations

`toArgs()` cannot:
- Probe clips for duration (needed for xfade offsets) — throw if transitions are used
- Probe clips for audio presence (needed for fillSilence) — throw if fillSilence is set
- Access clip durations for demuxer mode with trimming

For these cases, throw `FFmpegError` with code `ENCODING_FAILED` and a message like "Transitions require clip duration probing — use execute() instead of toArgs()".

`toArgs()` CAN produce output for the simplest case: demuxer path with no trimming. In this case, it returns args referencing a placeholder concat list path `<concat-list>` since the actual temp file doesn't exist yet.

Actually, `toArgs()` should be practical. Let's make it work for the demuxer path (no transitions, no fillSilence) by writing a temp concat file immediately and returning the args. For filter_complex, throw since durations are needed.

**Acceptance Criteria**:
- [ ] `concat()` returns a builder with all methods from the interface
- [ ] 2 clips with no transitions uses concat demuxer path
- [ ] 2 clips with transition uses filter_complex with xfade
- [ ] `defaultTransition()` applies to all junctions without explicit transitions
- [ ] `normalizeResolution()` adds scale+pad filters per clip
- [ ] `normalizeFps()` adds fps filter per clip
- [ ] `fillSilence()` generates `anullsrc` for clips without audio (at execute time)
- [ ] Per-clip trim produces `trim`/`atrim` filters
- [ ] `transition()` sets transition on the most recently added clip
- [ ] `toArgs()` works for demuxer path, throws for filter_complex path
- [ ] `execute()` probes clips for duration, builds xfade offsets correctly
- [ ] Result includes `method: 'demuxer' | 'filter_complex'`
- [ ] Minimum 2 clips required — throw if fewer
- [ ] `tryExecute()` catches `FFmpegError` and returns failure result

---

### Unit 5: New Test Fixtures

**File**: `__tests__/fixtures/generate.sh` (append to existing)

```bash
# video-no-audio.mp4 — concat missing-audio test
# 640x360, 2s, 30fps, H.264, NO audio
ffmpeg -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -an \
  video-no-audio.mp4

# audio-music.wav — mixing/ducking tests
# 48kHz, stereo, 5s, dual-tone (300Hz + 500Hz for richer signal)
ffmpeg -y -f lavfi -i "sine=frequency=300:duration=5:sample_rate=48000" \
  -f lavfi -i "sine=frequency=500:duration=5:sample_rate=48000" \
  -filter_complex "[0:a][1:a]amerge=inputs=2[out]" \
  -map "[out]" -c:a pcm_s16le \
  audio-music.wav

# audio-silence.wav — silence detection tests
# 48kHz, mono, 5s: 1.5s tone, 2s silence, 1.5s tone
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1.5:sample_rate=48000" \
  -f lavfi -i "anullsrc=r=48000:cl=mono" \
  -f lavfi -i "sine=frequency=440:duration=1.5:sample_rate=48000" \
  -filter_complex "[0:a]apad=pad_dur=0[a0];[1:a]atrim=duration=2[a1];[2:a]apad=pad_dur=0[a2];[a0][a1][a2]concat=n=3:v=0:a=1[out]" \
  -map "[out]" -c:a pcm_s16le -t 5 \
  audio-silence.wav
```

**Implementation Notes**:
- After adding to the script, run it and commit the generated fixtures.
- Add new fixture paths to `__tests__/helpers.ts`:

```typescript
export const FIXTURES = {
  videoH264: join(FIXTURES_DIR, "video-h264.mp4"),
  videoShort: join(FIXTURES_DIR, "video-short.mp4"),
  videoNoAudio: join(FIXTURES_DIR, "video-no-audio.mp4"),
  audioSpeech: join(FIXTURES_DIR, "audio-speech.wav"),
  audioMusic: join(FIXTURES_DIR, "audio-music.wav"),
  audioSilence: join(FIXTURES_DIR, "audio-silence.wav"),
  image1080p: join(FIXTURES_DIR, "image-1080p.jpg"),
};
```

**Acceptance Criteria**:
- [ ] `generate.sh` produces all 7 fixtures (4 existing + 3 new)
- [ ] `video-no-audio.mp4` has no audio stream (probe confirms 0 audio streams)
- [ ] `audio-music.wav` is stereo, 48kHz, ~5s
- [ ] `audio-silence.wav` has a detectable 2s silence gap in the middle
- [ ] `FIXTURES` object in helpers.ts includes all 7 paths
- [ ] Total fixture size stays under 5 MB

---

### Unit 6: Barrel Export Updates

**File**: `src/types/index.ts` (add new type exports)

```typescript
// Add to existing exports:
export type { AudioInputConfig, ClipConfig, TransitionConfig } from "./filters.ts";
```

**File**: `src/index.ts` (add operation exports)

```typescript
// Add under Operations section:
export type { AudioBuilder } from "./operations/audio.ts";
export { audio } from "./operations/audio.ts";
export type { ConcatBuilder } from "./operations/concat.ts";
export { concat } from "./operations/concat.ts";

// Add to type exports:
// AudioInputConfig, ClipConfig, TransitionConfig
```

**Acceptance Criteria**:
- [ ] `import { audio, concat } from "@ffmpeg-sdk/core"` works
- [ ] `import type { AudioBuilder, ConcatBuilder, AudioInputConfig, ClipConfig, TransitionConfig } from "@ffmpeg-sdk/core"` works

---

## Implementation Order

1. **Unit 1: New Types** — Pure data, no dependencies. Needed by Units 2 & 4.
2. **Unit 3: Shared Utility** — Extract `buildAtempoChain` from transform.ts. Needed by Unit 2.
3. **Unit 5: Fixtures** — Generate and commit test fixtures. Needed by tests.
4. **Unit 2: AudioBuilder** — Depends on Units 1, 3. Most complex unit.
5. **Unit 4: ConcatBuilder** — Depends on Unit 1. Can be parallelized with Unit 2.
6. **Unit 6: Barrel Exports** — Final wiring. Depends on Units 2, 4.

---

## Testing

### Builder Tests: `__tests__/builder/audio.test.ts`

Test `toArgs()` output without executing ffmpeg.

```typescript
describe("audio()", () => {
  // --- Required field validation ---
  it("throws when input() is missing", () => {});
  it("throws when output() is missing", () => {});

  // --- Extract audio ---
  it("produces -vn for extractAudio()", () => {
    // args should contain -vn and no -af
  });
  it("produces codec args for extractAudio({ codec, bitrate, sampleRate, channels })", () => {
    // -c:a libmp3lame -b:a 192k -ar 44100 -ac 1
  });

  // --- Single-input filters ---
  it("produces highpass filter", () => {
    // -af "highpass=f=200:poles=2"
  });
  it("produces lowpass filter", () => {
    // -af "lowpass=f=8000:poles=2"
  });
  it("produces equalizer filter", () => {
    // -af "equalizer=f=1000:width_type=q:w=1:g=6"
  });
  it("produces bass filter", () => {
    // -af "bass=g=6:f=100"
  });
  it("produces treble filter", () => {
    // -af "treble=g=-3:f=3000"
  });
  it("produces acompressor filter", () => {
    // -af "acompressor=threshold=...:ratio=...:attack=...:release=..."
  });
  it("produces alimiter filter", () => {
    // -af "alimiter=limit=0.9:attack=5:release=50"
  });
  it("produces loudnorm filter", () => {
    // -af "loudnorm=I=-14:TP=-1.5:LRA=11"
  });
  it("throws in toArgs() for normalize({ twoPass: true })", () => {
    // toArgs() cannot run two passes
  });
  it("produces afade in filter", () => {
    // -af "afade=t=in:d=2:curve=tri"
  });
  it("produces afade out filter", () => {
    // -af "afade=t=out:d=3:st=7"
    // Note: startAt provided explicitly for toArgs()
  });
  it("produces agate filter", () => {});
  it("produces afftdn filter for denoise", () => {});
  it("produces echo filter", () => {});
  it("produces tempo filter with chaining for > 2x", () => {
    // -af "atempo=2,atempo=2" for 4x
  });
  it("produces rubberband filter for pitch", () => {});
  it("produces resample filter", () => {
    // -af "aresample=44100"
  });
  it("produces resample with soxr", () => {
    // -af "aresample=44100:resampler=soxr"
  });

  // --- Filter chain ordering ---
  it("applies filters in correct signal-flow order", () => {
    // highpass before compress before normalize before fadeIn
    const args = audio()
      .input("a.wav")
      .highpass(200)
      .normalize({ targetLufs: -14 })
      .compress()
      .fadeIn({ duration: 1 })
      .output("out.wav")
      .toArgs();
    const af = args[args.indexOf("-af") + 1];
    // Order: highpass → compress → loudnorm → afade
    expect(af.indexOf("highpass")).toBeLessThan(af.indexOf("acompressor"));
    expect(af.indexOf("acompressor")).toBeLessThan(af.indexOf("loudnorm"));
    expect(af.indexOf("loudnorm")).toBeLessThan(af.indexOf("afade"));
  });

  // --- Output codec/format ---
  it("produces codec and bitrate args", () => {
    // -c:a libopus -b:a 128k
  });
  it("produces sample rate and channels args", () => {
    // -ar 44100 -ac 1
  });
  it("produces channel layout arg", () => {
    // -channel_layout mono
  });

  // --- Silence detection mode ---
  it("produces silencedetect filter with -f null output for detectSilence", () => {
    // -af "silencedetect=noise=-40dB:d=0.5" -f null -
  });
});
```

### Builder Tests: `__tests__/builder/concat.test.ts`

```typescript
describe("concat()", () => {
  // --- Validation ---
  it("throws when fewer than 2 clips are added", () => {});
  it("throws when output() is missing", () => {});

  // --- Demuxer path ---
  it("produces concat demuxer args for simple concat (no transitions)", () => {
    // -f concat -safe 0 -i <list> -c copy output
  });

  // --- Filter complex path ---
  it("throws in toArgs() when transitions are used (needs probing)", () => {});
  it("throws in toArgs() when fillSilence is set (needs probing)", () => {});

  // --- Transition assignment ---
  it("transition() sets transitionAfter on the last clip", () => {
    // Internal state check via execute() behavior
  });

  // --- Normalization flags ---
  it("falls back to filter_complex when normalizeResolution is set", () => {
    // toArgs() should throw since filter_complex needs duration probing
  });
});
```

### E2E Tests: `__tests__/integration/audio.e2e.test.ts`

```typescript
describeWithFFmpeg("audio()", () => {
  // --- Extract audio ---
  it("extracts audio from video as WAV", async () => {
    // Input: FIXTURES.videoH264
    // Verify: output exists, has audio stream, no video stream, correct duration
  });
  it("extracts audio with codec and bitrate", async () => {
    // extractAudio({ codec: 'libmp3lame', bitrate: '192k' })
    // Verify: codec is mp3, duration close to input
  });

  // --- Mixing ---
  it("mixes two audio sources", async () => {
    // addInput(speech), addInput(music, { volume: 0.3 })
    // Verify: output duration = longest input, has audio
  });

  // --- Volume ---
  it("adjusts volume with dB string", async () => {
    // Verify: output valid, loudness differs from input
  });

  // --- Ducking ---
  it("applies sidechain ducking", async () => {
    // input(music), addInput(speech) with duck({ trigger: 1, amount: -12 })
    // Verify: output exists, duration correct
  });

  // --- Normalize ---
  it("normalizes loudness (single-pass) to target LUFS", async () => {
    // normalize({ targetLufs: -14 })
    // Verify: measure output LUFS within ±2 of target using loudnorm measurement pass
  });
  it("normalizes loudness (two-pass) to target LUFS", async () => {
    // normalize({ targetLufs: -14, twoPass: true })
    // Verify: measure output LUFS within ±1 of target (tighter tolerance — linear gain)
    // Also verify result.loudness fields are populated
  });

  // --- Fades ---
  it("applies fade in", async () => {
    // fadeIn({ duration: 1 })
    // Verify: output valid, same duration as input
  });
  it("applies fade out", async () => {
    // fadeOut({ duration: 1 })
    // Verify: output valid, same duration as input
  });

  // --- Tempo ---
  it("changes tempo 2x", async () => {
    // tempo(2)
    // Verify: output duration ≈ input / 2
  });

  // --- Filters ---
  it("applies highpass filter", async () => {
    // highpass(200)
    // Verify: output valid, codec correct
  });
  it("applies lowpass filter", async () => {
    // lowpass(8000)
    // Verify: output valid, codec correct
  });
  it("resamples to different sample rate", async () => {
    // resample(44100)
    // Verify: output sample rate is 44100
  });
  it("converts channel count", async () => {
    // channels(2) on mono input
    // Verify: output channels = 2
  });

  // --- Silence detection ---
  it("detects silence ranges", async () => {
    // Input: FIXTURES.audioSilence
    // detectSilence({ threshold: -40, duration: 0.5 })
    // Verify: silenceRanges has at least one entry, start ~1.5s, end ~3.5s
  });

  // --- tryExecute ---
  it("tryExecute returns success on valid input", async () => {});
  it("tryExecute returns failure on invalid input", async () => {});
});
```

### E2E Tests: `__tests__/integration/concat.e2e.test.ts`

```typescript
describeWithFFmpeg("concat()", () => {
  // --- Simple concat (demuxer) ---
  it("concatenates 2 clips without transitions (demuxer)", async () => {
    // addClip(videoShort), addClip(videoShort)
    // Verify: duration ≈ 4s (2+2), method = 'demuxer', codec = h264
  });

  // --- Crossfade transition ---
  it("concatenates with crossfade transition", async () => {
    // addClip(videoShort).transition({ type: 'dissolve', duration: 0.5 }).addClip(videoShort)
    // Verify: duration ≈ 3.5s (4 - 0.5), method = 'filter_complex'
  });

  // --- Fadeblack transition ---
  it("concatenates with fadeblack transition", async () => {
    // transition({ type: 'fadeblack', duration: 1 })
    // Verify: output valid, correct duration
  });

  // --- Mixed sources ---
  it("concatenates clips from different resolutions with normalizeResolution", async () => {
    // addClip(videoH264 @ 1920x1080), addClip(videoShort @ 640x360)
    // normalizeResolution(640, 360)
    // Verify: output dimensions 640x360
  });

  // --- 5+ clips ---
  it("concatenates 5 clips", async () => {
    // 5x videoShort
    // Verify: duration ≈ 10s, output playable (no timebase drift)
  }, 60_000);

  // --- Per-clip trim ---
  it("concatenates with per-clip trimming", async () => {
    // addClip({ path: videoShort, trimStart: 0.5, duration: 1 })
    // addClip({ path: videoShort, trimStart: 0, duration: 1 })
    // Verify: duration ≈ 2s
  });

  // --- Missing audio fill ---
  it("fills silence for clips without audio", async () => {
    // addClip(videoNoAudio).addClip(videoShort).fillSilence()
    // Verify: output has audio stream, no error
  });

  // --- tryExecute ---
  it("tryExecute returns failure for nonexistent clip", async () => {});
});
```

---

## Verification Checklist

```bash
# Build
pnpm build

# Typecheck
pnpm tsc --noEmit

# Lint
pnpm biome check src/

# Unit/Builder tests
pnpm vitest run __tests__/builder/audio.test.ts
pnpm vitest run __tests__/builder/concat.test.ts

# E2E tests
pnpm vitest run __tests__/integration/audio.e2e.test.ts
pnpm vitest run __tests__/integration/concat.e2e.test.ts

# All tests (3 consecutive runs for flakiness check)
pnpm test && pnpm test && pnpm test
```

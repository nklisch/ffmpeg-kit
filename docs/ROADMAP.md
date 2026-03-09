# FFmpeg SDK - Implementation Roadmap

Layer-by-layer build-out from core → encoding → operations → filters → convenience.
Each phase completes a layer fully (including new features) before moving up.

Reference: `ARCH.md` (architecture), `INTERFACE.md` (public API), `TESTING.md` (test rules).
Source material: termtube `src/lib/ffmpeg/` and youtube-ts-auto `packages/shared/src/ffmpeg/`.

---

## Phase 1: Project Scaffolding

Set up the repo, toolchain, and CI foundation.

- [x] `package.json` — `@ffmpeg-sdk/core`, ESM, Node >= 22, workspace-compatible
- [x] `tsconfig.json` — strict, ES2024, Bundler resolution, `verbatimModuleSyntax`
- [x] `tsup.config.ts` — ESM only, dts, sourcemaps
- [x] `biome.json` — SDK's own lint/format rules (decide quote style, line width)
- [x] `vitest.config.ts` — pool: forks, maxForks: 4, 30s timeout, tier structure
- [x] Directory skeleton: `src/`, `__tests__/`, all subdirectories per ARCH.md
- [x] `src/index.ts` — empty barrel export placeholder
- [x] CI: lint + typecheck + Tier 1 tests (no ffmpeg needed)

**Done when:** `pnpm build` produces `dist/`, `pnpm check` passes, `pnpm test` runs (0 tests).

---

## Phase 2: Types & Schemas

All shared type definitions and Zod schemas. No runtime code yet.

- [x] `src/types/options.ts` — `ExecuteOptions`, `ProgressInfo`, `FFmpegLogLevel`, `Timestamp`
- [x] `src/types/codecs.ts` — `VideoCodec`, `AudioCodec`, `PixelFormat`, `EncodingPreset`, `ContainerFormat`
- [x] `src/types/results.ts` — `ExecuteResult`, `ExtractResult`, `TransformResult`, `AudioResult`, `ConcatResult`, `ExportResult`, `OverlayResult`, `TextResult`, `SubtitleResult`, `ImageResult`, `StreamResult`, `GifResult`
- [x] `src/types/probe.ts` — `ProbeResult`, `FormatInfo`, `VideoStreamInfo`, `AudioStreamInfo`, `SubtitleStreamInfo`, `StreamDisposition`, `ChapterInfo`
- [x] `src/types/filters.ts` — `TransitionType`, `FadeCurve`, `BlendMode`, `FitMode`, `ScaleAlgorithm`, `EasingFunction`, `KenBurnsConfig`, `CropConfig`, `DuckConfig`, `NormalizeConfig`, position types
- [x] `src/types/errors.ts` — `FFmpegErrorCode` enum, `FFmpegError` class
- [x] `src/schemas/probe.ts` — Zod schemas for ffprobe JSON output (port from existing)
- [x] Barrel export all types from `src/index.ts`

**Done when:** `pnpm build` succeeds, all types are importable, Zod schemas compile.

---

## Phase 3: Core Layer

`execute()`, `probe()`, `validateInstallation()`, and supporting utilities.

### Utilities
- [x] `src/util/timecode.ts` — `parseTimecode()` supporting HH:MM:SS, MM:SS, seconds, percentage
- [x] `src/util/tempfile.ts` — temp file creation with auto-cleanup (`tmp()` helper, `TempFile` class)
- [x] `src/util/cache.ts` — generic TTL + LRU cache (used by probe, hardware detection)
- [x] `src/util/platform.ts` — OS detection, path normalization
- [x] `src/util/logger.ts` — optional pino integration (no-op by default)

### Core
- [x] `src/core/args.ts` — argument builder utilities, escaping, flag construction
- [x] `src/core/execute.ts` — process spawning, `-progress pipe:1` parsing, timeout, cancellation via AbortSignal, `overwrite` flag
- [x] `src/core/probe.ts` — ffprobe wrapper, Zod validation, caching by `(path, mtime)`, `probe()`, `getDuration()`, `getVideoStream()`, `getAudioStream()`
- [x] `src/core/validate.ts` — binary discovery, version parsing, capability detection

### Tests
- [x] Unit: timecode parsing edge cases
- [x] Unit: cache TTL/LRU eviction
- [x] Unit: args builder escaping
- [x] E2E: `execute()` basic, timeout, cancellation, progress, bad input
- [x] E2E: `probe()` video, audio, chapters, caching, `getDuration()`
- [x] E2E: `validateInstallation()` returns versions

### Fixtures
- [x] `__tests__/fixtures/generate.sh` — generates all test fixtures from scratch
- [x] `__tests__/helpers.ts` — `tmp()`, `expectFileExists()`, `probeOutput()`, `expectDurationClose()`, `expectDimensions()`, `expectCodec()`, `describeWithFFmpeg`
- [x] Generate initial fixtures: `video-h264.mp4`, `video-short.mp4`, `audio-speech.wav`

**Done when:** `ffmpeg.execute()`, `ffmpeg.probe()`, `ffmpeg.validateInstallation()` work. All core E2E tests pass.

---

## Phase 4: Hardware & Encoding Layer

GPU detection, session management, fallback logic, encoder config, and presets.

### Hardware
- [x] `src/hardware/detect.ts` — `detectHardware()`, cached singleton, queries encoders/decoders + nvidia-smi/vainfo
- [x] `src/hardware/session.ts` — `acquireSession()`, `withHwSession()`, ref-counted NVENC/QSV tracking (2 consumer / 8 pro)
- [x] `src/hardware/fallback.ts` — auto-fallback: hwaccel → CPU on failure with retry + logging

### Encoding
- [x] `src/encoding/codecs.ts` — codec registry: availability detection, capability mapping
- [x] `src/encoding/config.ts` — `buildEncoderArgs()` from quality tier + hw mode, `EncoderConfig` builder
- [x] `src/encoding/presets.ts` — `YOUTUBE_PRESETS`, `SOCIAL_PRESETS`, `QUALITY_PRESETS`, `QUALITY_PRESETS_NVENC`, `QUALITY_PRESETS_AV1`

### Tests
- [x] Unit: preset config validation (all presets produce valid args)
- [x] Unit: encoder arg construction for each codec family
- [x] E2E: `detectHardware()` returns available methods
- [x] E2E: NVENC encode (gated by `FFMPEG_HW_TESTS=1`)
- [x] E2E: auto fallback to CPU

**Done when:** `ffmpeg.detectHardware()`, `buildEncoderArgs()`, all presets work. Hardware-gated tests pass on GPU machines, skip cleanly elsewhere.

---

## Phase 5: Operation Builders — Extract & Transform

Port and extend the two simplest operation builders.

### Extract
- [x] `src/operations/extract.ts` — `ExtractBuilder` with: input, timestamp (seconds/timecode/percentage), size, format (png/jpg/webp/bmp/tiff), quality, frames, thumbnail (scene detect), output, toArgs, execute, tryExecute

### Transform
- [x] `src/operations/transform.ts` — `TransformBuilder` with: input, scale, fit, scaleAlgorithm, crop, kenBurns, speed, reverse, trimStart, trimEnd, duration, loop, fps, interpolate, pad, rotate, flipH, flipV, stabilize, outputSize, hwAccel, output, toArgs, execute, tryExecute

### Tests
- [x] Builder: extract arg ordering (`-ss` before `-i`), format/quality flags
- [x] Builder: transform scale filters, crop expressions, speed setpts, Ken Burns zoompan
- [x] E2E: extract at timestamp, percentage, with resize, JPEG, WebP, thumbnail
- [x] E2E: scale (width-only, both dims, contain, cover), crop (aspect ratio, explicit), Ken Burns, speed (2x, 0.5x, 4x), trim, loop, rotate, flip, pad, fps, reverse
- [x] Fixtures: `image-1080p.jpg` (for Ken Burns)

**Done when:** All extract and transform rows in the TESTING.md coverage matrix pass.

---

## Phase 6: Operation Builders — Audio & Concat

The two most complex existing operations.

### Audio
- [x] `src/operations/audio.ts` — `AudioBuilder` with: input, addInput, extractAudio, duck, normalize, fadeIn, fadeOut, compress, limit, eq, highpass, lowpass, bass, treble, gate, denoise, deess, echo, tempo, pitch, resample, codec, bitrate, sampleRate, channels, channelLayout, detectSilence, extractAmplitude, output, toArgs, execute, tryExecute

### Concat
- [x] `src/operations/concat.ts` — `ConcatBuilder` with: addClip, transition, defaultTransition, audioCrossfade, normalizeResolution, normalizeFps, fillSilence, hwAccel, output, toArgs, execute, tryExecute
- [x] Two paths: concat demuxer (no transitions) vs filter_complex (with transitions)
- [x] Silent audio generation for video-only clips

### Tests
- [x] Builder: audio filter chain construction, volume resolution, ducking filter graph
- [x] Builder: concat demuxer file list, xfade filter graph construction
- [x] E2E: extract audio, mix, volume, ducking, normalize (measure LUFS), fades, tempo, highpass, lowpass, resample, channel conversion, silence detection
- [x] E2E: simple concat, crossfade, fadeblack, mixed sources, 5+ clips, per-clip trim, missing audio
- [x] Fixtures: `video-no-audio.mp4`, `audio-music.wav`, `audio-silence.wav`

**Done when:** All audio and concat rows in the TESTING.md coverage matrix pass.

---

## Phase 7: Operation Builders — Export, Overlay, Text

Final export + the first two new operations not in existing codebases.

### Export
- [ ] `src/operations/export.ts` — `ExportBuilder` with: videoInput, audioInput, input, preset, qualityTier, videoCodec, crf, videoBitrate, maxVideoBitrate, encodingPreset, pixelFormat, profile, level, tune, audioCodec, audioBitrate, audioSampleRate, audioChannels, faststart, format, hwAccel, twoPass, map, outputArgs, inputArgs, metadata, chapters, output, toArgs, execute, tryExecute

### Overlay
- [ ] `src/operations/overlay.ts` — `OverlayBuilder` with: base, addOverlay (position/anchor/scale/opacity/time/fade/blend/chromaKey/colorKey), pip, watermark, output, toArgs, execute, tryExecute

### Text
- [ ] `src/operations/text.ts` — `TextBuilder` with: input, addText (position/anchor/style/time/timecode/enable), scroll, counter, output, toArgs, execute, tryExecute

### Tests
- [ ] Builder: export preset resolution, faststart flag, stream mapping, metadata args
- [ ] Builder: overlay position calculation, anchor→xy conversion, chroma key filter
- [ ] Builder: drawtext escaping, style→filter params, scroll expression
- [ ] E2E: export with each YouTube preset, separate audio input, custom CRF, MKV, WebM, faststart, metadata
- [ ] E2E: image overlay, opacity, time range, PiP, chroma key
- [ ] E2E: basic drawtext, box background, time range, multiple texts
- [ ] Fixtures: `image-small.png` (overlay/watermark)

**Done when:** All export, overlay, and text rows in the coverage matrix pass.

---

## Phase 8: Operation Builders — Subtitle, Image, Streaming, GIF

Remaining new operations.

### Subtitle
- [ ] `src/operations/subtitle.ts` — `SubtitleBuilder` with: input, softSub, hardBurn, extract, convert, output, toArgs, execute, tryExecute

### Image
- [ ] `src/operations/image.ts` — `ImageBuilder` with: input, imageSequence, convert, resize, toVideo, testPattern, solidColor, silentAudio, output, toArgs, execute, tryExecute

### Streaming
- [ ] `src/operations/streaming.ts` — `HlsBuilder` (segmentDuration, listSize, segmentFilename, segmentType, initFilename, playlistType, encrypt, baseUrl, flags, variants), `DashBuilder`, `streamTo()`

### GIF
- [ ] `src/operations/gif.ts` — `GifBuilder` with: input, size, fps, trimStart, duration, dither, paletteMode, maxColors, loop, optimizePalette, output, toArgs, execute, tryExecute

### Tests
- [ ] Builder: subtitle stream mapping, hardBurn filter, format conversion args
- [ ] Builder: image sequence input args, test pattern source filter, solidColor
- [ ] Builder: HLS segment args, DASH manifest args, variant stream mapping
- [ ] Builder: GIF palette filter graph (1-pass vs 2-pass)
- [ ] E2E: soft sub into MKV, hard burn SRT, extract subtitle
- [ ] E2E: image sequence → video, format conversion, image → video, test pattern
- [ ] E2E: HLS mpegts, HLS fmp4, DASH, segment duration
- [ ] E2E: basic GIF, palette optimization, FPS control
- [ ] Fixtures: `subtitle.srt`, `chapters.mkv`

**Done when:** All subtitle, image, streaming, and GIF rows in the coverage matrix pass.

---

## Phase 9: Filter Graph Builder

Low-level filter graph builder for advanced use cases.

- [ ] `src/filters/graph.ts` — `FilterGraphBuilder` with: videoFilter, audioFilter, complex, input mapping, output mapping, toString, toArgs
- [ ] `src/filters/video.ts` — video filter string builders (scale, crop, overlay, pad, rotate, etc.)
- [ ] `src/filters/audio.ts` — audio filter string builders (volume, loudnorm, afade, amix, etc.)
- [ ] `src/filters/helpers.ts` — filter expression helpers (time expressions, math, conditionals, escaping)
- [ ] `filter()` convenience: `filter('scale', { w: 1920, h: -2 })` → `"scale=w=1920:h=-2"`
- [ ] `chain()` convenience: joins filters with commas

### Tests
- [ ] Unit: filter string generation for each filter type
- [ ] Unit: complex graph with labeled pads, multi-input/output
- [ ] Unit: escaping special characters in filter values
- [ ] E2E: simple video filter chain applied to real file
- [ ] E2E: complex multi-input filter graph (e.g., 2 inputs overlaid)
- [ ] E2E: combined audio + video filter graph

**Done when:** All filter graph rows in the coverage matrix pass. Operation builders can optionally delegate to filter graph builder.

---

## Phase 10: Convenience Layer

High-level features built on top of operation builders.

### Pipeline
- [ ] `src/convenience/pipeline.ts` — `pipeline()` builder: step chaining, auto temp files, progress aggregation, `onStepComplete` callback, cleanup on success/failure

### Batch
- [ ] `src/convenience/batch.ts` — `batch()`: concurrent processing with configurable parallelism, per-item callbacks, aggregated results

### Smart Transcode
- [ ] `src/convenience/smart.ts` — `smartTranscode()`: probe → compare specs → copy or re-encode, returns action report

### Thumbnails & Waveform
- [ ] `src/convenience/thumbnail-sheet.ts` — `thumbnailSheet()`: grid extraction, uniform/scene timestamps
- [ ] `src/convenience/waveform.ts` — `waveform()`: amplitude extraction at target FPS

### Silence Utilities
- [ ] `src/convenience/silence.ts` — `detectSilence()`, `trimSilence()`, `splitOnSilence()`

### Estimation & Normalization
- [ ] `src/convenience/estimate.ts` — `estimateSize()`: bitrate × duration calculation
- [ ] `src/convenience/normalize-media.ts` — `normalizeMedia()`: batch normalize to consistent specs

### Quick Conversions
- [ ] One-liners: `remux()`, `compress()`, `extractAudio()`, `imageToVideo()`, `resize()`

### Tests
- [ ] E2E: pipeline multi-step (scale → normalize → export), verify no temp files remain
- [ ] E2E: batch 3 files, verify concurrency respected
- [ ] E2E: smart transcode (needs encode vs. copy)
- [ ] E2E: thumbnail sheet grid dimensions
- [ ] E2E: waveform sample count
- [ ] E2E: silence detection, trim, split
- [ ] E2E: file size estimation within 50% of actual
- [ ] E2E: remux, extractAudio, resize

**Done when:** All convenience rows in the coverage matrix pass.

---

## Phase 11: SDK Instance & Public API

Wire everything into the `createFFmpeg()` factory and default `ffmpeg` namespace.

- [ ] `createFFmpeg(config)` — factory with per-instance config (paths, tempDir, timeout, hwAccel, logLevel, cache settings)
- [ ] Default `ffmpeg` instance with auto-detected paths
- [ ] `ffmpeg.clearProbeCache()` utility
- [ ] Verify all methods accessible through the namespace: probe, execute, extract, transform, audio, concat, exportVideo, overlay, text, subtitle, image, hls, dash, gif, pipeline, batch, smartTranscode, thumbnailSheet, waveform, detectSilence, trimSilence, splitOnSilence, estimateSize, normalizeMedia, remux, compress, extractAudio, imageToVideo, resize, detectHardware, validateInstallation, parseTimecode, filterGraph, filter, chain
- [ ] Final `src/index.ts` barrel export — all public types + runtime exports
- [ ] Verify tree-shaking: named exports, `"sideEffects": false`

### Tests
- [ ] Multiple instances with different configs don't share state
- [ ] Default instance works with no config
- [ ] All namespace methods are callable

**Done when:** `import { ffmpeg } from '@ffmpeg-sdk/core'` provides the full API surface. `import { createFFmpeg } from '@ffmpeg-sdk/core'` allows custom instances.

---

## Phase 12: Polish & Publish

Final hardening before consumption by other projects.

- [ ] Full TESTING.md coverage matrix audit — every row green
- [ ] Run all tests 3x consecutively to verify no flakiness
- [ ] `pnpm build` — clean build, verify `dist/` output (ESM + .d.ts + sourcemaps)
- [ ] Verify `dist/index.d.ts` exports all public types correctly
- [ ] Package size audit — no accidental bundling of test fixtures or dev deps
- [ ] Add `workspace:*` support for monorepo consumption
- [ ] Stress tests (gated): long files, many clips, concurrent batch, hw session limits
- [ ] Final biome pass — zero warnings
- [ ] Tag `v0.1.0`

**Done when:** SDK is consumable as `workspace:*` dependency. All tests pass. Ready for termtube and youtube-ts-auto migration.

# FFmpeg SDK - Testing Rules

## Core Rule

**Every feature that maps to an FFmpeg operation MUST have an end-to-end test that runs the real
`ffmpeg` binary, produces a real output file, and makes verifiable assertions on that output.**

Unit tests that mock `execute()` and assert on argument arrays are supplementary. They are not
sufficient on their own. The FFmpeg CLI is the source of truth - if a test doesn't run the binary,
it doesn't prove the feature works.

---

## Test Tiers

### Tier 1: Builder Tests (unit)

Assert that builders produce correct argument arrays. These are fast, run without ffmpeg, and
catch regressions in argument construction logic.

```typescript
// What these test:
// - Correct flag ordering (-ss before -i for fast seek)
// - Filter string syntax (scale=1920:-2, not scale=1920:auto)
// - Option mapping (crf(23) → ['-crf', '23'])
// - Validation errors (missing input throws)

it('places -ss before -i for fast seeking', () => {
  const args = extract()
    .input('/video.mp4')
    .timestamp(30)
    .output('/frame.png')
    .toArgs();

  const ssIndex = args.indexOf('-ss');
  const iIndex = args.indexOf('-i');
  expect(ssIndex).toBeLessThan(iIndex);
});
```

**Rules:**
- Use `.toArgs()` to inspect generated arguments
- No mocking of `execute()` - just don't call `.execute()`
- No ffmpeg binary needed
- Fast: entire tier runs in < 2 seconds

### Tier 2: E2E Feature Tests (integration)

**This is the mandatory tier.** Every operation, filter, codec path, and convenience feature
MUST have at least one E2E test that:

1. Runs `ffmpeg` with real arguments
2. Produces a real output file
3. Probes the output with `ffprobe` to verify properties
4. Makes assertions on measurable, deterministic properties

```typescript
it('scales video to 640x360', async () => {
  const output = tmp('scaled.mp4');

  await transform()
    .input(FIXTURES.video)
    .scale({ width: 640, height: 360 })
    .output(output)
    .execute();

  // REQUIRED: verify the file exists and has content
  const stat = statSync(output);
  expect(stat.size).toBeGreaterThan(0);

  // REQUIRED: probe output and verify the property the test is about
  const info = await probe(output);
  expect(info.streams[0].width).toBe(640);
  expect(info.streams[0].height).toBe(360);
});
```

### Tier 3: Stress / Regression Tests (integration)

Longer-running tests for edge cases, multi-clip operations, hardware paths, and known
FFmpeg pitfalls. Gated behind a `FFMPEG_STRESS_TESTS=1` env var.

---

## What Must Be Verified

Every E2E test MUST verify at minimum:

### For video output:
| Property | How to verify | Tolerance |
|----------|---------------|-----------|
| File exists | `existsSync(output)` | exact |
| File has content | `statSync(output).size > 0` | exact |
| Correct dimensions | `probe → stream.width/height` | exact |
| Correct duration | `probe → format.duration` | +/- 0.5s (or 10% for short clips) |
| Correct codec | `probe → stream.codec_name` | exact |
| Correct pixel format | `probe → stream.pix_fmt` | exact (when explicitly set) |
| Has audio when expected | `probe → streams.filter(s => s.type === 'audio').length` | exact |
| No corruption | File size is reasonable (not just headers) | `size > 1000` bytes |

### For audio output:
| Property | How to verify | Tolerance |
|----------|---------------|-----------|
| File exists + has content | `existsSync` + `statSync` | exact |
| Correct duration | `probe → format.duration` | +/- 0.5s |
| Correct codec | `probe → stream.codec_name` | exact |
| Correct sample rate | `probe → stream.sample_rate` | exact |
| Correct channel count | `probe → stream.channels` | exact |
| Loudness (if normalized) | 2-pass loudnorm measurement | +/- 1 LUFS |

### For image output:
| Property | How to verify | Tolerance |
|----------|---------------|-----------|
| File exists + has content | `existsSync` + `statSync` | exact |
| Correct dimensions | `probe → stream.width/height` | exact |
| Correct format | `probe → stream.codec_name` (png/mjpeg/webp) | exact |
| Minimum quality | `statSync(output).size` above a floor | format-dependent |

---

## Test Coverage Matrix

Every row in this table MUST have a passing E2E test. No exceptions. If a feature is added
to INTERFACE.md, a corresponding row is added here, and the feature is not considered
complete until the test passes.

### Core

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| `execute()` basic | `core/execute.e2e.test.ts` | Runs ffmpeg, returns stdout/stderr, exit code 0 |
| `execute()` timeout | `core/execute.e2e.test.ts` | Times out, kills process, throws TIMEOUT error |
| `execute()` cancellation | `core/execute.e2e.test.ts` | AbortSignal cancels, throws CANCELLED error |
| `execute()` progress | `core/execute.e2e.test.ts` | onProgress called with frame/fps/percent values |
| `execute()` bad input | `core/execute.e2e.test.ts` | Non-existent input throws INPUT_NOT_FOUND |
| `validateInstallation()` | `core/validate.e2e.test.ts` | Returns version strings for ffmpeg and ffprobe |
| `probe()` video | `core/probe.e2e.test.ts` | Returns correct dimensions, duration, codec, fps |
| `probe()` audio | `core/probe.e2e.test.ts` | Returns correct sample rate, channels, codec |
| `probe()` chapters | `core/probe.e2e.test.ts` | Returns chapter start/end/title from MKV with chapters |
| `probe()` caching | `core/probe.e2e.test.ts` | Second call returns same result without spawning ffprobe |
| `getDuration()` | `core/probe.e2e.test.ts` | Returns duration matching probe().format.duration |

### Extract

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Extract frame at timestamp | `operations/extract.e2e.test.ts` | PNG output, correct dimensions |
| Extract at percentage | `operations/extract.e2e.test.ts` | Frame from correct position (verify via pixel data or timestamp) |
| Extract with resize | `operations/extract.e2e.test.ts` | Output dimensions match requested size |
| Extract as JPEG | `operations/extract.e2e.test.ts` | Output is JPEG, quality affects file size |
| Extract as WebP | `operations/extract.e2e.test.ts` | Output is WebP format |
| Thumbnail (scene detect) | `operations/extract.e2e.test.ts` | Produces output (best-of-N selection) |

### Transform

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Scale (width only) | `operations/transform.e2e.test.ts` | Output width matches, height auto-calculated |
| Scale (both dims) | `operations/transform.e2e.test.ts` | Exact output dimensions |
| Scale with fit:contain | `operations/transform.e2e.test.ts` | Output has padding (letterbox/pillarbox) |
| Scale with fit:cover | `operations/transform.e2e.test.ts` | Output fills target, content cropped |
| Crop by aspect ratio | `operations/transform.e2e.test.ts` | Output aspect ratio matches requested |
| Crop explicit dimensions | `operations/transform.e2e.test.ts` | Output dimensions exact |
| Ken Burns on image | `operations/transform.e2e.test.ts` | Video output with correct duration, resolution |
| Ken Burns zoom range | `operations/transform.e2e.test.ts` | First frame vs last frame differ (motion occurred) |
| Speed 2x | `operations/transform.e2e.test.ts` | Output duration ~= input duration / 2 |
| Speed 0.5x | `operations/transform.e2e.test.ts` | Output duration ~= input duration * 2 |
| Speed 4x (chained atempo) | `operations/transform.e2e.test.ts` | Output duration ~= input duration / 4 |
| Trim start | `operations/transform.e2e.test.ts` | Output duration = original - trim |
| Trim start + duration | `operations/transform.e2e.test.ts` | Output duration matches requested |
| Loop | `operations/transform.e2e.test.ts` | Output duration = input * loop count |
| Rotate 90 | `operations/transform.e2e.test.ts` | Width/height swapped |
| Flip horizontal | `operations/transform.e2e.test.ts` | Output valid (pixel verification optional) |
| Flip vertical | `operations/transform.e2e.test.ts` | Output valid |
| Pad | `operations/transform.e2e.test.ts` | Output dimensions = padded dimensions |
| FPS conversion | `operations/transform.e2e.test.ts` | Output frame rate matches requested |
| Reverse | `operations/transform.e2e.test.ts` | Output valid, duration matches |

### Audio

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Extract audio from video | `operations/audio.e2e.test.ts` | Audio-only output, correct codec/rate |
| Mix two sources | `operations/audio.e2e.test.ts` | Output duration = longest input |
| Volume adjustment (dB) | `operations/audio.e2e.test.ts` | Loudness measurement differs from input |
| Ducking (sidechain) | `operations/audio.e2e.test.ts` | Output exists, duration correct |
| Normalize (EBU R128) | `operations/audio.e2e.test.ts` | Measured LUFS within 1 of target |
| Fade in | `operations/audio.e2e.test.ts` | Output valid, duration matches input |
| Fade out | `operations/audio.e2e.test.ts` | Output valid, duration matches input |
| Tempo change | `operations/audio.e2e.test.ts` | Output duration = input / factor |
| High-pass filter | `operations/audio.e2e.test.ts` | Output valid, codec correct |
| Low-pass filter | `operations/audio.e2e.test.ts` | Output valid, codec correct |
| Resample | `operations/audio.e2e.test.ts` | Output sample rate matches requested |
| Channel conversion | `operations/audio.e2e.test.ts` | Output channel count matches |
| Silence detection | `operations/audio.e2e.test.ts` | Returns silence ranges from known-silent fixture |

### Concat

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Simple concat (no transitions) | `operations/concat.e2e.test.ts` | Duration = sum of clips, no re-encode (codec copy) |
| Concat with crossfade | `operations/concat.e2e.test.ts` | Duration = sum - transition overlap |
| Concat with fadeblack | `operations/concat.e2e.test.ts` | Output valid, correct duration |
| Concat mixed sources | `operations/concat.e2e.test.ts` | Video from different codecs/resolutions works |
| Concat 5+ clips | `operations/concat.e2e.test.ts` | No timebase drift, output playable |
| Concat with per-clip trim | `operations/concat.e2e.test.ts` | Duration reflects trimmed clips |
| Concat audio-only clips missing audio | `operations/concat.e2e.test.ts` | Silent audio generated, no error |

### Export

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Export with youtube_hd preset | `operations/export.e2e.test.ts` | H.264 + AAC, yuv420p, faststart |
| Export with youtube_4k preset | `operations/export.e2e.test.ts` | Higher CRF/quality than HD |
| Export with youtube_draft preset | `operations/export.e2e.test.ts` | Fast encode, lower quality (verify speed) |
| Separate video + audio inputs | `operations/export.e2e.test.ts` | Both streams present in output |
| Custom CRF | `operations/export.e2e.test.ts` | Output valid, file size varies with CRF |
| Custom video bitrate | `operations/export.e2e.test.ts` | Output bitrate near target |
| MKV output | `operations/export.e2e.test.ts` | Format is matroska |
| WebM output (VP9 + Opus) | `operations/export.e2e.test.ts` | Correct codecs for container |
| Faststart flag | `operations/export.e2e.test.ts` | moov atom at start (verify with probe or binary inspection) |
| Metadata | `operations/export.e2e.test.ts` | Probe shows metadata tags |
| Stream mapping | `operations/export.e2e.test.ts` | Only mapped streams present |

### Overlay

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Image overlay on video | `operations/overlay.e2e.test.ts` | Output valid, same duration as base |
| Overlay with opacity | `operations/overlay.e2e.test.ts` | Output valid |
| Overlay with time range | `operations/overlay.e2e.test.ts` | Output valid, duration matches base |
| PiP (picture-in-picture) | `operations/overlay.e2e.test.ts` | Output dimensions = base dimensions |
| Chroma key | `operations/overlay.e2e.test.ts` | Output valid (green removed) |

### Text

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Basic drawtext | `operations/text.e2e.test.ts` | Output valid, same duration as input |
| Text with box background | `operations/text.e2e.test.ts` | Output valid |
| Text with time range | `operations/text.e2e.test.ts` | Output valid |
| Multiple text elements | `operations/text.e2e.test.ts` | Output valid |

### Subtitle

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Soft sub (SRT into MKV) | `operations/subtitle.e2e.test.ts` | Subtitle stream present in output |
| Hard burn (SRT) | `operations/subtitle.e2e.test.ts` | No subtitle stream (burned in), video re-encoded |
| Extract subtitle stream | `operations/subtitle.e2e.test.ts` | SRT file output with content |

### Image

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Image sequence to video | `operations/image.e2e.test.ts` | Video with correct fps and frame count |
| Image format conversion | `operations/image.e2e.test.ts` | Output in target format |
| Image to video (still) | `operations/image.e2e.test.ts` | Video with exact duration |
| Test pattern generation | `operations/image.e2e.test.ts` | Output with correct dimensions |

### Streaming

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| HLS output (mpegts) | `operations/streaming.e2e.test.ts` | .m3u8 playlist + .ts segments exist |
| HLS output (fmp4) | `operations/streaming.e2e.test.ts` | .m3u8 + init.mp4 + .m4s segments |
| DASH output | `operations/streaming.e2e.test.ts` | .mpd manifest + segments |
| HLS segment duration | `operations/streaming.e2e.test.ts` | Segments are roughly target duration |

### GIF

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Basic GIF creation | `operations/gif.e2e.test.ts` | Output is valid GIF, correct dimensions |
| GIF with palette optimization | `operations/gif.e2e.test.ts` | 2-pass GIF smaller or better quality than 1-pass |
| GIF with FPS control | `operations/gif.e2e.test.ts` | Frame count matches expected (duration * fps) |

### Hardware Acceleration

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| detectHardware() | `hardware/detect.e2e.test.ts` | Returns available methods matching system |
| NVENC encode (if available) | `hardware/nvenc.e2e.test.ts` | Output valid, codec is h264_nvenc |
| VAAPI encode (if available) | `hardware/vaapi.e2e.test.ts` | Output valid |
| Auto fallback to CPU | `hardware/fallback.e2e.test.ts` | Succeeds even when hwaccel unavailable |

### Convenience

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Pipeline (multi-step) | `convenience/pipeline.e2e.test.ts` | Final output valid, no temp files remain |
| Batch processing | `convenience/batch.e2e.test.ts` | All outputs valid, concurrency respected |
| Smart transcode (needs encode) | `convenience/smart.e2e.test.ts` | Re-encodes when specs don't match |
| Smart transcode (copy) | `convenience/smart.e2e.test.ts` | Stream copies when specs already match |
| Thumbnail sheet | `convenience/thumbnail-sheet.e2e.test.ts` | Image output with correct grid dimensions |
| Waveform extraction | `convenience/waveform.e2e.test.ts` | Returns float array with expected sample count |
| Silence detection | `convenience/silence.e2e.test.ts` | Detects known silence in fixture |
| Trim silence | `convenience/silence.e2e.test.ts` | Output shorter than input |
| Split on silence | `convenience/silence.e2e.test.ts` | Multiple output files created |
| File size estimation | `convenience/estimate.e2e.test.ts` | Estimate within 50% of actual |
| remux() | `convenience/quick.e2e.test.ts` | Format changed, streams copied |
| extractAudio() | `convenience/quick.e2e.test.ts` | Audio-only output |
| resize() | `convenience/quick.e2e.test.ts` | Output dimensions correct |

### Filter Graph

| Feature | Test file | What to verify |
|---------|-----------|----------------|
| Simple video filter chain | `filters/graph.e2e.test.ts` | Output valid after chained filters |
| Complex filter graph (multi-input) | `filters/graph.e2e.test.ts` | Multiple inputs composited correctly |
| Audio + video combined graph | `filters/graph.e2e.test.ts` | Both streams processed |

---

## Test Fixtures

### Required Fixtures

All fixtures live in `__tests__/fixtures/`. They are committed to the repo (small files only).

| Fixture | Format | Properties | Purpose |
|---------|--------|------------|---------|
| `video-h264.mp4` | H.264 + AAC | 1920x1080, 5s, 30fps, stereo | Primary video test input |
| `video-short.mp4` | H.264 + AAC | 640x360, 2s, 30fps, stereo | Fast tests needing video |
| `video-no-audio.mp4` | H.264 only | 640x360, 2s, 30fps | Test audio-missing cases |
| `audio-speech.wav` | PCM s16le | 48kHz, mono, 3s, contains speech | Audio processing tests |
| `audio-music.wav` | PCM s16le | 48kHz, stereo, 5s | Mixing/ducking tests |
| `audio-silence.wav` | PCM s16le | 48kHz, mono, 5s, 2s silence in middle | Silence detection tests |
| `image-1080p.jpg` | JPEG | 1920x1080 | Ken Burns, overlay, image-to-video |
| `image-small.png` | PNG w/ alpha | 200x200 | Overlay/watermark tests |
| `subtitle.srt` | SRT | 3 entries over 5s | Subtitle tests |
| `chapters.mkv` | MKV w/ chapters | 5s, 2 chapters | Chapter probe test |

### Fixture Generation

Fixtures are generated via a script, not manually crafted. This ensures reproducibility.

```bash
# __tests__/fixtures/generate.sh
# Generates all test fixtures from scratch using ffmpeg
# Run once, commit the outputs

ffmpeg -f lavfi -i testsrc2=size=1920x1080:rate=30:duration=5 \
  -f lavfi -i sine=frequency=440:duration=5:sample_rate=48000 \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k \
  video-h264.mp4

# ... etc for each fixture
```

### Fixture Rules

- Total fixture size MUST stay under 5 MB
- Every fixture MUST be generatable from the script (no mystery binaries)
- Fixtures use the fastest possible encoding (`-preset ultrafast`, low resolution)
- Fixtures are deterministic: same script produces byte-identical output

---

## Test Infrastructure

### Test Helpers

```typescript
// __tests__/helpers.ts

/** Skip test suite if ffmpeg is not installed */
export const describeWithFFmpeg = ffmpegAvailable
  ? describe
  : describe.skip;

/** Create a temp file path that auto-cleans after test */
export function tmp(filename: string): string;

/** Assert output file exists and has minimum size */
export function expectFileExists(path: string, minBytes?: number): void;

/** Probe output and return typed result */
export function probeOutput(path: string): Promise<ProbeResult>;

/** Assert two durations are close (default tolerance: 0.5s) */
export function expectDurationClose(
  actual: number,
  expected: number,
  tolerance?: number,
): void;

/** Assert dimensions match exactly */
export function expectDimensions(
  probe: ProbeResult,
  width: number,
  height: number,
): void;

/** Assert codec matches */
export function expectCodec(
  probe: ProbeResult,
  streamType: 'video' | 'audio',
  codec: string,
): void;
```

### Environment Variables

| Variable | Effect |
|----------|--------|
| `FFMPEG_STRESS_TESTS=1` | Enable Tier 3 stress tests |
| `FFMPEG_HW_TESTS=1` | Enable hardware acceleration tests |
| `FFMPEG_PATH=/path/to/ffmpeg` | Override ffmpeg binary location |
| `FFPROBE_PATH=/path/to/ffprobe` | Override ffprobe binary location |
| `FFMPEG_TEST_TIMEOUT=60000` | Override default test timeout (ms) |

### Vitest Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: [
      // Tier 1: always run
      'src/**/*.test.ts',
      // Tier 2: always run (requires ffmpeg)
      '__tests__/**/*.e2e.test.ts',
    ],
    testTimeout: 30_000,       // 30s default for e2e
    hookTimeout: 15_000,
    pool: 'forks',             // Isolate tests (hwaccel session limits)
    poolOptions: {
      forks: { maxForks: 4 },  // Don't exceed NVENC session limits
    },
  },
});
```

---

## Rules for Writing E2E Tests

### DO:

1. **Probe every output.** Don't just check `existsSync` - probe it and verify properties.
2. **Use deterministic fixtures.** Never download from the internet during tests.
3. **Set explicit timeouts.** Video operations are slow. Use `{ timeout: 60_000 }` per test.
4. **Clean up temp files.** Use `afterAll` or the `tmp()` helper.
5. **Test the property the feature claims to control.** Scale test → verify dimensions.
   Speed test → verify duration. Normalize test → measure loudness.
6. **Use tolerances for time-based assertions.** FFmpeg duration is rarely exact to the millisecond.
   Use `toBeCloseTo(expected, 0)` or `expect(actual).toBeGreaterThan(expected - 0.5)`.
7. **Gate hardware tests.** Wrap in `describeIf(FFMPEG_HW_TESTS)` so they don't fail on CI
   without GPUs.
8. **Test error paths.** Verify that bad inputs produce the correct `FFmpegErrorCode`, not just
   a generic crash.

### DO NOT:

1. **Never mock `execute()` in E2E tests.** The whole point is to run the real binary.
2. **Never assert on stderr content.** FFmpeg stderr format changes between versions. Assert on
   output properties instead.
3. **Never use `sleep()` or polling.** FFmpeg operations are awaitable.
4. **Never assume hardware acceleration is available.** Always gate or auto-skip.
5. **Never use fixtures larger than 1 MB per file.** Generate small, fast test media.
6. **Never test visual quality subjectively.** Test measurable properties: dimensions, duration,
   codec, sample rate, file size, loudness. If you need visual verification, use PSNR/SSIM
   comparison against a reference.
7. **Never leave temp files on failure.** Use try/finally or the cleanup helper.

---

## CI Considerations

- **Tier 1 (builder tests)**: Run on every PR. No ffmpeg needed.
- **Tier 2 (E2E tests)**: Run on every PR. CI runner MUST have ffmpeg installed.
  Use `apt-get install ffmpeg` or equivalent in the CI image.
- **Tier 3 (stress tests)**: Run nightly or manually. Set `FFMPEG_STRESS_TESTS=1`.
- **Hardware tests**: Run on self-hosted runners with GPUs, or skip on standard CI.
  The `describeWithFFmpeg` + env var gating ensures no false failures.

### Minimum CI FFmpeg Version

CI MUST install FFmpeg >= 6.0. The SDK targets FFmpeg 6.x+ features. Tests MAY use features
from 7.x (xfade transitions added in earlier versions, but newer transitions require 7.x).
Gate version-specific tests:

```typescript
const ffmpegVersion = await getFFmpegVersion();
describeIf(ffmpegVersion >= 7)('FFmpeg 7.x features', () => {
  // ...
});
```

---

## Definition of Done

A feature is not complete until:

1. Builder test exists verifying argument construction
2. E2E test exists running real ffmpeg with real fixtures
3. E2E test probes the output and asserts on the relevant property
4. E2E test passes locally with the developer's ffmpeg installation
5. The feature's row in the coverage matrix above is filled in
6. Test is not flaky across 3 consecutive runs

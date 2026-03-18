# E2E Test Suite Enhancement Design

## Project Summary

**Type:** TypeScript SDK wrapping FFmpeg CLI with fluent builder pattern
**Entry point:** `import { ffmpeg } from "ffmpeg-kit"` or `import { createFFmpeg } from "ffmpeg-kit"`
**Target users:** Developers integrating FFmpeg into Node.js applications
**Existing coverage:** 840+ tests (271 unit, 397 builder, 172 integration) across 52 files

## Test Environment

- **Framework:** Vitest (forks pool, 4 workers, 30s timeout)
- **Fixtures:** Pre-generated media in `__tests__/fixtures/` (video, audio, image, subtitles)
- **Helpers:** `describeWithFFmpeg`, `tmp()`, `expectFileExists()`, `expectCodec()`, `expectDurationClose()`
- **Error philosophy:** Fail fast with clear errors. `FFmpegError` with specific `FFmpegErrorCode`, captured stderr, and command array.

## Existing Coverage Gaps

| Area | Current State | Gap |
|------|--------------|-----|
| Cross-operation workflows | No tests | No multi-step pipeline tests chaining real operations |
| Cancellation & timeout | Unit-tested parser | No e2e test of AbortSignal canceling a running ffmpeg |
| Progress callbacks | `parseProgressLine` unit-tested | No e2e test verifying onProgress fires during real encode |
| SDK instance isolation | 8 unit tests, 9 e2e | No test proving separate instances have separate caches |
| Batch concurrency | 6 unit tests | No test verifying concurrency limit is respected |
| Smart transcode decisions | 1 e2e test | No test verifying copy-vs-transcode decision correctness |
| Pipeline chaining | Basic e2e exists | No multi-step pipeline with diverse operations |
| Special characters in paths | None | Spaces, unicode in file paths untested |
| Extreme media inputs | None | Very short (<0.1s), 0-byte, audio-only-where-video-expected |
| Binary not found | None | No e2e test with intentionally wrong ffmpegPath |
| tryExecute consistency | Tested in some builders | Not systematically tested across all operations |
| Overwrite behavior | None | No test verifying -y flag overwrites existing output |

---

## Golden-Path Tests

### Journey: Cross-Operation Workflows

**Priority:** High

These test realistic multi-step workflows that chain operations like real users do.

#### Test: probe then smart transcode based on probe results
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Probe input to get current codecs and dimensions
  2. Call `smartTranscode()` with a target that matches the input exactly
  3. Verify the result reports `copy_all` action (no re-encode needed)
  4. Probe output and verify codecs match input
- **Assertions:** `actions` includes `copy_all`, output duration matches input, codecs preserved
- **Teardown:** `tmp()` auto-cleanup

#### Test: probe then smart transcode requiring re-encode
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Probe input to get current codecs
  2. Call `smartTranscode()` with a different target codec (e.g., libx265)
  3. Verify the result reports `transcode_video` action
- **Assertions:** `actions` includes `transcode_video`, output has the target codec
- **Teardown:** `tmp()` auto-cleanup

#### Test: extract frame then use as overlay on another video
- **Setup:** FIXTURES.videoH264, FIXTURES.videoShort
- **Steps:**
  1. Extract a frame from videoH264 at 2s to a PNG
  2. Overlay the extracted PNG onto videoShort at top-right
  3. Probe the overlay output
- **Assertions:** Extracted PNG exists with valid dimensions, overlay output has same duration as videoShort, same dimensions
- **Teardown:** `tmp()` auto-cleanup for both outputs

#### Test: transform then export with specific encoding
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Transform: scale to 1280x720 and trim to 2s, output to intermediate file
  2. Export: take intermediate, apply youtube_hd preset, output to final
  3. Probe both outputs
- **Assertions:** Intermediate is 1280x720 with ~2s duration. Final has H.264+AAC, yuv420p, faststart.
- **Teardown:** `tmp()` auto-cleanup

#### Test: pipeline with multiple steps
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Build pipeline: step 1 = scale to 640x360, step 2 = trim to 2s
  2. Set input and output, execute
  3. Probe final output
- **Assertions:** Output is 640x360, ~2s duration, step count = 2
- **Teardown:** `tmp()` auto-cleanup

---

### Journey: SDK Instance Management

**Priority:** High

#### Test: separate SDK instances have isolated probe caches
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Create two SDK instances via `createFFmpeg()`
  2. Probe the same file with instance A
  3. Clear instance A's cache
  4. Probe again with instance B (should still be cached from its own cache — or not cached if never called)
  5. Verify instance B's probe works independently
- **Assertions:** Both instances return identical probe results, clearing one doesn't affect the other
- **Teardown:** None needed

#### Test: SDK instance with custom ffmpeg path
- **Setup:** System ffmpeg available
- **Steps:**
  1. Create SDK instance with `ffmpegPath: "ffmpeg"` (explicit)
  2. Run a simple extract operation
  3. Create SDK instance with `ffmpegPath: "/nonexistent/ffmpeg"`
  4. Attempt to run an operation
- **Assertions:** First succeeds, second throws FFmpegError with code BINARY_NOT_FOUND
- **Teardown:** None needed

#### Test: SDK instance with custom temp directory
- **Setup:** Create a unique temp dir
- **Steps:**
  1. Create SDK instance with custom `tempDir`
  2. Run a concat operation (which creates temp concat list files)
  3. Verify operation succeeds
- **Assertions:** Output file valid, temp dir was used (or at least operation succeeded)
- **Teardown:** Clean up custom temp dir

---

### Journey: Batch Processing

**Priority:** Medium

#### Test: batch process multiple files with concurrency limit
- **Setup:** FIXTURES.videoH264, FIXTURES.videoShort (use both as inputs)
- **Steps:**
  1. Run `batch()` with both inputs, concurrency: 1, operation: extract frame at 0.5s
  2. Verify both outputs exist
- **Assertions:** Both output files exist with valid dimensions, `results.length === 2`, all succeeded
- **Teardown:** `tmp()` auto-cleanup

#### Test: batch handles individual failures without stopping
- **Setup:** FIXTURES.videoH264 + a non-existent file path
- **Steps:**
  1. Run `batch()` with the valid file and the non-existent file
  2. Provide `onItemError` callback
- **Assertions:** One result succeeds, one fails, `onItemError` was called for the bad file, the good file's output is valid
- **Teardown:** `tmp()` auto-cleanup

---

### Journey: Progress Callbacks

**Priority:** Medium

#### Test: onProgress fires during a real encode
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Create an array to collect progress events
  2. Run `exportVideo().input(...).output(...).execute({ onProgress: (info) => events.push(info) })`
  3. Wait for completion
- **Assertions:** `events.length > 0`, each event has `frame >= 0`, `fps >= 0`, `time >= 0`. Last event's `time` is close to input duration.
- **Teardown:** `tmp()` auto-cleanup

#### Test: onProgress reports percent when totalDuration provided
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Probe input to get duration
  2. Run export with `onProgress` and `totalDuration` set to probed duration
  3. Collect progress events
- **Assertions:** At least one event has `percent` defined and > 0, last event's percent is close to 100
- **Teardown:** `tmp()` auto-cleanup

---

### Journey: Overwrite and Idempotency

**Priority:** Medium

#### Test: re-running export to same output path overwrites safely
- **Setup:** FIXTURES.videoShort
- **Steps:**
  1. Export to output path
  2. Record output file size
  3. Export again to the same path with different CRF
  4. Record new file size
- **Assertions:** Both operations succeed without error, file sizes differ (proving overwrite happened)
- **Teardown:** `tmp()` auto-cleanup

---

### Journey: Thin Integration Coverage Fill

**Priority:** High

#### Test: smart transcode with maxWidth constraint
- **Setup:** FIXTURES.videoH264 (1920x1080)
- **Steps:**
  1. Call `smartTranscode()` with `target: { maxWidth: 1280 }`
  2. Probe output
- **Assertions:** Output width <= 1280, `actions` includes `transcode_video`
- **Teardown:** `tmp()` auto-cleanup

#### Test: smart transcode with maxBitrate constraint
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Probe input to get bitrate
  2. Call `smartTranscode()` with `maxBitrate` well below input bitrate
- **Assertions:** `actions` includes `transcode_video`, output bitrate roughly at or below target
- **Teardown:** `tmp()` auto-cleanup

#### Test: normalizeMedia skips matching files
- **Setup:** FIXTURES.videoShort (640x360, 30fps)
- **Steps:**
  1. Call `normalizeMedia()` with target matching the input's specs exactly
  2. Check the result
- **Assertions:** Result action is `"copied"` (not `"transcoded"`), output file exists
- **Teardown:** `tmp()` auto-cleanup

#### Test: normalizeMedia transcodes non-matching files
- **Setup:** FIXTURES.videoH264 (1920x1080)
- **Steps:**
  1. Call `normalizeMedia()` with target `{ width: 640, height: 360, fps: 30 }`
- **Assertions:** Result action is `"transcoded"`, output is 640x360
- **Teardown:** `tmp()` auto-cleanup

#### Test: waveform extraction returns correct sample count
- **Setup:** FIXTURES.audioSpeech (~3s)
- **Steps:**
  1. Call `waveform()` with `samplesPerSecond: 30`
  2. Check returned data
- **Assertions:** `data.length` is approximately `duration * 30`, `sampleRate === 30`, all values in [0, 1] for peaks format
- **Teardown:** None (no output file)

#### Test: thumbnail sheet with uniform timestamps
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Call `thumbnailSheet()` with `columns: 4, rows: 2, width: 320, timestamps: "uniform"`
- **Assertions:** Output image exists, dimensions are `(320*4) x (height*2)`, `timestamps.length === 8`
- **Teardown:** `tmp()` auto-cleanup

#### Test: estimateSize returns reasonable estimate
- **Setup:** FIXTURES.videoH264
- **Steps:**
  1. Call `estimateSize()` with youtube_hd preset
  2. Actually encode with the same preset
  3. Compare estimate to actual
- **Assertions:** Estimate is within 3x of actual (generous tolerance for estimation)
- **Teardown:** `tmp()` auto-cleanup

---

## Adversarial / Failure-Mode Tests

### Category: User Mistakes

#### Test: missing input file throws INPUT_NOT_FOUND
- **Scenario:** User provides a path to a non-existent file
- **Action:** `ffmpeg.extract().input("/nonexistent/video.mp4").timestamp(1).output(tmp("out.png")).execute()`
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.INPUT_NOT_FOUND`
- **Verify:** Error has `stderr` and `command` populated, no output file created

#### Test: missing required builder fields throw before execution
- **Scenario:** User calls `execute()` without setting required fields
- **Action:** `ffmpeg.extract().output(tmp("out.png")).execute()` (no input)
- **Expected:** Throws `FFmpegError` with message containing `"input() is required"`
- **Verify:** No process spawned, error is synchronous

#### Test: tryExecute wraps error instead of throwing
- **Scenario:** User prefers Result types over exceptions
- **Action:** `ffmpeg.extract().input("/nonexistent.mp4").timestamp(1).output(tmp("out.png")).tryExecute()`
- **Expected:** Returns `{ success: false, error }` where error is `FFmpegError`, does NOT throw
- **Verify:** `result.success === false`, `result.error instanceof FFmpegError`

#### Test: tryExecute returns success data on valid operation
- **Scenario:** User calls tryExecute with valid input
- **Action:** `ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output(tmp("out.png")).tryExecute()`
- **Expected:** Returns `{ success: true, data }` with valid ExtractResult
- **Verify:** `result.success === true`, `result.data.outputPath` exists

#### Test: invalid codec name produces clear error
- **Scenario:** User passes a typo'd codec name
- **Action:** `ffmpeg.exportVideo().input(FIXTURES.videoShort).videoCodec("libx264typo" as any).output(tmp("out.mp4")).execute()`
- **Expected:** Throws `FFmpegError` (CODEC_NOT_AVAILABLE or ENCODING_FAILED)
- **Verify:** Error includes stderr with FFmpeg's codec error message

#### Test: concat with fewer than 2 clips throws
- **Scenario:** User tries to concatenate a single file
- **Action:** `ffmpeg.concat().addClip(FIXTURES.videoShort).output(tmp("out.mp4")).execute()`
- **Expected:** Throws `FFmpegError` with message `"concat() requires at least 2 clips"`
- **Verify:** Error thrown before FFmpeg process spawns

#### Test: probe on non-existent file throws INPUT_NOT_FOUND
- **Scenario:** User probes a missing file
- **Action:** `ffmpeg.probe("/nonexistent/file.mp4")`
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.INPUT_NOT_FOUND`
- **Verify:** Error message includes the file path

---

### Category: Bad Environment

#### Test: wrong ffmpegPath throws BINARY_NOT_FOUND
- **Scenario:** FFmpeg binary doesn't exist at configured path
- **Action:** Create SDK with `ffmpegPath: "/nonexistent/ffmpeg"`, then `sdk.execute(["-version"])`
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.BINARY_NOT_FOUND`
- **Verify:** Error message mentions "Failed to spawn ffmpeg"

#### Test: wrong ffprobePath throws BINARY_NOT_FOUND
- **Scenario:** FFprobe binary doesn't exist at configured path
- **Action:** Create SDK with `ffprobePath: "/nonexistent/ffprobe"`, then `sdk.probe(FIXTURES.videoShort)`
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.BINARY_NOT_FOUND`
- **Verify:** Error message mentions "Failed to spawn ffprobe"

#### Test: output to read-only directory throws OUTPUT_ERROR or PERMISSION_DENIED
- **Scenario:** User tries to write output to a directory without write permission
- **Action:** Create a read-only temp dir, then `ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output("/root/no-permission.png").execute()`
- **Expected:** Throws `FFmpegError` with an appropriate error code
- **Verify:** No partial output file left behind

---

### Category: Cancellation and Timeout

#### Test: AbortSignal cancels a running ffmpeg process
- **Scenario:** User wants to cancel a long operation
- **Action:**
  1. Create an AbortController
  2. Start a slow export (low preset for speed, but on a longer operation)
  3. After 500ms, call `controller.abort()`
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.CANCELLED`
- **Verify:** Process is killed, error message says "FFmpeg was cancelled"

#### Test: pre-aborted signal rejects immediately
- **Scenario:** User passes an already-aborted signal
- **Action:**
  1. Create an AbortController and immediately abort it
  2. Pass `signal` to execute
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.CANCELLED` without spawning a long-lived process
- **Verify:** Operation rejects quickly (< 1s)

#### Test: timeout kills process after configured duration
- **Scenario:** User sets a very short timeout
- **Action:** Run an export with `timeout: 100` (100ms — too short for any real encode)
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.TIMEOUT`
- **Verify:** Error message contains "timed out"

---

### Category: Boundary Conditions

#### Test: special characters in file paths (spaces)
- **Scenario:** Output path contains spaces
- **Action:** `ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output(tmp("my output file.png")).execute()`
- **Expected:** Operation succeeds, output file created at the path with spaces
- **Verify:** File exists and is valid (probe it)

#### Test: special characters in file paths (unicode)
- **Scenario:** Output path contains unicode characters
- **Action:** `ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output(tmp("frme-\u00e9\u00e8.png")).execute()`
- **Expected:** Operation succeeds
- **Verify:** File exists at the unicode path

#### Test: very short input clip (<0.5s)
- **Scenario:** Input is extremely short
- **Action:** Trim FIXTURES.videoShort to 0.1s using transform, then try to extract a frame at 0s
- **Expected:** Both operations succeed
- **Verify:** Transform output has very short duration, extract produces a valid PNG

#### Test: extract frame at timestamp beyond video duration
- **Scenario:** User requests a frame past the end of the video
- **Action:** `ffmpeg.extract().input(FIXTURES.videoShort).timestamp(999).output(tmp("out.png")).execute()`
- **Expected:** Either produces the last frame or throws a clear error (check current behavior)
- **Verify:** Consistent behavior, no crash

#### Test: empty/zero-byte input file
- **Scenario:** Input file exists but is 0 bytes
- **Action:** Create a 0-byte file, attempt to probe it
- **Expected:** Throws `FFmpegError` with `code === FFmpegErrorCode.INVALID_INPUT`
- **Verify:** Clear error message, no hang

#### Test: audio operation on video-only input
- **Scenario:** User tries to extract audio from a video with no audio stream
- **Action:** `ffmpeg.audio().input(FIXTURES.videoNoAudio).extractAudio().output(tmp("out.wav")).execute()`
- **Expected:** Either produces silent output or throws a clear error (check current behavior)
- **Verify:** Consistent, no crash or hang

#### Test: concurrent operations don't interfere
- **Scenario:** Multiple ffmpeg processes running simultaneously
- **Action:** Run 3 extract operations in parallel using `Promise.all()`
- **Expected:** All 3 succeed independently
- **Verify:** All 3 output files exist and are valid, no file corruption

---

## Implementation Notes

### New Test Files to Create

| File | Focus | Estimated Tests |
|------|-------|----------------|
| `__tests__/integration/workflows.e2e.test.ts` | Cross-operation workflows | 5 |
| `__tests__/integration/sdk-instances.e2e.test.ts` | SDK isolation, custom config, binary errors | 5 |
| `__tests__/integration/cancellation.e2e.test.ts` | AbortSignal, timeout, pre-aborted signal | 3 |
| `__tests__/integration/progress.e2e.test.ts` | onProgress callbacks, percent calculation | 2 |
| `__tests__/integration/edge-cases.e2e.test.ts` | Special paths, extreme inputs, boundary conditions | 7 |
| `__tests__/integration/error-handling.e2e.test.ts` | Invalid inputs, missing fields, tryExecute consistency | 7 |
| `__tests__/integration/batch-concurrency.e2e.test.ts` | Batch with concurrency, failure handling | 2 |
| `__tests__/integration/smart-transcode.e2e.test.ts` | Copy-vs-transcode decisions, constraints | 3 (extend existing) |
| `__tests__/integration/normalize-media.e2e.test.ts` | Skip matching, transcode non-matching | 2 (extend existing) |

### Shared Test Utilities Needed

No new helpers needed — the existing `describeWithFFmpeg`, `tmp()`, `expectFileExists()`, `probeOutput()`, `expectDurationClose()`, and `expectCodec()` cover all assertion needs.

One potential addition:
```typescript
/** Create a 0-byte temp file for boundary testing */
export function emptyFile(filename: string): string {
  const path = tmp(filename);
  writeFileSync(path, '');
  return path;
}
```

### Test Naming Convention

Follow existing pattern:
```typescript
describeWithFFmpeg("workflows", () => {
  it("extracts frame then overlays onto another video", async () => {
    // ...
  });
});
```

---

## Priority Order

Recommended implementation order (highest value first):

### Tier 1 — Implement First (highest coverage gap, most user-facing)
1. **Error handling tests** — validates the fail-fast contract users depend on
2. **Cancellation and timeout** — critical for production use, completely untested e2e
3. **Cross-operation workflows** — the primary way real users use the SDK

### Tier 2 — Implement Next
4. **SDK instance isolation** — important for multi-tenant/multi-config use
5. **Progress callbacks** — common user need, only unit-tested currently
6. **Smart transcode decision coverage** — fills gap in convenience function coverage

### Tier 3 — Implement Last
7. **Edge cases and boundary conditions** — important for robustness, lower frequency
8. **Batch concurrency** — less commonly used feature
9. **Normalize media, waveform, estimate** — fill remaining thin-coverage gaps

**Total new tests:** ~36 across 9 test files
**Estimated test runtime:** ~60-90 seconds (all require real ffmpeg execution)

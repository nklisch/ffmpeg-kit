# Pattern: Test Helpers (fixtures, tmp, describeWithFFmpeg)

All integration and builder tests use shared helpers from `__tests__/helpers.ts`: a `FIXTURES` object for media paths, `tmp()` for auto-cleaned output paths, `describeWithFFmpeg` for conditional suites, and assertion helpers (`expectFileExists`, `expectDurationClose`, `expectDimensions`, `expectCodec`).

## Rationale
Centralizes test infrastructure to avoid duplication. `tmp()` prevents test file leakage via `afterAll` cleanup. `describeWithFFmpeg` makes tests skip gracefully when ffmpeg is not installed.

## Examples

### Example 1: FIXTURES and describeWithFFmpeg
**File**: `__tests__/helpers.ts:13-40`
```typescript
export const FIXTURES = {
  videoH264: join(FIXTURES_DIR, "video-h264.mp4"),
  videoShort: join(FIXTURES_DIR, "video-short.mp4"),
  videoNoAudio: join(FIXTURES_DIR, "video-no-audio.mp4"),
  audioSpeech: join(FIXTURES_DIR, "audio-speech.wav"),
  audioMusic: join(FIXTURES_DIR, "audio-music.wav"),
  audioSilence: join(FIXTURES_DIR, "audio-silence.wav"),
  image1080p: join(FIXTURES_DIR, "image-1080p.jpg"),
  imageSmall: join(FIXTURES_DIR, "image-small.png"),
  subtitle: join(FIXTURES_DIR, "subtitle.srt"),
  chapters: join(FIXTURES_DIR, "chapters.mkv"),
};

export const describeWithFFmpeg: typeof describe = ffmpegAvailable ? describe : describe.skip;
```

### Example 2: tmp() with auto-cleanup
**File**: `__tests__/helpers.ts:42-65`
```typescript
const tmpPaths: string[] = [];

afterAll(() => {
  for (const p of tmpPaths) {
    try { unlinkSync(p); } catch { /* ignore */ }
  }
  tmpPaths.length = 0;
});

export function tmp(filename: string): string {
  const dir = join(tmpdir(), "ffmpeg-kit-test");
  const path = join(dir, filename);
  tmpPaths.push(path);
  return path;
}
```

### Example 3: Assertion helpers usage in integration test
**File**: `__tests__/integration/extract.e2e.test.ts:13-22`
```typescript
it("extracts frame at timestamp as PNG", async () => {
  const output = tmp("extract-frame.png");
  const result = await extract().input(FIXTURES.videoH264).timestamp(1).output(output).execute();

  expectFileExists(output);
  expect(result.outputPath).toBe(output);
  expect(result.width).toBe(1920);
  expect(result.height).toBe(1080);
  expect(result.sizeBytes).toBeGreaterThan(100);
});
```

### Example 4: probeOutput + expectCodec in integration test
**File**: `__tests__/integration/encode.e2e.test.ts:26-36`
```typescript
it("encodes video with premium CPU h264", async () => {
  const output = tmp("premium-h264.mp4");
  await execute(["-i", FIXTURES.videoShort, ...args, "-t", "1", output]);

  expectFileExists(output);
  const info = await probeOutput(output);
  expectCodec(info, "video", "h264");
});
```

## When to Use
- Always import `FIXTURES`, `tmp`, `describeWithFFmpeg` from `__tests__/helpers.ts` in integration tests
- Use `expectFileExists()`, `expectDurationClose()`, `expectDimensions()`, `expectCodec()` instead of inline assertions

## When NOT to Use
- Builder unit tests (no file I/O) don't need `tmp()` or `describeWithFFmpeg`
- Don't add fixture files without adding them to the `FIXTURES` map

## Common Violations
- Hardcoding fixture paths inline instead of using `FIXTURES.*`
- Using `fs.existsSync()` directly instead of `expectFileExists()`
- Forgetting `describeWithFFmpeg` wrapper, causing CI failures when ffmpeg is absent
- Not using `tmp()` for output paths, leaving test artifacts on disk

# FFmpeg SDK - Architecture

## Design Goals

1. **Agent-friendly** - Predictable patterns, clear error messages, discoverable API surface
2. **Reusable** - Zero project-specific assumptions, works as standalone package or workspace dependency
3. **Layered** - Low-level escape hatches beneath high-level conveniences
4. **Safe defaults** - Hard to misuse, easy to get good results without deep FFmpeg knowledge

---

## Module Structure

```
src/
├── index.ts                    # Public API barrel export (the `ffmpeg` namespace)
├── core/
│   ├── execute.ts              # Process spawning, progress parsing, timeout, cancellation
│   ├── probe.ts                # ffprobe wrapper with Zod-validated output
│   ├── validate.ts             # Binary discovery, version checking, capability detection
│   └── args.ts                 # Argument builder utilities (escaping, flag construction)
├── hardware/
│   ├── detect.ts               # GPU/hwaccel capability detection (cached singleton)
│   ├── session.ts              # NVENC/QSV session tracking (ref-counted, RAII)
│   └── fallback.ts             # Auto-fallback: hwaccel → CPU on failure with retry
├── encoding/
│   ├── codecs.ts               # Codec registry: what's available, what supports what
│   ├── config.ts               # EncoderConfig builder from quality tier + hw mode
│   └── presets.ts              # YouTube, social media, quality tier preset definitions
├── operations/
│   ├── extract.ts              # Frame/thumbnail extraction builder
│   ├── transform.ts            # Scale, crop, Ken Burns, speed, stabilize
│   ├── audio.ts                # Mix, duck, normalize, EQ, effects
│   ├── concat.ts               # Concatenation with transitions
│   ├── export.ts               # Final video export builder
│   ├── overlay.ts              # Compositing, PiP, watermark, chroma key
│   ├── text.ts                 # Drawtext rendering
│   ├── subtitle.ts             # Soft/hard subtitle handling
│   ├── image.ts                # Image processing, sequences, test patterns
│   ├── streaming.ts            # HLS, DASH, RTMP/SRT output
│   └── gif.ts                  # Animated GIF with palette optimization
├── convenience/
│   ├── pipeline.ts             # Multi-step pipeline chaining with auto temp files
│   ├── smart.ts                # Smart transcode, auto-codec, detect-and-skip
│   ├── batch.ts                # Batch processing with concurrency control
│   ├── thumbnail-sheet.ts      # Sprite sheet / contact sheet generation
│   ├── waveform.ts             # Audio waveform data extraction
│   ├── silence.ts              # Auto-trim silence, split on silence
│   ├── normalize-media.ts      # Normalize a set of files to consistent format
│   └── estimate.ts             # Output file size estimation
├── filters/
│   ├── graph.ts                # Filter graph builder (complex filter_complex)
│   ├── video.ts                # Video filter string builders
│   ├── audio.ts                # Audio filter string builders
│   └── helpers.ts              # Filter expression helpers (time, math, conditionals)
├── types/
│   ├── codecs.ts               # Codec, format, pixel format type definitions
│   ├── options.ts              # ExecuteOptions, ProgressInfo, etc.
│   ├── results.ts              # All operation result types
│   ├── probe.ts                # ProbeResult, StreamInfo, etc.
│   ├── filters.ts              # Filter-specific types (transitions, curves, etc.)
│   └── errors.ts               # FFmpegError class + error codes enum
├── schemas/
│   └── probe.ts                # Zod schemas for ffprobe JSON validation
└── util/
    ├── timecode.ts             # Timecode parsing/formatting
    ├── tempfile.ts             # Temp file creation with auto-cleanup
    ├── cache.ts                # TTL cache for probe results, hw detection
    ├── logger.ts               # Optional pino integration (disabled by default)
    └── platform.ts             # OS detection, path handling
```

---

## Layered Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Convenience Layer                   │
│  pipeline(), batch(), smartTranscode(), thumbnailSheet│
├─────────────────────────────────────────────────────┤
│                   Operation Builders                  │
│  extract(), transform(), audio(), concat(), export() │
│  overlay(), text(), subtitle(), image(), hls(), gif()│
├─────────────────────────────────────────────────────┤
│                   Filter Graph Builder                │
│  filterGraph(), filter(), chain()                     │
├─────────────────────────────────────────────────────┤
│              Encoding / Hardware / Presets             │
│  buildEncoderArgs(), detectHardware(), withHwSession()│
├─────────────────────────────────────────────────────┤
│                     Core Layer                        │
│  execute(), probe(), validateInstallation()           │
└─────────────────────────────────────────────────────┘
```

Each layer can be used independently. The convenience layer uses operation builders,
which use the filter/encoding layer, which uses the core layer. Users can drop down
to any level.

---

## Key Design Decisions

### 1. Builder Pattern for All Operations

Every operation uses a fluent builder that returns `this` for chaining. This gives:
- **Discoverability**: autocomplete shows all available options
- **Validation**: builders validate at `.execute()` time, not at each setter
- **Inspection**: `.toArgs()` returns the raw ffmpeg args without executing
- **Agent-friendly**: agents can build commands incrementally and inspect before running

```typescript
// Every builder follows this contract
interface OperationBuilder<TResult> {
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<TResult>;
}
```

### 2. Smart Defaults Over Configuration

The SDK should produce good results with minimal configuration:

- **Auto-codec from extension**: `.output('video.mp4')` → libx264 + aac
- **Auto-pixel format**: Always yuv420p for H.264/HEVC unless explicitly overridden
- **Auto-faststart**: Enabled for mp4/mov containers
- **Auto-hw fallback**: If NVENC fails, transparently retry with CPU encoder
- **Auto-audio fill**: Concat fills missing audio tracks with silence
- **Auto-aspect**: `-2` for auto-calculated dimension in scale operations

### 3. Result Types, Not Exceptions for Expected Failures

Following the termtube convention:

```typescript
// Operations return typed results
type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: FFmpegError };

// FFmpegError is thrown only for programmer errors (missing required fields)
// Expected failures (file not found, codec unavailable) return error results
```

The builder's `.execute()` returns `Promise<T>` and throws `FFmpegError` on failure.
For callers who prefer Result types, a `.tryExecute()` method returns
`Promise<OperationResult<T>>` instead.

### 4. Probe Caching

Probing the same file multiple times is wasteful. The SDK caches probe results
in an LRU cache keyed by `(absolutePath, mtime)`:

```typescript
// Automatic caching (default: 100 entries, 5 min TTL)
const info1 = await ffmpeg.probe('video.mp4');  // runs ffprobe
const info2 = await ffmpeg.probe('video.mp4');  // returns cached

// Force fresh probe
const info3 = await ffmpeg.probe('video.mp4', { noCache: true });

// Clear cache
ffmpeg.clearProbeCache();
```

### 5. Temp File Management

Multi-step operations need intermediate files. The SDK manages these automatically:

```typescript
// Pipeline handles temp files
const result = await ffmpeg.pipeline()
  .step(ffmpeg.transform().scale({ width: 1920 }))
  .step(ffmpeg.audio().normalize({ targetLufs: -14 }))
  .step(ffmpeg.exportVideo().preset('youtube_hd'))
  .output('/final.mp4')
  .execute();
// All intermediate files cleaned up automatically

// Or manual temp file management
const tmp = ffmpeg.tempFile({ suffix: '.mp4' });
try {
  await ffmpeg.transform().input('...').output(tmp.path).execute();
  // use tmp.path
} finally {
  tmp.cleanup();
}
```

### 6. Hardware Acceleration Strategy

Three-tier approach:

1. **`'auto'`** (default): Detect best available, fallback on failure
2. **Explicit mode** (`'nvidia'`, `'vaapi'`, `'qsv'`): Use specified, error if unavailable
3. **`'cpu'`**: Force software encoding

Auto mode behavior:
- First call detects capabilities (cached for process lifetime)
- Attempts hwaccel encode
- On failure, transparently retries with CPU
- Logs the fallback (does not silently degrade without notification)

### 7. Zero Required Dependencies

The SDK has no required runtime dependencies beyond Node.js built-ins.
FFmpeg/ffprobe must be installed on the system (not bundled).

Optional peer dependencies:
- `pino` - structured logging (if you want SDK log output)
- `zod` - already used internally, exposed for schema consumers

### 8. No Global State

All configuration is scoped:

```typescript
import { createFFmpeg } from '@ffmpeg-sdk/core';

// Each instance has its own config, cache, and session tracking
const ffmpeg = createFFmpeg({
  ffmpegPath: '/usr/bin/ffmpeg',     // default: auto-detect from PATH
  ffprobePath: '/usr/bin/ffprobe',
  tempDir: '/tmp/ffmpeg-sdk',
  defaultTimeout: 600_000,
  defaultHwAccel: 'auto',
  logLevel: 'error',
  probeCacheSize: 100,
  probeCacheTtl: 300_000,
});

// Convenience: default instance with auto-detected paths
import { ffmpeg } from '@ffmpeg-sdk/core';
```

---

## Convenience Features

### Pipeline Chaining

Chain operations without managing intermediate files:

```typescript
await ffmpeg.pipeline()
  .step(ffmpeg.transform()
    .scale({ width: 1920 })
    .crop({ aspectRatio: '16:9' }))
  .step(ffmpeg.audio()
    .normalize({ targetLufs: -14 })
    .fadeOut({ duration: 2 }))
  .step(ffmpeg.exportVideo()
    .preset('youtube_hd'))
  .input('/raw-footage.mov')
  .output('/final.mp4')
  .execute({ onProgress: console.log });
```

The pipeline:
- Creates temp files between steps automatically
- Passes output of step N as input to step N+1
- Cleans up all intermediates on success or failure
- Aggregates progress across all steps
- Supports `onStepComplete` callback

### Smart Transcode

Detect if transcoding is actually needed:

```typescript
// Only re-encodes if source doesn't match target specs
const result = await ffmpeg.smartTranscode({
  input: 'video.mp4',
  output: 'video-yt.mp4',
  target: {
    videoCodec: 'h264',
    maxWidth: 1920,
    maxHeight: 1080,
    pixelFormat: 'yuv420p',
    audioCodec: 'aac',
    audioSampleRate: 48000,
    maxBitrate: '10M',
  },
});
// result.actions: ['copy_video', 'transcode_audio'] or ['copy_all'] etc.
```

### Batch Processing

Process multiple files with concurrency control:

```typescript
const results = await ffmpeg.batch({
  inputs: globSync('raw/*.mov'),
  concurrency: 3,   // max parallel ffmpeg processes
  operation: (input) =>
    ffmpeg.exportVideo()
      .input(input)
      .preset('youtube_hd')
      .output(input.replace('raw/', 'output/').replace('.mov', '.mp4')),
  onItemComplete: (input, result) => console.log(`Done: ${input}`),
  onItemError: (input, error) => console.error(`Failed: ${input}`, error),
});
// results: Array<{ input: string; result: ExportResult } | { input: string; error: FFmpegError }>
```

### Thumbnail Sheet

Generate contact sheets / sprite sheets:

```typescript
const sheet = await ffmpeg.thumbnailSheet({
  input: 'video.mp4',
  columns: 5,
  rows: 4,
  width: 320,               // per-thumbnail width
  timestamps: 'uniform',    // 'uniform' | 'scene' | number[]
  output: 'sheet.jpg',
});
// sheet: { path, width, height, timestamps: number[] }
```

### Waveform Extraction

For audio visualization (DAW-style waveforms, lip-sync):

```typescript
const waveform = await ffmpeg.waveform({
  input: 'audio.wav',
  samplesPerSecond: 30,     // match video fps for lip-sync
  channels: 'mono',         // 'mono' | 'stereo' | 'all'
  format: 'peaks',          // 'peaks' | 'rms' | 'raw'
});
// waveform: { sampleRate: 30, data: Float32Array, duration: number }
```

### Silence Utilities

```typescript
// Detect silence ranges
const silences = await ffmpeg.detectSilence('audio.wav', {
  threshold: -40,           // dB
  minDuration: 0.5,         // seconds
});
// silences: Array<{ start: number, end: number, duration: number }>

// Auto-trim silence from start and end
await ffmpeg.trimSilence({
  input: 'audio.wav',
  output: 'trimmed.wav',
  threshold: -40,
  padding: 0.1,             // keep 100ms of silence at edges
});

// Split audio on silence (for sentence-level segmentation)
const segments = await ffmpeg.splitOnSilence({
  input: 'narration.wav',
  outputDir: './segments/',
  threshold: -40,
  minSilence: 0.5,
  minSegment: 1.0,
});
// segments: Array<{ path: string, start: number, end: number, duration: number }>
```

### File Size Estimation

Estimate output file size before encoding:

```typescript
const estimate = await ffmpeg.estimateSize({
  input: 'video.mp4',
  preset: 'youtube_hd',
  // OR
  videoBitrate: '5M',
  audioBitrate: '192k',
  duration: 120,            // override duration
});
// estimate: { bytes: number, formatted: '145.2 MB', confidence: 'high' | 'medium' | 'low' }
```

### Media Normalization

Normalize a set of files to consistent format (for concat, comparison):

```typescript
const normalized = await ffmpeg.normalizeMedia({
  inputs: ['clip1.mov', 'clip2.avi', 'clip3.webm'],
  outputDir: './normalized/',
  target: {
    width: 1920,
    height: 1080,
    fps: 30,
    pixelFormat: 'yuv420p',
    audioSampleRate: 48000,
    audioChannels: 2,
  },
  skipIfMatching: true,     // don't re-encode if already matching
});
```

### Quick Conversions

One-liner convenience functions for common operations:

```typescript
// Container remux (no re-encoding)
await ffmpeg.remux('input.mkv', 'output.mp4');

// Quick compress
await ffmpeg.compress('input.mp4', 'output.mp4', { quality: 'standard' });

// Extract audio
await ffmpeg.extractAudio('video.mp4', 'audio.mp3', { bitrate: '192k' });

// Create video from image
await ffmpeg.imageToVideo('photo.jpg', 'video.mp4', { duration: 5, fps: 30 });

// Resize video
await ffmpeg.resize('input.mp4', 'output.mp4', { width: 1280 });
```

---

## Error Strategy

### Error Classification

Errors are classified by recoverability:

| Category | Behavior | Example |
|----------|----------|---------|
| **Programmer error** | Throw immediately | Missing required `.input()` call |
| **Validation error** | Throw at `.execute()` | Input file doesn't exist |
| **Runtime error** | Return in result | Encoding failed, timeout |
| **Retryable error** | Auto-retry with fallback | HW accel failed → CPU fallback |

### Error Context

Every `FFmpegError` includes:
- `code`: Enum for programmatic handling
- `message`: Human-readable description
- `command`: The exact args that were passed to ffmpeg
- `stderr`: Full ffmpeg stderr output (for debugging)
- `exitCode`: Process exit code
- `cause`: Original error if wrapping

---

## Testing Strategy

```
__tests__/
├── unit/
│   ├── args.test.ts          # Arg building produces correct flags
│   ├── timecode.test.ts      # Timecode parsing edge cases
│   ├── filters.test.ts       # Filter string generation
│   └── presets.test.ts       # Preset configs are valid
├── builder/
│   ├── extract.test.ts       # Builder produces correct args (no ffmpeg needed)
│   ├── transform.test.ts
│   ├── audio.test.ts
│   ├── concat.test.ts
│   └── export.test.ts
└── integration/
    ├── probe.test.ts         # Requires ffmpeg binary + test media files
    ├── extract.test.ts
    ├── transform.test.ts
    ├── audio.test.ts
    ├── concat.test.ts
    ├── export.test.ts
    └── hardware.test.ts
```

**Key testing principle**: Builder tests use `.toArgs()` and assert on the
generated argument arrays. They never spawn ffmpeg. Integration tests run
against real ffmpeg with small test media files.

---

## Package Distribution

```jsonc
// package.json
{
  "name": "@ffmpeg-sdk/core",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "engines": { "node": ">=22.0.0" }
}
```

- ESM only (no CJS)
- Built with `tsup` (format: `['esm']`, dts: true, sourcemap: true)
- Published as `@ffmpeg-sdk/core` or consumed as workspace dependency via `workspace:*`
- Tree-shakeable: named exports, no side effects

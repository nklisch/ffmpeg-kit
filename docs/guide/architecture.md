---
outline: deep
---

# Architecture

## Module structure

```
src/
├── index.ts                    # Public API barrel export
├── core/
│   ├── execute.ts              # Process spawning, progress, timeout, cancellation
│   ├── probe.ts                # ffprobe wrapper with Zod-validated output
│   ├── validate.ts             # Binary discovery, version checking
│   └── args.ts                 # Argument builder utilities
├── hardware/
│   ├── detect.ts               # GPU/hwaccel capability detection (cached)
│   ├── session.ts              # NVENC/QSV session tracking (ref-counted)
│   └── fallback.ts             # Auto-fallback: hwaccel → CPU on failure
├── encoding/
│   ├── codecs.ts               # Codec registry
│   ├── config.ts               # EncoderConfig builder
│   └── presets.ts              # YouTube, social media, quality presets
├── operations/
│   ├── extract.ts              # Frame/thumbnail extraction
│   ├── transform.ts            # Scale, crop, speed, rotate
│   ├── audio.ts                # Mix, normalize, EQ, effects
│   ├── concat.ts               # Concatenation with transitions
│   ├── export.ts               # Final video export
│   ├── overlay.ts              # Compositing, PiP, watermark
│   ├── text.ts                 # Drawtext rendering
│   ├── subtitle.ts             # Soft/hard subtitles
│   ├── image.ts                # Image processing, slideshows
│   ├── streaming.ts            # HLS, DASH, RTMP/SRT
│   └── gif.ts                  # Animated GIF with palette optimization
├── convenience/
│   ├── pipeline.ts             # Multi-step pipeline with auto temp files
│   ├── smart.ts                # Smart transcode, detect-and-skip
│   ├── batch.ts                # Batch processing with concurrency
│   ├── thumbnail-sheet.ts      # Sprite sheet generation
│   ├── waveform.ts             # Audio waveform data extraction
│   └── silence.ts              # Auto-trim silence, split on silence
├── filters/
│   ├── graph.ts                # Filter graph builder (filter_complex)
│   ├── video.ts                # Video filter string builders
│   ├── audio.ts                # Audio filter string builders
│   └── helpers.ts              # Filter expression helpers
├── types/                      # All type definitions
├── schemas/                    # Zod schemas for ffprobe validation
└── util/                       # Timecode, temp files, caching, platform
```

## Layered architecture

Each layer can be used independently. Higher layers build on lower ones, but you can
always drop down to use a lower layer directly.

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

## Design goals

1. **Agent-friendly** — Predictable patterns, clear error messages, discoverable API
2. **Reusable** — Zero project-specific assumptions, works as standalone package
3. **Layered** — Low-level escape hatches beneath high-level conveniences
4. **Safe defaults** — Hard to misuse, easy to get good results

## Key patterns

### Fluent builder

All operations use the same pattern: a factory function creates a builder, methods
configure it (returning `this`), and a terminal method executes:

```typescript
// factory → configure → execute
const result = await ffmpeg.extract()   // factory
  .input("video.mp4")                  // configure
  .timestamp(5)                        // configure
  .size({ width: 640 })                // configure
  .output("thumb.jpg")                 // configure
  .execute();                          // terminal
```

### Tri-modal execution

Every builder exposes three terminal methods:

- `.toArgs()` — returns `string[]`, no FFmpeg binary needed
- `.execute()` — runs FFmpeg, returns typed result, throws `FFmpegError` on failure
- `.tryExecute()` — runs FFmpeg, returns `OperationResult<T>` (never throws)

### Probe enrichment

After FFmpeg completes, operations probe their output file to return rich metadata
(dimensions, codec, duration, size) without requiring a separate probe call.

### Caching

- **Probe cache**: LRU keyed by `(path, mtime)` — invalidated automatically when files change
- **Hardware detection cache**: process-lifetime singleton — GPU capabilities don't change at runtime

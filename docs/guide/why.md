---
outline: deep
---

# Why ffmpeg-kit?

## The problem with raw FFmpeg

FFmpeg is extraordinarily capable, but its CLI interface is notoriously complex.
Building a TypeScript app on top of raw `child_process` means:

- Constructing argument arrays by hand (error-prone, no autocomplete)
- Parsing stderr for progress and errors
- Managing temp files manually
- No type safety on results
- Repeating boilerplate for every operation

```typescript
// Raw child_process — what you're avoiding
import { spawn } from "node:child_process";

const proc = spawn("ffmpeg", [
  "-i", "input.mp4",
  "-ss", "5",
  "-vframes", "1",
  "-vf", "scale=640:-2",
  "thumb.jpg",
]);
// No types, no autocomplete, manual error handling...
```

## Comparison with fluent-ffmpeg

[fluent-ffmpeg](https://github.com/fluent-ffmpeg/node-fluent-ffmpeg) is a popular
alternative, but it has significant limitations:

| Feature | fluent-ffmpeg | ffmpeg-kit |
|---------|--------------|------------|
| TypeScript | Partial (DefinitelyTyped) | Native, strict |
| ESM | No (CommonJS only) | Yes (ESM only) |
| Maintenance | Unmaintained (last release 2022) | Active |
| Hardware accel | Manual | Auto-detect + fallback |
| Result types | No | `.tryExecute()` |
| Probe caching | No | LRU by (path, mtime) |
| Batch processing | No | Built-in concurrency control |
| Filter graph | Limited | Full builder API |

## Design philosophy

ffmpeg-kit is designed around four principles:

### 1. Agent-friendly

Predictable patterns, clear error messages, discoverable API surface. Every operation
follows the same fluent builder → tri-modal execution pattern. If you know how to use
`extract()`, you already know how to use `transform()`.

### 2. Layered architecture

Low-level escape hatches beneath high-level conveniences. You can use the convenience
layer (`pipeline()`, `batch()`), or drop down to operation builders, or go further to
the filter graph builder, or use raw `execute()` directly.

```
Convenience Layer  →  pipeline(), batch(), smartTranscode()
Operation Builders →  extract(), transform(), audio(), concat()
Filter Graph       →  filter(), chain(), filterGraph()
Encoding/Hardware  →  buildEncoderArgs(), detectHardware()
Core Layer         →  execute(), probe(), validateInstallation()
```

### 3. Type-safe results

Every operation returns a typed result with the fields you actually need:

```typescript
// ExtractResult — not just { success: boolean }
interface ExtractResult {
  outputPath: string;
  width: number;
  height: number;
  size: number;
  probeResult: ProbeResult;
}
```

### 4. Safe defaults

Hard to misuse. Quality settings default to sensible values. Hardware acceleration
falls back to CPU automatically. Probe results are cached without you asking.

## When to use ffmpeg-kit

**Good fit:**
- TypeScript/Node.js backends doing video processing
- Applications needing reliable error handling and typed results
- Projects requiring batch processing or pipeline orchestration
- Any use case that would otherwise call FFmpeg via `child_process`

**Not the right tool:**
- Browser-side video processing (use WebCodecs or ffmpeg.wasm)
- Very low-level FFmpeg filter graph work (drop to raw `execute()` instead)
- Non-Node.js runtimes (Deno, Bun untested)

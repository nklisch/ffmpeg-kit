---
outline: deep
---

# Batch Processing

The `batch()` function processes multiple items concurrently with built-in
concurrency control and per-item callbacks.

## Basic usage

```typescript
import { ffmpeg } from "ffmpeg-kit";

const result = await ffmpeg.batch({
  items: ["a.mp4", "b.mp4", "c.mp4"],
  concurrency: 2,
  process: async (item) => {
    await ffmpeg.transform()
      .input(item)
      .scale({ width: 720 })
      .output(item.replace(".mp4", "-720p.mp4"))
      .execute();
  },
});

console.log(result.succeeded); // number of items that succeeded
console.log(result.failed);    // number of items that failed
console.log(result.errors);    // Map<item, FFmpegError>
```

## Concurrency control

```typescript
const result = await ffmpeg.batch({
  items: files,
  concurrency: 4,      // max 4 parallel FFmpeg processes
  process: async (file) => { /* ... */ },
});
```

::: tip Choosing concurrency
- **CPU encoding**: use `Math.floor(cpus / 2)` to avoid thrashing
- **GPU encoding (NVENC)**: limited by session count (typically 3-5), use `concurrency: 3`
- **I/O bound** (remux, copy): can use higher concurrency (8-16)
:::

## Per-item callbacks

```typescript
const result = await ffmpeg.batch({
  items: files,
  concurrency: 2,
  onItemStart: (item, index) => {
    console.log(`Starting ${item} (${index + 1}/${files.length})`);
  },
  onItemComplete: (item, index) => {
    console.log(`Done: ${item}`);
  },
  onItemError: (item, error) => {
    console.error(`Failed: ${item}`, error.code);
  },
  process: async (item) => {
    await ffmpeg.transform().input(item).scale({ width: 720 }).output(`out/${item}`).execute();
  },
});
```

## `BatchResult`

```typescript
interface BatchResult<T> {
  succeeded: number;
  failed: number;
  total: number;
  results: Map<T, unknown>;      // item → process() return value (for successful items)
  errors: Map<T, FFmpegError>;   // item → error (for failed items)
}
```

## Continue on error

By default, batch processing continues even when individual items fail. All items
are processed; failures are collected in `result.errors`.

```typescript
// After processing all files, check for failures
if (result.failed > 0) {
  for (const [file, error] of result.errors) {
    console.error(`${file}: ${error.code}`);
  }
}
```

## Related

- [Pipeline](/guide/pipeline) — chain operations on a single file
- [Smart Transcode](/operations/smart-transcode) — probe-first batch transcoding

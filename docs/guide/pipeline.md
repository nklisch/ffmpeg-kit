---
outline: deep
---

# Pipeline

The pipeline builder chains multiple operations with automatic temp file management.
Each step receives its dependencies and produces output that the next step can use.

## Basic usage

```typescript
import { ffmpeg, transform, exportVideo } from "ffmpeg-kit";

const result = await ffmpeg.pipeline()
  .step("scale", (deps) =>
    transform(deps).input("input.mp4").scale({ width: 1280 }).output("$tmp"))
  .step("export", (deps) =>
    exportVideo(deps).input("$prev").preset("youtube_1080p").output("output.mp4"))
  .execute();
```

## `$tmp` and `$prev` placeholders

- **`$tmp`** — allocates a temporary file. Auto-cleaned after the pipeline completes.
- **`$prev`** — refers to the output of the previous step.

```typescript
await ffmpeg.pipeline()
  .step("normalize", (deps) =>
    transform(deps).input("video.mp4").scale({ width: 1920 }).output("$tmp"))
  .step("audio", (deps) =>
    audio(deps).input("$prev").normalize({ targetLUFS: -16 }).output("$tmp"))
  .step("export", (deps) =>
    exportVideo(deps).input("$prev").preset("youtube_1080p").output("final.mp4"))
  .execute();
```

## Auto temp file cleanup

Temp files created by `$tmp` are automatically deleted after `.execute()` completes,
whether it succeeds or throws. No manual cleanup needed.

## Accessing step results

```typescript
const pipeline = await ffmpeg.pipeline()
  .step("extract", (deps) =>
    transform(deps).input("video.mp4").trimStart(10).duration(30).output("$tmp"))
  .step("export", (deps) =>
    exportVideo(deps).input("$prev").output("clip.mp4"))
  .execute();

// pipeline.results is a map of step name → result
console.log(pipeline.results.export.outputPath); // "clip.mp4"
```

## Error handling

If any step fails, the pipeline throws `FFmpegError` (or returns `{ success: false }`
with `.tryExecute()`). Temp files are still cleaned up.

```typescript
const result = await ffmpeg.pipeline()
  .step("scale", (deps) =>
    transform(deps).input("video.mp4").scale({ width: 1280 }).output("$tmp"))
  .step("export", (deps) =>
    exportVideo(deps).input("$prev").output("out.mp4"))
  .tryExecute();

if (!result.success) {
  console.error("Pipeline failed at step:", result.error.message);
}
```

## Related

- [Batch Processing](/guide/batch) — run operations over many files concurrently
- [Transform](/operations/transform) — scale, crop, trim
- [Export](/operations/export) — final encoding with presets

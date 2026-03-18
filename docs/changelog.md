---
outline: deep
---

# Changelog

## v0.1.9

- **Fix:** `probeOutput()` now throws `FFmpegError` with `OUTPUT_ERROR` code when FFmpeg exits successfully but produces no output file (previously leaked a raw Node.js `ENOENT`). Affects all 12 operation builders.
- **Refactor:** Converted `Cache` class to `createCache()` factory function, consistent with the rest of the codebase. `Cache<K,V>` type alias preserved for backward compatibility.
- **Refactor:** Removed redundant `as` casts in `smart.ts` and `probe.ts`; tightened `SmartTranscodeTarget` codec fields to `VideoCodec`/`AudioCodec` types.
- **Internal:** Added 24 new integration tests covering cross-operation workflows, error handling, SDK configuration, edge cases (unicode/spaces in paths, concurrent ops, pre-aborted signals), and progress callbacks.

## v0.1.0

Initial public release.

- 11 operation builders: extract, transform, audio, concat, export, overlay, text, subtitle, image, streaming, gif
- Tri-modal execution: `.toArgs()`, `.execute()`, `.tryExecute()`
- Hardware acceleration: NVENC, VAAPI, QSV with auto-fallback
- Probe caching: LRU keyed by (path, mtime)
- Convenience layer: pipeline, batch, smart transcode, thumbnail sheets, waveform, silence detection
- Delivery presets: YouTube, social media, web, archive
- Filter graph builder
- Strict TypeScript with Zod-validated probe output

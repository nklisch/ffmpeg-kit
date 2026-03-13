---
outline: deep
---

# Changelog

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

---
outline: deep
---

# Subtitle

Embed or burn subtitles into video. Supports both soft subtitles (selectable in
the media player) and hard-burned subtitles (baked into the video stream).

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

// Soft subtitles (selectable in player)
await ffmpeg.subtitle()
  .input("video.mp4")
  .softSub({ path: "subs.srt", language: "en" })
  .output("with-subs.mkv")
  .execute();
```

## API

### `.input(path)`

Input video file. Required.

### `.softSub(options)`

Embed subtitle track as a selectable stream (MKV or MP4 container).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string` | — | Path to subtitle file (.srt, .ass, .vtt) |
| `language` | `string` | `"und"` | ISO 639-1 language code (`"en"`, `"fr"`, etc.) |
| `title` | `string` | — | Track title shown in player |
| `default` | `boolean` | `false` | Set as default subtitle track |
| `forced` | `boolean` | `false` | Mark as forced (always shown) |

::: warning Container support
Soft subtitles require MKV (`.mkv`) or MP4 (`.mp4`) output. MP4 supports only
`mov_text` subtitle codec. Use MKV for ASS/SSA format preservation.
:::

### `.hardBurn(options)`

Burn subtitles permanently into the video stream.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | `string` | — | Path to subtitle file |
| `fontDir` | `string` | — | Directory to search for fonts (for ASS) |
| `charEncoding` | `string` | `"UTF-8"` | Character encoding of the subtitle file |

### `.output(path)`

Output file path. Required.

## Examples

### Embed SRT as soft subtitles

```typescript
await ffmpeg.subtitle()
  .input("video.mp4")
  .softSub({
    path: "english.srt",
    language: "en",
    title: "English",
    default: true,
  })
  .output("with-subs.mkv")
  .execute();
```

### Hard-burned ASS subtitles

```typescript
await ffmpeg.subtitle()
  .input("video.mp4")
  .hardBurn({
    path: "styled.ass",
    fontDir: "./fonts",
  })
  .output("burned.mp4")
  .execute();
```

### Multiple subtitle tracks

```typescript
await ffmpeg.subtitle()
  .input("video.mp4")
  .softSub({ path: "en.srt", language: "en", default: true })
  .softSub({ path: "fr.srt", language: "fr" })
  .softSub({ path: "de.srt", language: "de" })
  .output("multilang.mkv")
  .execute();
```

## Result type

```typescript
interface SubtitleResult {
  outputPath: string;
  duration: number;
  size: number;
  subtitleTracks: number;
  probeResult: ProbeResult;
}
```

## Related

- [Text](/operations/text) — burn dynamic text overlays using drawtext
- [Export](/operations/export) — re-encode video while adding subtitles

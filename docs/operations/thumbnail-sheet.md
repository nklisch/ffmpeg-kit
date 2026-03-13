---
outline: deep
---

# Thumbnail Sheet

Generate a grid of preview thumbnails from a video — useful for video players,
content management systems, and video search interfaces.

## Quick example

```typescript
import { ffmpeg } from "ffmpeg-kit";

const result = await ffmpeg.thumbnailSheet({
  input: "video.mp4",
  output: "sheet.jpg",
  columns: 4,
  rows: 3,
  width: 320,
});

console.log(result.count);  // 12 (columns × rows)
console.log(result.outputPath); // "sheet.jpg"
```

## Function signature

```typescript
function thumbnailSheet(options: ThumbnailSheetOptions): Promise<ThumbnailSheetResult>;
```

## Options

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `input` | `string` | — | Input video file path |
| `output` | `string` | — | Output image file path |
| `columns` | `number` | `4` | Number of columns in the grid |
| `rows` | `number` | `3` | Number of rows in the grid |
| `width` | `number` | `320` | Width of each thumbnail in pixels |
| `padding` | `number` | `2` | Padding between thumbnails in pixels |
| `background` | `string` | `"black"` | Background color |
| `quality` | `number` | `85` | JPEG quality 1–100 |
| `skipStart` | `number` | `0` | Skip this many seconds from the start |
| `skipEnd` | `number` | `0` | Skip this many seconds from the end |

## How it works

1. Divides the video duration into `columns × rows` equal intervals
2. Extracts one frame from each interval
3. Arranges frames into a grid image using `tile` filter

```typescript
// 4×4 = 16 thumbnails across the full video
const result = await ffmpeg.thumbnailSheet({
  input: "movie.mp4",
  output: "preview.jpg",
  columns: 4,
  rows: 4,
  width: 240,
  skipStart: 60,   // skip opening credits
  skipEnd: 120,    // skip end credits
});
```

## Result type

```typescript
interface ThumbnailSheetResult {
  outputPath: string;
  count: number;      // total number of thumbnails in the grid
  columns: number;
  rows: number;
  sheetWidth: number;   // total image width in pixels
  sheetHeight: number;  // total image height in pixels
  size: number;         // file size in bytes
}
```

## Related

- [Extract](/operations/extract) — extract a single frame
- [Batch Processing](/guide/batch) — generate sheets for many videos concurrently

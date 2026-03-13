---
outline: deep
---

# Probe API

Media metadata extraction via ffprobe. All results are Zod-validated and cached
by `(path, mtime)` automatically.

## `probe()`

```typescript
function probe(inputPath: string, options?: ProbeOptions): Promise<ProbeResult>;
```

Full media metadata probe.

### `ProbeOptions`

```typescript
interface ProbeOptions {
  /** Bypass the LRU cache and force a fresh probe */
  noCache?: boolean;
}
```

### Example

```typescript
import { ffmpeg } from "ffmpeg-kit";

const info = await ffmpeg.probe("video.mp4");

console.log(info.format.duration);  // seconds
console.log(info.format.bitrate);   // bits/sec
console.log(info.streams.length);   // number of streams

const video = info.streams.find(s => s.type === "video");
console.log(video?.width, video?.height);
console.log(video?.codec);
```

## `getDuration()`

```typescript
function getDuration(inputPath: string): Promise<number>;
```

Quick duration query. Returns duration in seconds.

## `getVideoStream()` / `getAudioStream()`

```typescript
function getVideoStream(inputPath: string): Promise<VideoStreamInfo | null>;
function getAudioStream(inputPath: string): Promise<AudioStreamInfo | null>;
```

Convenience helpers that return the first video or audio stream, or `null` if none.

## `ProbeResult`

```typescript
interface ProbeResult {
  format: FormatInfo;
  streams: StreamInfo[];
  chapters: ChapterInfo[];
}
```

## `FormatInfo`

```typescript
interface FormatInfo {
  filename: string;
  formatName: string;
  formatLongName: string;
  duration: number;          // seconds
  size: number;              // bytes
  bitrate: number;           // bits/sec
  startTime: number;
  nbStreams: number;
  tags: Record<string, string>;
}
```

## `VideoStreamInfo`

```typescript
interface VideoStreamInfo {
  type: "video";
  index: number;
  codec: string;
  codecLongName: string;
  profile: string;
  width: number;
  height: number;
  displayAspectRatio: string;     // "16:9"
  sampleAspectRatio: string;      // "1:1"
  pixelFormat: string;            // "yuv420p"
  colorSpace?: string;            // "bt709"
  colorRange?: string;            // "tv" | "pc"
  colorTransfer?: string;         // "bt709" | "smpte2084" (HDR)
  colorPrimaries?: string;        // "bt709" | "bt2020"
  frameRate: number;              // fps as float
  avgFrameRate: number;
  bitrate: number;
  duration: number;
  nbFrames?: number;
  fieldOrder?: string;            // "progressive" | "tt" | "bb" | "tb" | "bt"
  bitsPerRawSample?: number;
  disposition: StreamDisposition;
  tags: Record<string, string>;
  rotation?: number;              // rotation metadata in degrees
}
```

## `AudioStreamInfo`

```typescript
interface AudioStreamInfo {
  type: "audio";
  index: number;
  codec: string;
  codecLongName: string;
  profile: string;
  sampleRate: number;
  channels: number;
  channelLayout: string;          // "stereo", "5.1", "mono"
  sampleFormat: string;           // "fltp", "s16"
  bitrate: number;
  duration: number;
  bitsPerRawSample?: number;
  disposition: StreamDisposition;
  tags: Record<string, string>;
}
```

## `SubtitleStreamInfo`

```typescript
interface SubtitleStreamInfo {
  type: "subtitle";
  index: number;
  codec: string;
  codecLongName: string;
  disposition: StreamDisposition;
  tags: Record<string, string>;
}
```

## `StreamInfo`

```typescript
type StreamInfo = VideoStreamInfo | AudioStreamInfo | SubtitleStreamInfo;
```

Use a type guard to narrow:

```typescript
const streams = info.streams;
const videoStreams = streams.filter((s): s is VideoStreamInfo => s.type === "video");
const audioStreams = streams.filter((s): s is AudioStreamInfo => s.type === "audio");
```

## `StreamDisposition`

```typescript
interface StreamDisposition {
  default: boolean;
  dub: boolean;
  original: boolean;
  comment: boolean;
  lyrics: boolean;
  karaoke: boolean;
  forced: boolean;
  hearingImpaired: boolean;
  visualImpaired: boolean;
  attachedPic: boolean;
}
```

## `ChapterInfo`

```typescript
interface ChapterInfo {
  id: number;
  startTime: number;
  endTime: number;
  tags: Record<string, string>;
}
```

## Probe caching

Results are cached in an LRU cache keyed by `(path, mtime)`. When a file changes
(mtime updates), the cache entry is automatically invalidated.

```typescript
// First call: runs ffprobe
const info1 = await ffmpeg.probe("video.mp4");

// Second call: returns from cache (no ffprobe spawn)
const info2 = await ffmpeg.probe("video.mp4");

// Bypass cache
const fresh = await ffmpeg.probe("video.mp4", { noCache: true });
```

## Related

- [Core API](/api/core) — raw `execute()` function
- [Smart Transcode](/operations/smart-transcode) — probe-first transcoding

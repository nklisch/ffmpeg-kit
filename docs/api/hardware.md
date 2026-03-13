---
outline: deep
---

# Hardware API

GPU detection, session management, and hardware-accelerated encoding/decoding.

## `detectHardware()`

```typescript
function detectHardware(): Promise<HardwareCapabilities>;
```

Detect available hardware acceleration methods. Result is cached after the first call
(hardware capabilities don't change at runtime).

### Example

```typescript
import { ffmpeg } from "ffmpeg-kit";

const hw = await ffmpeg.detectHardware();

console.log(hw.available);           // ["nvidia", "cpu"]
console.log(hw.gpu?.vendor);         // "nvidia"
console.log(hw.gpu?.model);          // "RTX 4090"
console.log(hw.encoders.h264);       // ["h264_nvenc", "h264_vaapi"]
```

## `HardwareCapabilities`

```typescript
interface HardwareCapabilities {
  /** Available hardware acceleration methods */
  available: HwAccelMode[];
  /** Detected GPU info */
  gpu?: {
    vendor: "nvidia" | "amd" | "intel" | "unknown";
    model: string;
    /** Max concurrent encoding sessions */
    maxSessions: number;
  };
  /** Available hardware encoders */
  encoders: {
    h264: string[];    // e.g. ["h264_nvenc", "h264_vaapi", "h264_qsv"]
    hevc: string[];    // e.g. ["hevc_nvenc", "hevc_vaapi"]
    av1: string[];     // e.g. ["av1_nvenc", "av1_vaapi"]
    vp9: string[];     // e.g. ["vp9_vaapi", "vp9_qsv"]
    vvc: string[];
  };
  /** Available hardware decoders */
  decoders: {
    h264: string[];
    hevc: string[];
    av1: string[];
    vp9: string[];
  };
}
```

## `HwAccelMode`

```typescript
type HwAccelMode = "auto" | "nvidia" | "vaapi" | "qsv" | "vulkan" | "cpu";
```

## `acquireSession()` / `withHwSession()`

Low-level session management for hardware encoders that have concurrent session limits
(notably NVIDIA consumer GPUs).

```typescript
function acquireSession(mode: HwAccelMode): Promise<HwSession>;

function withHwSession<T>(
  mode: HwAccelMode,
  operation: (session: HwSession) => Promise<T>
): Promise<T>;
```

`withHwSession()` is the preferred API — it automatically releases the session when
the operation completes, even on error.

```typescript
import { withHwSession } from "ffmpeg-kit";

// Session is automatically released after the callback
const result = await withHwSession("nvidia", async (session) => {
  return execute([
    ...session.inputArgs,
    "-i", "input.mp4",
    "-c:v", session.encoder,
    "output.mp4",
  ]);
});
```

## `HwSession`

```typescript
interface HwSession {
  mode: HwAccelMode;
  encoder: string;         // e.g. "h264_nvenc"
  inputArgs: string[];     // hardware decode args to prepend
  release(): void;         // call when done (called automatically by withHwSession)
}
```

## Session limits

NVIDIA consumer GPUs (GTX/RTX series without the "Founders Edition" NVENC unlock patch)
limit concurrent encode sessions to 3–5. ffmpeg-kit tracks active sessions and queues
new requests rather than failing.

::: tip NVENC session limit patch
For servers, consider the NVENC session limit patch which removes the 3-session cap
on consumer NVIDIA GPUs.
:::

## Related

- [Hardware Acceleration Guide](/guide/hardware) — practical usage guide
- [Export](/operations/export) — `.hwAccel()` on the export builder

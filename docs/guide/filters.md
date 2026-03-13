---
outline: deep
---

# Filter Graph

For advanced use cases that go beyond the operation builders, ffmpeg-kit exposes
a filter graph builder for constructing `filter_complex` expressions.

## `filter()` — single filter

Build a single filter string with typed parameters:

```typescript
import { filter } from "ffmpeg-kit";

const f = filter("scale", { w: 1920, h: -2 });
// → "scale=w=1920:h=-2"

const blur = filter("boxblur", { luma_radius: 5, luma_power: 1 });
// → "boxblur=luma_radius=5:luma_power=1"
```

## `chain()` — sequential filters

Chain multiple filters with `,` (applied in sequence to the same stream):

```typescript
import { chain, filter } from "ffmpeg-kit";

const c = chain(
  filter("scale", { w: 1920, h: -2 }),
  filter("fps", { fps: 30 }),
  filter("format", { pix_fmts: "yuv420p" }),
);
// → "scale=w=1920:h=-2,fps=fps=30,format=pix_fmts=yuv420p"
```

## `filterGraph()` — complex filter graphs

Build a full `filter_complex` with multiple inputs, outputs, and labeled streams:

```typescript
import { filterGraph, filter } from "ffmpeg-kit";

const graph = filterGraph()
  .input("[0:v]", filter("scale", { w: 1280, h: -2 }), "[scaled]")
  .input("[1:v]", filter("scale", { w: 320, h: -2 }), "[pip]")
  .overlay("[scaled][pip]", filter("overlay", { x: "W-w-10", y: "H-h-10" }), "[out]");

// Use in a raw execute() call
const args = [
  "-i", "main.mp4",
  "-i", "webcam.mp4",
  "-filter_complex", graph.toString(),
  "-map", "[out]",
  "output.mp4",
];
```

## Using filters in operation builders

Some builders accept raw filter strings for advanced use:

```typescript
// Add a custom filter to a transform
await ffmpeg.transform()
  .input("video.mp4")
  .filter(filter("unsharp", { luma_msize_x: 5, luma_msize_y: 5, luma_amount: 1.5 }))
  .output("sharpened.mp4")
  .execute();
```

## Filter expression helpers

```typescript
import { filterHelpers } from "ffmpeg-kit";

// Time-based expressions
filterHelpers.between("t", 1, 5)      // → "between(t,1,5)"
filterHelpers.ifExpr("gt(n,100)", "1", "0")  // → "if(gt(n,100),1,0)"

// Math helpers
filterHelpers.clamp("volume", 0, 1)   // → "clip(volume,0,1)"
```

## Related

- [Transform](/operations/transform) — built-in scale, crop, speed (no filter knowledge needed)
- [Export](/operations/export) — encoding with presets
- [Architecture](/guide/architecture) — where filter graph fits in the layer stack

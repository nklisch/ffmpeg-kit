# Refactor Plan: Entire Codebase (Post Phase 9)

## Summary

With all 9 phases now implemented, the codebase has grown to 11 operation builders plus filters and convenience modules. The previous two refactor plans (refactor-plan.md, refactor-operations.md) have been fully applied. This plan addresses new duplication and missing abstractions that have accumulated across Phases 5-9, plus opportunities that weren't actionable with fewer builders but now show clear patterns across 11+ files.

**Key findings:**
- Result construction (probe + statSync + build result) duplicated across 7 builders (~70 lines)
- Hardcoded codec args in `image.ts` not using shared constants (4 instances)
- HLS and DASH builders share identical codec arg setup and validation patterns (~80 lines)
- Escape functions duplicated across 3 files with overlapping but inconsistent behavior
- Time-range enable expressions built inline instead of using existing `filters/helpers.ts`
- Dimension resolution pattern (`width ?? -2, height ?? -2`) repeated 6+ times

**Impact:** ~300-400 lines of duplication eliminated, consistent patterns established for any future builders.

---

## Status of Previous Refactor Plans

All 13 items from the previous two refactor plans have been completed:
- `refactor-plan.md` (7/7): progress bug, codec classifier, hw suffixes, error standardization, parseDecoders rename, zodParseOrThrow, internal export cleanup
- `refactor-operations.md` (6/6): missingFieldError, wrapTryExecute, pushCodecArgs, loudnorm consolidation, validation dedup, codec default constants

---

## Refactor Steps

### Step 1: Use DEFAULT_VIDEO_CODEC_ARGS in image.ts

**Priority**: High
**Risk**: Low
**Files**: `src/operations/image.ts`

**Current State**: `image.ts` hardcodes `"-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p"` four times (lines 99, 104, 123, 134) instead of using the shared constant from `builder-helpers.ts`. Line 112 also hardcodes `"-c:a", "aac", "-b:a", "128k"` instead of using `DEFAULT_AUDIO_CODEC_ARGS`.

**Target State**: Import and use both constants, matching the pattern in overlay.ts, text.ts, subtitle.ts, transform.ts, and concat.ts.

**Approach**:
1. Add `DEFAULT_VIDEO_CODEC_ARGS` and `DEFAULT_AUDIO_CODEC_ARGS` to the existing import from `builder-helpers.ts`
2. Replace the 4 video codec arg sequences with `...DEFAULT_VIDEO_CODEC_ARGS`
3. Replace the audio codec arg sequence with `...DEFAULT_AUDIO_CODEC_ARGS`
4. Note: line 123 only has 3 of the 4 args (missing `-pix_fmt`), so use `...DEFAULT_VIDEO_CODEC_ARGS` and remove the separate `-pix_fmt` line above it. Line 122 already sets `pixFmt` separately via `-pix_fmt` — keep that as-is and only use the codec args.

**Verification**:
- Build passes
- All image builder tests produce identical args
- `grep -c '"libx264"' src/operations/image.ts` returns 0

---

### Step 2: Use DEFAULT_VIDEO_CODEC_ARGS in streaming.ts (HLS and DASH)

**Priority**: High
**Risk**: Low
**Files**: `src/operations/streaming.ts`

**Current State**: Both `buildHlsArgs()` (lines 77-86) and `buildDashArgs()` (lines 312-316) hardcode codec args inline:
```typescript
const videoCodec = state.videoCodecValue ?? "libx264";
args.push("-c:v", videoCodec);
// ...
const audioCodec = state.audioCodecValue ?? "aac";
args.push("-c:a", audioCodec);
```
These don't use the shared constants because streaming builders allow user-specified codecs. However, the fallback values are the same defaults.

**Target State**: The inline codec fallback blocks remain (since streaming allows codec override), but a comment references the shared constants for consistency. No constant replacement here — the streaming builders intentionally have different behavior (user-specified codec with fallback, not fixed defaults). **Leave as-is with a comment.**

Actually, on closer inspection, these builders accept user codec overrides which makes them different from the fixed-default pattern. **This step is a non-refactor — the existing code is correct.**

**Decision**: Skip. The streaming codec logic intentionally differs from the fixed-default pattern.

---

### Step 3: Extract result construction helper

**Priority**: High
**Risk**: Low
**Files**: `src/util/builder-helpers.ts`, `src/operations/overlay.ts`, `src/operations/text.ts`, `src/operations/export.ts`, `src/operations/gif.ts`, `src/operations/extract.ts`, `src/operations/transform.ts`, `src/operations/concat.ts`

**Current State**: Seven builders repeat this pattern in their `execute()` methods:
```typescript
const fileStat = statSync(state.outputPath);
const probeResult = await probe(state.outputPath, { noCache: true });
const duration = probeResult.format.duration ?? 0;
const videoStream = probeResult.streams.find((s): s is VideoStreamInfo => s.type === "video");
return { outputPath: state.outputPath, duration, sizeBytes: fileStat.size, ... };
```

Each builder extracts slightly different fields from the probe result, but the probe + stat + duration pattern is identical.

**Target State**: A shared helper in `builder-helpers.ts`:
```typescript
export interface BaseProbeInfo {
  outputPath: string;
  sizeBytes: number;
  duration: number;
  probeResult: ProbeResult;
}

export async function probeOutput(outputPath: string): Promise<BaseProbeInfo> {
  const fileStat = statSync(outputPath);
  const probeResult = await probe(outputPath, { noCache: true });
  const duration = probeResult.format.duration ?? 0;
  return { outputPath, sizeBytes: fileStat.size, duration, probeResult };
}
```

Each builder calls `probeOutput()` and destructures what it needs:
```typescript
// overlay.ts / text.ts (simple case)
const { outputPath, duration, sizeBytes } = await probeOutput(state.outputPath);
return { outputPath, duration, sizeBytes };

// export.ts (needs streams)
const { outputPath, duration, sizeBytes, probeResult } = await probeOutput(outPath);
const videoStream = probeResult.streams.find(s => s.type === "video");
return { outputPath, duration, sizeBytes, videoCodec: videoStream?.codec ?? "unknown", ... };
```

**Approach**:
1. Add `probeOutput()` to `builder-helpers.ts` (import `statSync`, `probe`, `ProbeResult`)
2. Refactor each builder's `execute()` to use it
3. Remove now-unused direct imports of `statSync` and `probe` from builders that no longer need them directly

**Verification**:
- Build passes
- All builder E2E tests pass (results contain same fields)
- `grep -c "statSync" src/operations/` shows reduced count

---

### Step 4: Consolidate escape functions

**Priority**: High
**Risk**: Medium (escape contexts differ slightly)
**Files**: `src/core/args.ts`, `src/operations/text.ts`, `src/operations/subtitle.ts`

**Current State**: Three different escape functions with overlapping but inconsistent behavior:
- `args.ts:escapeFilterValue()` — escapes `\ ' ; [ ] = :`
- `text.ts:escapeDrawtext()` — escapes `\ : ' ; [ ]` with different backslash depth (drawtext needs quadruple backslash)
- `subtitle.ts:escapeSubtitlePath()` — converts `\` to `/`, escapes `: ' [ ]`

**Target State**: Keep all three functions but centralize them in `src/core/args.ts` with clear names that document the context:
- `escapeFilterValue()` — existing, for general filter option values
- `escapeDrawtext()` — for drawtext filter text content (quadruple backslash)
- `escapeSubtitlePath()` — for subtitle filter file paths (backslash→forward slash)

**Approach**:
1. Move `escapeDrawtext()` from `text.ts` to `args.ts`, export it
2. Move `escapeSubtitlePath()` from `subtitle.ts` to `args.ts`, export it
3. Update imports in `text.ts` and `subtitle.ts`
4. Add a brief JSDoc to each explaining when to use which

**Verification**:
- Build passes
- All text and subtitle builder tests pass
- All escape functions live in one file
- `grep -rn "function escape" src/` returns only `args.ts` matches

---

### Step 5: Use filters/helpers.ts for time-range enable expressions

**Priority**: Medium
**Risk**: Low
**Files**: `src/operations/overlay.ts`, `src/operations/text.ts`

**Current State**: Both overlay.ts (lines 225-235) and text.ts build time-range enable expressions inline:
```typescript
// overlay.ts
if (startTime !== undefined && endTime !== undefined) {
  overlayFilter += `:enable='between(t,${startTime},${endTime})'`;
} else if (startTime !== undefined) {
  overlayFilter += `:enable='gte(t,${startTime})'`;
}
```

This logic already exists in `src/filters/helpers.ts` as `timeRange()` and `enable()`.

**Target State**: Both builders import and use the existing helpers:
```typescript
import { timeRange, enable } from "../filters/helpers.ts";
// ...
const expr = timeRange({ start: startTime, end: endTime });
if (expr) {
  overlayFilter += `:${enable(expr)}`;
}
```

**Approach**:
1. Import `timeRange` and `enable` from `filters/helpers.ts` in overlay.ts and text.ts
2. Replace the inline conditional logic with helper calls
3. Verify the output strings match exactly

**Verification**:
- Build passes
- Overlay and text builder tests produce identical args
- Time-range logic exists only in `filters/helpers.ts`

---

### Step 6: Extract dimension resolution helper

**Priority**: Medium
**Risk**: Low
**Files**: `src/util/builder-helpers.ts`, `src/operations/extract.ts`, `src/operations/gif.ts`, `src/operations/image.ts`, `src/operations/transform.ts`

**Current State**: The pattern `const w = dims.width ?? -2; const h = dims.height ?? -2;` appears 6+ times across builders. Each then formats it into a scale filter string slightly differently.

**Target State**: A helper that resolves dimensions:
```typescript
export function resolveDimensions(
  dims: { width?: number; height?: number } | undefined,
  autoValue = -2,
): { w: number; h: number } {
  if (!dims) return { w: autoValue, h: autoValue };
  return { w: dims.width ?? autoValue, h: dims.height ?? autoValue };
}
```

Callers become:
```typescript
const { w, h } = resolveDimensions(state.dimensions);
vfilters.push(`scale=${w}:${h}`);
```

**Approach**:
1. Add `resolveDimensions()` to `builder-helpers.ts`
2. Replace dimension resolution in extract.ts, gif.ts, image.ts (2 places), transform.ts
3. Note: overlay.ts uses `-1` instead of `-2` and has different logic — leave as-is
4. Note: concat.ts has additional pad/setsar logic — only replace the dimension resolution part

**Verification**:
- Build passes
- All builder tests produce identical args
- Dimension resolution is consistent

---

### Step 7: Deduplicate HLS/DASH validation functions

**Priority**: Low
**Risk**: Low
**Files**: `src/operations/streaming.ts`

**Current State**: `validateHlsState()` (lines 63-68) and `validateDashState()` (lines 299-304) are identical:
```typescript
function validateHlsState(state: HlsState): asserts state is HlsState & { inputPath: string; outputPath: string } {
  if (!state.inputPath) throw missingFieldError("input");
  if (!state.outputPath) throw missingFieldError("output");
}
```

**Target State**: A single `validateStreamingState()` generic function:
```typescript
function validateStreamingState<T extends { inputPath?: string; outputPath?: string }>(
  state: T,
): asserts state is T & { inputPath: string; outputPath: string } {
  if (!state.inputPath) throw missingFieldError("input");
  if (!state.outputPath) throw missingFieldError("output");
}
```

**Approach**:
1. Replace both functions with the single generic version
2. Update callsites (4 total: toArgs and execute for each builder)

**Verification**:
- Build passes
- All streaming builder tests pass
- Only one validation function in streaming.ts

---

### Step 8: Standardize builder return pattern (`return this` vs `return builder`)

**Priority**: Low
**Risk**: Low
**Files**: `src/operations/subtitle.ts`, `src/operations/image.ts`, `src/operations/streaming.ts`, `src/operations/gif.ts`, `src/operations/extract.ts`

**Current State**: Builders inconsistently use `return this;` vs `return builder;` for method chaining:
- `return this;`: export.ts, concat.ts, audio.ts, transform.ts
- `return builder;`: subtitle.ts, image.ts, streaming.ts, gif.ts, extract.ts
- Mixed/implicit: text.ts, overlay.ts

Both work identically since the builders are plain objects (not classes), but the inconsistency is distracting.

**Target State**: All builders use `return this;` consistently.

**Approach**:
1. Replace `return builder;` with `return this;` in all setter methods across the 5 files
2. This is a mechanical find-and-replace within each file

**Verification**:
- Build passes
- All tests pass
- `grep -rn "return builder;" src/operations/` returns 0

---

## Non-Refactors (Reviewed and Rejected)

### Builder base class / factory abstraction
While all 11 builders follow the same structure (state, validate, buildArgs, toArgs, execute, tryExecute), each has unique state shape, validation rules, and execution logic. A base class would require complex generics for minimal savings since the boilerplate is structural (simple setter methods), not logical. The current pattern is readable and IDE-friendly.

**Decision**: Leave as-is. The per-builder structural duplication is acceptable.

### Shared anchor-to-position utility
`overlay.ts:anchorToPosition()` and `text.ts:anchorToDrawtextXY()` both map anchors to coordinates, but they use fundamentally different coordinate systems (overlay uses `W-w` expressions, drawtext uses `w-tw`). A shared utility would need parameterized coordinate references, adding complexity without meaningful simplification.

**Decision**: Leave as-is. The coordinate systems are intentionally different.

### Stream-finding helper (`streams.find(s => s.type === "video")`)
This appears ~5 times but is a simple one-liner. A helper like `findVideoStream(result)` saves no real complexity and obscures what's happening.

**Decision**: Leave as-is. One-liners don't need abstraction.

---

## Dependency Order

```
Step 1 (image codec constants)    ─── independent
Step 3 (result construction)      ─── independent
Step 4 (escape consolidation)     ─── independent
Step 5 (time-range helpers)       ─── independent
Step 6 (dimension resolution)     ─── independent
Step 7 (streaming validation)     ─── independent
Step 8 (return this consistency)  ─── independent
```

All steps are independent — they can be applied in any order or in parallel.

Recommended execution order by priority: 1, 3, 4 (high) → 5, 6 (medium) → 7, 8 (low)

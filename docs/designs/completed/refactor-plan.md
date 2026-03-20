# Refactor Plan: Entire Project

## Summary

Analysis of the ffmpeg-kit codebase (Phases 1-4 complete) revealed several refactoring opportunities: a logic bug in progress reporting, duplicated codec categorization with a copy-paste bug, inconsistent error handling (plain `Error` vs `FFmpegError`), duplicated hardware-encoder suffix checks, and inconsistent caching patterns. These refactors should be addressed before building Phases 5+ to avoid propagating these patterns into new code.

## Refactor Steps

### Step 1: Fix progress duration bug in execute.ts

**Priority**: High
**Risk**: Low
**Files**: `src/core/execute.ts`

**Current State**: Line 173 passes a nonsensical ternary that always evaluates to `undefined`:
```typescript
const parsed = parseProgressLine(line, options?.signal ? undefined : undefined);
```
The `totalDuration` parameter of `parseProgressLine` is designed to calculate progress percentage, but it's never receiving a value.

**Target State**: Pass a meaningful duration value. The `ExecuteOptions` type should include an optional `totalDuration` field (or it should be derived from probe data by callers), and the execute function should pass it through:
```typescript
const parsed = parseProgressLine(line, options?.totalDuration);
```

**Approach**:
1. Add `totalDuration?: number` to `ExecuteOptions` in `src/types/options.ts`
2. Fix line 173 in `execute.ts` to pass `options?.totalDuration`
3. Update existing tests that cover progress parsing

**Verification**:
- Build passes
- Unit test: `parseProgressLine` with and without `totalDuration` returns correct `percent`
- E2E test: execute with `totalDuration` set emits progress with `percent` populated

---

### Step 2: Fix decoder categorization bug and extract shared codec classifier

**Priority**: High
**Risk**: Low
**Files**: `src/hardware/detect.ts`, `src/encoding/codecs.ts`

**Current State**: Two issues:
1. **Bug** at `detect.ts:273` — `h264` is checked twice instead of checking `h264` or `avc`:
   ```typescript
   if (dec.includes("h264") || dec.includes("h264")) decoders.h264.push(dec);
   ```
2. Codec family classification logic is duplicated between `categorizeEncoder()` (lines 133-137) and the decoder loop (lines 272-277), and also partially in `codecs.ts:getCodecFamily()`.

**Target State**: A single `classifyCodecFamily()` utility used by both encoder and decoder categorization, and the bug is fixed.

**Approach**:
1. Add a `classifyCodecFamily(name: string)` function to `src/encoding/codecs.ts` that maps codec names to `CodecFamily | null` using the `CODEC_REGISTRY` as the source of truth
2. Refactor `categorizeEncoder()` to use `classifyCodecFamily()`
3. Refactor the decoder categorization loop to use `classifyCodecFamily()`
4. Fix the duplicate `h264` check (the bug goes away naturally with the shared function)

**Verification**:
- Build passes
- Existing unit tests for `categorizeEncoder` still pass
- Existing E2E hardware detection tests still pass
- New unit test: `classifyCodecFamily` correctly maps known codec names

---

### Step 3: Extract hardware-encoder suffix check into a shared constant

**Priority**: Medium
**Risk**: Low
**Files**: `src/hardware/detect.ts`

**Current State**: The hardware encoder suffix check is duplicated at lines 125-130 and 238-244:
```typescript
name.includes("_nvenc") || name.includes("_vaapi") || name.includes("_qsv") || name.includes("_amf") || name.includes("_vulkan")
```

**Target State**: A single `HW_ENCODER_SUFFIXES` constant and an `isHardwareEncoder(name: string)` helper.

**Approach**:
1. Define `const HW_ENCODER_SUFFIXES = ["_nvenc", "_vaapi", "_qsv", "_amf", "_vulkan"] as const`
2. Add `function isHardwareEncoder(name: string): boolean` that checks against the constant
3. Replace both inline checks with `isHardwareEncoder(name)`

**Verification**:
- Build passes
- Existing hardware detection tests still pass

---

### Step 4: Standardize error throwing — replace plain `Error` with `FFmpegError`

**Priority**: Medium
**Risk**: Low
**Files**: `src/encoding/codecs.ts`, `src/encoding/config.ts`, `src/util/timecode.ts`, `src/core/validate.ts`

**Current State**: Several modules throw plain `Error` instead of `FFmpegError`:
- `codecs.ts:53,59` — `Error("Unknown codec family: ...")`
- `config.ts:97` — `Error("Cannot use 'auto' mode...")`
- `timecode.ts:17-59` — 8 error cases throw plain `Error`
- `validate.ts:21` — throws `Error` for version parse failure (other errors in validate.ts correctly use `FFmpegError`)

Per project conventions (CLAUDE.md): "`.execute()` throws `FFmpegError` for all runtime failures" and "`FFmpegError` always includes: `code`, `message`, `command`, `stderr`, `exitCode`".

**Target State**: All thrown errors use `FFmpegError` with appropriate error codes. For programmer errors (e.g., passing `"auto"` to `buildEncoderConfig`), use `FFmpegErrorCode.INVALID_INPUT`. For timecode parse errors, use `FFmpegErrorCode.INVALID_INPUT`.

**Approach**:
1. Add `INVALID_ARGUMENT` to `FFmpegErrorCode` enum (or use `INVALID_INPUT` for all programmer errors)
2. Replace each `throw new Error(...)` with `throw new FFmpegError({...})` using appropriate code
3. For utility functions like `parseTimecode` that are called internally, use empty command/stderr since they aren't process-related

**Verification**:
- Build passes
- All existing unit tests still pass (update assertions from `Error` to `FFmpegError` where tested)
- Verify all `throw` statements in `src/` use `FFmpegError`

---

### Step 5: Use `parseDecoders` properly or inline it

**Priority**: Low
**Risk**: Low
**Files**: `src/hardware/detect.ts`

**Current State**: `parseDecoders()` (line 79-81) simply delegates to `parseEncoders()`:
```typescript
export function parseDecoders(stdout: string): string[] {
  return parseEncoders(stdout);
}
```
This is an unnecessary indirection that adds API surface.

**Target State**: Either:
- (A) Rename `parseEncoders` to `parseCodecList` and remove `parseDecoders`, or
- (B) Inline the `parseEncoders` call at the one callsite (line 261) and remove `parseDecoders`

Option A is preferred — clearer semantics.

**Approach**:
1. Rename `parseEncoders` to `parseCodecList`
2. Update the two callsites (encoder parsing at line 237, decoder parsing at line 261)
3. Remove `parseDecoders` export
4. Update any tests that reference `parseDecoders`

**Verification**:
- Build passes
- Existing tests pass (update imports/references)

---

### Step 6: Consolidate Zod validation blocks in probe.ts

**Priority**: Low
**Risk**: Low
**Files**: `src/core/probe.ts`

**Current State**: Two sequential Zod `safeParse` blocks (lines 152-172) with nearly identical error-throwing structure:
```typescript
const rawResult = rawProbeOutputSchema.safeParse(rawJson);
if (!rawResult.success) {
  throw new FFmpegError({ code: ..., message: `...validation failed: ${rawResult.error.message}`, ... });
}
const result = probeResultSchema.safeParse(rawJson);
if (!result.success) {
  throw new FFmpegError({ code: ..., message: `...parsing failed: ${result.error.message}`, ... });
}
```

**Target State**: Extract a helper that validates and throws:
```typescript
function zodParseOrThrow<T>(schema: ZodSchema<T>, data: unknown, label: string, command: string[]): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new FFmpegError({
      code: FFmpegErrorCode.INVALID_INPUT,
      message: `${label}: ${result.error.message}`,
      stderr: "",
      command,
      exitCode: 0,
    });
  }
  return result.data;
}
```

**Approach**:
1. Add `zodParseOrThrow` as a private helper in `probe.ts` (or in `util/` if other modules will need it)
2. Replace both validation blocks with calls to the helper
3. Keep it local unless a second consumer appears

**Verification**:
- Build passes
- Existing probe unit and E2E tests pass
- Probe still throws `FFmpegError` with correct codes on bad input

---

### Step 7: Remove `@internal` exports from detect.ts public API

**Priority**: Low
**Risk**: Medium (may break consumers of internal APIs)
**Files**: `src/hardware/detect.ts`, `src/index.ts`

**Current State**: Five internal parsing functions are exported from `detect.ts` and re-exported from `index.ts`:
- `parseEncoders` / `parseDecoders` / `parseHwaccels` / `mapHwaccelMode` / `categorizeEncoder`

These are marked `@internal` but are on the public API surface.

**Target State**: These functions are not in the barrel export. They remain exported from `detect.ts` for test imports only.

**Approach**:
1. Remove internal function re-exports from `src/index.ts`
2. Tests can still import directly from `src/hardware/detect.ts`
3. If Step 5 has already renamed/removed `parseDecoders`, adjust accordingly

**Verification**:
- Build passes
- Tests still pass (they import from source files, not barrel)
- `src/index.ts` only exports public API

---

### Step 8: Standardize caching pattern across modules

**Priority**: Low
**Risk**: Low
**Files**: `src/hardware/detect.ts`, `src/core/probe.ts`

**Current State**: Two different caching patterns:
1. `probe.ts` uses `Cache<K,V>` from `util/cache.ts` — TTL + LRU, key-based
2. `detect.ts` uses a raw `let detectPromise` — promise memoization, no TTL

These are intentionally different (probe needs per-file caching, detect needs one-shot memoization), but the `clearHardwareCache()` pattern could align better.

**Target State**: Both modules use the `Cache` class. For `detect.ts`, a `Cache<"hw", HardwareCapabilities>` with `maxSize: 1` and `ttlMs: Infinity` would provide the same behavior while gaining consistent `clear()` semantics. However, the promise-memoization pattern in detect.ts is simpler and avoids re-running detection if called concurrently — so the better fix is to leave detect.ts as-is but document the intentional difference.

**Approach**:
1. Add a comment in `detect.ts` explaining why promise memoization is used instead of `Cache` (concurrent call dedup)
2. No code changes needed — the patterns are intentionally different

**Verification**:
- Build passes
- All tests pass

---

## Dependency Order

```
Step 1 (progress bug)     ─── independent
Step 2 (codec classifier) ─── independent
Step 3 (hw suffixes)      ─── independent
Step 4 (error types)      ─── independent
Step 5 (parseDecoders)    ─── depends on Step 2 (shared classifier changes same area)
Step 6 (zod helper)       ─── independent
Step 7 (internal exports) ─── depends on Step 5 (function renames affect exports)
Step 8 (caching docs)     ─── independent
```

Recommended execution order: 1, 2, 3, 4 (parallel) → 5 → 6, 7 (parallel) → 8

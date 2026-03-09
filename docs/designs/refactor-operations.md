# Refactor Plan: Operation Builders (`src/operations/`)

## Summary

The four implemented operation builders (`extract`, `transform`, `audio`, `concat`) contain significant code duplication that will compound as the remaining 7 builders are implemented. Extracting shared utilities now prevents 7x duplication of the same patterns.

**Key duplications identified:**
- `missingFieldError()` — identical in 4 files (24 lines)
- `tryExecute()` — identical in 4 files (40 lines)
- Codec/output arg blocks — repeated 3x within `audio.ts` alone
- Loudnorm JSON parsing — near-identical logic in 2 functions within `audio.ts` (100+ lines)
- Result construction (probe + statSync + build result) — repeated across all 4 builders

**Impact:** ~400-500 lines of duplication eliminated, and all future builders (export, overlay, text, subtitle, image, streaming, gif) avoid inheriting the pattern.

---

## Refactor Steps

### Step 1: Extract `missingFieldError()` to shared utility

**Priority**: High
**Risk**: Low
**Files**: `src/operations/extract.ts`, `src/operations/transform.ts`, `src/operations/audio.ts`, `src/operations/concat.ts`, `src/util/builder-helpers.ts` (new)

**Current State**: Each operation builder defines an identical `missingFieldError()` function:
```typescript
function missingFieldError(field: string): FFmpegError {
  return new FFmpegError({
    code: FFmpegErrorCode.ENCODING_FAILED,
    message: `${field}() is required`,
    stderr: "",
    command: [],
    exitCode: 0,
  });
}
```

**Target State**: Single exported function in `src/util/builder-helpers.ts`, imported by all builders.

**Approach**:
1. Create `src/util/builder-helpers.ts` with `missingFieldError()` export
2. Replace the 4 local definitions with imports
3. Export from `src/index.ts` if useful for downstream builders

**Verification**:
- Build passes
- All existing tests pass unchanged
- `grep -r "function missingFieldError" src/` returns only `builder-helpers.ts`

---

### Step 2: Extract `tryExecute()` wrapper to shared utility

**Priority**: High
**Risk**: Low
**Files**: `src/operations/extract.ts`, `src/operations/transform.ts`, `src/operations/audio.ts`, `src/operations/concat.ts`, `src/util/builder-helpers.ts`

**Current State**: Each builder implements identical `tryExecute()` logic:
```typescript
async tryExecute(options) {
  try {
    const data = await this.execute(options);
    return { success: true, data };
  } catch (err) {
    if (err instanceof FFmpegError) {
      return { success: false, error: err };
    }
    throw err;
  }
}
```

**Target State**: A generic helper in `builder-helpers.ts`:
```typescript
export function wrapTryExecute<T>(
  executeFn: (options?: ExecuteOptions) => Promise<T>,
): (options?: ExecuteOptions) => Promise<OperationResult<T>> {
  return async (options) => {
    try {
      const data = await executeFn(options);
      return { success: true, data };
    } catch (err) {
      if (err instanceof FFmpegError) {
        return { success: false, error: err };
      }
      throw err;
    }
  };
}
```

Each builder's `tryExecute` becomes:
```typescript
tryExecute: wrapTryExecute((...args) => builder.execute(...args)),
```

**Approach**:
1. Add `wrapTryExecute` to `builder-helpers.ts`
2. Replace each builder's `tryExecute` implementation with the wrapper
3. Verify `this` binding works correctly (builders use `this.execute` vs `builder.execute` — normalize to consistent pattern)

**Verification**:
- Build passes
- All tryExecute tests pass (check both success and error paths)
- Each builder's `tryExecute` delegates to the shared wrapper

---

### Step 3: Extract audio codec/output args helper

**Priority**: High
**Risk**: Low
**Files**: `src/operations/audio.ts`

**Current State**: The same 5-check pattern for codec/bitrate/sampleRate/channels/channelLayout appears **3 times** in `audio.ts`:
- `buildMultiInputArgs()` lines 334-348
- `buildSingleInputArgs()` lines 398-412
- `execute()` two-pass normalization lines 728-739

**Target State**: A local helper function within `audio.ts`:
```typescript
function pushCodecArgs(args: string[], state: AudioState): void {
  if (state.codecValue !== undefined) args.push("-c:a", state.codecValue);
  if (state.bitrateValue !== undefined) args.push("-b:a", state.bitrateValue);
  if (state.sampleRateValue !== undefined) args.push("-ar", String(state.sampleRateValue));
  if (state.channelsValue !== undefined) args.push("-ac", String(state.channelsValue));
  if (state.channelLayoutValue !== undefined) args.push("-channel_layout", state.channelLayoutValue);
}
```

**Approach**:
1. Add `pushCodecArgs()` helper function in `audio.ts`
2. Replace all 3 occurrences with `pushCodecArgs(args, state)`

**Verification**:
- Build passes
- All audio builder tests pass
- `grep "state.codecValue" src/operations/audio.ts` shows only the helper

---

### Step 4: Consolidate loudnorm JSON parsing in `audio.ts`

**Priority**: High
**Risk**: Medium (two functions have slightly different error handling)
**Files**: `src/operations/audio.ts`

**Current State**: Two nearly identical functions parse loudnorm JSON from stderr:
- `parseLoudnormJson()` (lines 461-512) — throws on failure, returns `LoudnormMeasurement`
- `parseLoudnessStats()` (lines 836-889) — returns `null` on failure, returns `{ integratedLufs, truePeakDbfs, loudnessRange }`

Both implement the same ~30-line block to find `[Parsed_loudnorm` marker, extract JSON between `{` and `}`, and parse it.

**Target State**: One shared parser with configurable error handling:
```typescript
function extractLoudnormJson(stderr: string): Record<string, string> | null {
  // shared JSON extraction logic
  // returns null if not found
}

function parseLoudnormJson(stderr: string): LoudnormMeasurement {
  const parsed = extractLoudnormJson(stderr);
  if (parsed === null) throw new FFmpegError({...});
  return parsed as LoudnormMeasurement;
}

function parseLoudnessStats(stderr: string): {...} | null {
  const parsed = extractLoudnormJson(stderr);
  if (parsed === null) return null;
  // extract and validate numeric fields
}
```

**Approach**:
1. Extract shared `extractLoudnormJson()` function
2. Simplify `parseLoudnormJson()` and `parseLoudnessStats()` to use it
3. Keep both public-facing functions with their existing signatures

**Verification**:
- Build passes
- Two-pass normalization E2E tests still pass
- Single-pass normalization loudness stats still returned correctly

---

### Step 5: Deduplicate validation in `toArgs()` / `execute()` within each builder

**Priority**: Medium
**Risk**: Low
**Files**: `src/operations/extract.ts`, `src/operations/transform.ts`, `src/operations/audio.ts`, `src/operations/concat.ts`

**Current State**: Each builder validates required fields identically in both `toArgs()` and `execute()`. For example, `extract.ts`:
- Line 137-138: `toArgs()` checks `inputPath` and `outputPath`
- Line 159-160: `execute()` checks the same fields again

`concat.ts` duplicates an even larger block (clip count + output check) at lines 363-374 and 394-405.

**Target State**: `execute()` calls `toArgs()` or a shared `validate()` helper rather than re-implementing the same checks. The approach depends on builder structure:
- For builders where `execute()` calls `buildArgs()` directly: extract a `validateState()` helper called by both `toArgs()` and `execute()`
- For `concat.ts`: extract a `validateConcatState()` that both methods call

**Approach**:
1. In each builder, extract the common validation into a local `validate()` function
2. Call `validate()` at the top of both `toArgs()` and `execute()`
3. Keep builder-specific checks (e.g., percentage timestamps in extract, two-pass in audio) in their respective methods

**Verification**:
- Build passes
- All builder tests pass (both toArgs and execute paths)
- Validation errors still thrown with correct messages

---

### Step 6: Hardcoded codec defaults in transform and concat

**Priority**: Medium
**Risk**: Low
**Files**: `src/operations/transform.ts`, `src/operations/concat.ts`, `src/util/builder-helpers.ts`

**Current State**: Both builders hardcode the same encoding defaults:
- `transform.ts:367`: `"-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p"`
- `concat.ts:274-287`: Same video args plus `"-c:a", "aac", "-b:a", "128k"`

These are identical "safe default" encoding args that will be needed by future builders too.

**Target State**: Named constant(s) in `builder-helpers.ts`:
```typescript
export const DEFAULT_VIDEO_CODEC_ARGS = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p"];
export const DEFAULT_AUDIO_CODEC_ARGS = ["-c:a", "aac", "-b:a", "128k"];
```

**Approach**:
1. Define constants in `builder-helpers.ts`
2. Replace hardcoded args in `transform.ts` and `concat.ts`

**Verification**:
- Build passes
- All builder tests produce identical args
- Future builders can import the same defaults

---

## Non-Refactors (Reviewed and Rejected)

### Builder setter boilerplate
The `input(path) { state.x = path; return this; }` pattern is repeated ~80 times across builders. However:
- A base class adds complexity without meaningful benefit
- Each builder has unique state shape and methods
- The pattern is simple, readable, and IDE-friendly
- TypeScript interfaces already enforce the contract

**Decision**: Leave as-is. The duplication is structural, not logical.

### Result construction pattern
Each builder's `execute()` constructs results differently (extract returns width/height, audio returns codec/channels, concat returns clipCount/method). While the `probe()` + `statSync()` calls are similar, the result shapes diverge enough that a shared helper would require complex generics for minimal savings.

**Decision**: Leave as-is for now. Revisit after more builders are implemented if a clear pattern emerges.

# Pattern: Tri-Modal Execution (toArgs / execute / tryExecute)

Every builder exposes exactly three execution paths: `toArgs()` returns raw CLI args, `execute()` runs FFmpeg and returns a typed result, and `tryExecute()` wraps `execute()` with error handling returning `OperationResult<T>`.

## Rationale
- `toArgs()` — testability and composability without running FFmpeg
- `execute()` — primary use; throws `FFmpegError` on failure
- `tryExecute()` — error-safe variant using discriminated union result

## Examples

### Example 1: wrapTryExecute helper
**File**: `src/util/builder-helpers.ts:18-32`
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

### Example 2: Builder implementing all three methods
**File**: `src/operations/audio.ts:648-782`
```typescript
toArgs(): string[] {
  validateAudioState(state);
  // ... build and return string[]
},
async execute(options?: ExecuteOptions): Promise<AudioResult> {
  validateAudioState(state);
  // ... run FFmpeg, probe output, return AudioResult
},
tryExecute: wrapTryExecute(async (options) => builder.execute(options)),
```

### Example 3: OperationResult union type
**File**: `src/types/results.ts:102-104`
```typescript
export type OperationResult<T> =
  | { success: true; data: T }
  | { success: false; error: FFmpegError };
```

### Example 4: toArgs() limitation note
**File**: `src/operations/extract.ts:138-145`
```typescript
toArgs(): string[] {
  validateExtractState(state);
  // Throws if timestamp is a percentage — requires duration from probing
  if (typeof state.timestamp === "string" && state.timestamp.endsWith("%")) {
    throw new Error("Percentage timestamps require execute() (needs probe)");
  }
  return buildArgs(state);
},
```

## When to Use
- Every operation builder must implement all three methods
- `tryExecute` should always be implemented as `wrapTryExecute(async (opts) => builder.execute(opts))`

## When NOT to Use
- Don't add a fourth execution variant; redirect users to `execute()` + `toArgs()` composition if needed

## Common Violations
- Implementing `tryExecute` manually instead of via `wrapTryExecute`
- Forgetting to re-throw non-`FFmpegError` errors in `tryExecute` (they should propagate)
- Performing side effects in `toArgs()` — it must remain pure/synchronous

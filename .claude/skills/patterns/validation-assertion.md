# Pattern: Validation with TypeScript Assertion Functions

Each builder has a `validateXState()` function using TypeScript's `asserts` signature to narrow optional state fields to required ones, throwing `missingFieldError()` for any missing required field.

## Rationale
Gives a single validation checkpoint before arg construction. After calling the validator, TypeScript knows the required fields are present — no further null checks needed.

## Examples

### Example 1: AudioBuilder validation
**File**: `src/operations/audio.ts:119-126`
```typescript
function validateAudioState(
  state: AudioState,
): asserts state is AudioState & { inputPath: string } {
  if (state.inputPath === undefined) throw missingFieldError("input");
  if (state.detectSilenceConfig === undefined && state.outputPath === undefined) {
    throw missingFieldError("output");
  }
}
```

### Example 2: ExtractBuilder validation
**File**: `src/operations/extract.ts:22-27`
```typescript
function validateExtractState(
  state: ExtractState,
): asserts state is ExtractState & { inputPath: string; outputPath: string } {
  if (state.inputPath === undefined) throw missingFieldError("input");
  if (state.outputPath === undefined) throw missingFieldError("output");
}
```

### Example 3: missingFieldError helper
**File**: `src/util/builder-helpers.ts:8-16`
```typescript
export function missingFieldError(field: string): FFmpegError {
  return new FFmpegError({
    code: FFmpegErrorCode.ENCODING_FAILED,
    message: `${field}() is required`,
    stderr: "",
    command: [],
    exitCode: 0,
  });
}
```

### Example 4: SubtitleBuilder validation
**File**: `src/operations/subtitle.ts:57-63`
```typescript
function validateSubtitleState(
  state: SubtitleState,
): asserts state is SubtitleState & { inputPath: string } {
  if (state.inputPath === undefined) throw missingFieldError("input");
}
```

## When to Use
- Always — every builder must have a `validateXState()` function called at the start of `toArgs()` and `execute()`

## When NOT to Use
- Don't add conditional validation based on operation mode; validate the minimum universal requirements and let arg-building functions handle mode-specific requirements

## Common Violations
- Calling `missingFieldError` with a field name different from the builder method (e.g., "inputPath" instead of "input")
- Performing validation inside arg-building helpers instead of a dedicated validate function
- Forgetting to call validate before building args, leading to runtime undefined access

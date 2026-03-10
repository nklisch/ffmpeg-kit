# Pattern: FFmpegError Classification

FFmpeg process exit codes and stderr are mapped to semantic `FFmpegErrorCode` enum variants via `classifyError()`. All errors propagate as `FFmpegError` instances with code, stderr, command, and exitCode.

## Rationale
Raw exit codes are not meaningful to callers. Semantic codes let consumers distinguish recoverable errors (INPUT_NOT_FOUND, TIMEOUT) from fatal ones (ENCODING_FAILED), and handle them appropriately.

## Examples

### Example 1: FFmpegErrorCode enum
**File**: `src/types/errors.ts:1-15`
```typescript
export enum FFmpegErrorCode {
  BINARY_NOT_FOUND = "BINARY_NOT_FOUND",
  INPUT_NOT_FOUND = "INPUT_NOT_FOUND",
  INVALID_INPUT = "INVALID_INPUT",
  ENCODING_FAILED = "ENCODING_FAILED",
  TIMEOUT = "TIMEOUT",
  FILTER_ERROR = "FILTER_ERROR",
  HWACCEL_ERROR = "HWACCEL_ERROR",
  OUTPUT_ERROR = "OUTPUT_ERROR",
  CANCELLED = "CANCELLED",
  SESSION_LIMIT = "SESSION_LIMIT",
  CODEC_NOT_AVAILABLE = "CODEC_NOT_AVAILABLE",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  UNKNOWN = "UNKNOWN",
}
```

### Example 2: FFmpegError class
**File**: `src/types/errors.ts:17-38`
```typescript
export class FFmpegError extends Error {
  readonly code: FFmpegErrorCode;
  readonly stderr: string;
  readonly command: string[];
  readonly exitCode: number;

  constructor(options: {
    code: FFmpegErrorCode;
    message: string;
    stderr: string;
    command: string[];
    exitCode: number;
    cause?: unknown;
  }) { /* ... */ }
}
```

### Example 3: classifyError in core execute
**File**: `src/core/execute.ts:57-86`
```typescript
function classifyError(stderr: string, exitCode: number): FFmpegErrorCode {
  if (/No such file or directory/.test(stderr)) return FFmpegErrorCode.INPUT_NOT_FOUND;
  if (/Invalid data found/.test(stderr)) return FFmpegErrorCode.INVALID_INPUT;
  if (/Encoder .* not found/.test(stderr)) return FFmpegErrorCode.CODEC_NOT_AVAILABLE;
  if (/Error while opening encoder/.test(stderr)) return FFmpegErrorCode.HWACCEL_ERROR;
  if (/Permission denied/.test(stderr)) return FFmpegErrorCode.PERMISSION_DENIED;
  // ... more patterns
  return FFmpegErrorCode.UNKNOWN;
}
```

### Example 4: missingFieldError using ENCODING_FAILED
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

## When to Use
- All errors from FFmpeg execution must be `FFmpegError` instances
- Use `classifyError()` for process-level failures; use `missingFieldError()` for builder validation failures
- Operation-specific validation errors use `FFmpegErrorCode.ENCODING_FAILED`

## When NOT to Use
- Don't throw plain `Error` from builders or operations — always use `FFmpegError`
- Don't add new `FFmpegErrorCode` variants without updating `classifyError()` regex patterns

## Common Violations
- Throwing `new Error("input required")` instead of `missingFieldError("input")`
- Creating `FFmpegError` with `code: FFmpegErrorCode.UNKNOWN` for classifiable errors
- Omitting `stderr` or `command` fields from `FFmpegError` constructor

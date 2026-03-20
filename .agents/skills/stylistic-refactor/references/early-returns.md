# Style: Early Returns

> Prefer early returns and guard clauses over nested if/else blocks.

## Motivation

Early returns reduce indentation depth, make the happy path obvious, and prevent "arrow code"
(deeply nested conditionals). Guard clauses at function entry validate preconditions upfront,
leaving the rest of the function body flat and readable.

## Before / After

### From this codebase: probe error handling (`src/core/probe.ts`)

**Before:** (current nested pattern)
```typescript
proc.on("close", (exitCode) => {
  if (exitCode !== 0) {
    if (
      stderr.includes("No such file or directory") ||
      stderr.includes("does not exist")
    ) {
      reject(new FFmpegError({ code: FFmpegErrorCode.INPUT_NOT_FOUND, /* ... */ }));
    } else {
      reject(new FFmpegError({ code: FFmpegErrorCode.INVALID_INPUT, /* ... */ }));
    }
    return;
  }
  resolve(stdout);
});
```

**After:**
```typescript
proc.on("close", (exitCode) => {
  if (exitCode === 0) {
    resolve(stdout);
    return;
  }

  const isNotFound =
    stderr.includes("No such file or directory") ||
    stderr.includes("does not exist");
  const code = isNotFound ? FFmpegErrorCode.INPUT_NOT_FOUND : FFmpegErrorCode.INVALID_INPUT;
  reject(new FFmpegError({ code, /* ... */ }));
});
```

### Synthetic example: permission check

**Before:**
```typescript
function processRequest(user: User, data: Data) {
  if (user.isAuthenticated) {
    if (user.hasPermission("write")) {
      if (data.isValid()) {
        return save(data);
      } else {
        throw new Error("Invalid data");
      }
    } else {
      throw new Error("No permission");
    }
  } else {
    throw new Error("Not authenticated");
  }
}
```

**After:**
```typescript
function processRequest(user: User, data: Data) {
  if (!user.isAuthenticated) throw new Error("Not authenticated");
  if (!user.hasPermission("write")) throw new Error("No permission");
  if (!data.isValid()) throw new Error("Invalid data");

  return save(data);
}
```

## Exceptions

- Callbacks with shared cleanup logic may justify if/else over early return
- Pattern matching style (switch/case) is fine when each branch is short and symmetric

## Scope

- Applies to: all functions and callbacks in `src/`
- Does NOT apply to: deeply nested expression-level ternaries (those are a different rule)

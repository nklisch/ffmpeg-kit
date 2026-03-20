# Style: Narrow Types Early

> Use assertion functions and discriminated unions to narrow types at validation boundaries; avoid `as` casts and `!` non-null assertions.

## Motivation

TypeScript's type system is most valuable when it tracks actual runtime state. Assertion functions
(`asserts x is T`) and discriminated unions make narrowing explicit and verifiable. Type casts
(`as`) and non-null assertions (`!`) bypass the compiler — they're lies that compile. Narrowing
early means downstream code is type-safe without additional checks.

## Before / After

### From this codebase: assertion function (`src/operations/extract.ts`)

**Preferred pattern:**
```typescript
function validateExtractState(
  state: ExtractState,
): asserts state is ExtractState & { inputPath: string; outputPath: string } {
  if (state.inputPath === undefined) throw missingFieldError("input");
  if (state.outputPath === undefined) throw missingFieldError("output");
}

// After calling validateExtractState(state), TypeScript knows
// state.inputPath and state.outputPath are strings — no `!` needed
```

### From this codebase: non-null assertion (`src/operations/export.ts`)

**Before:** (current — `!` assertion)
```typescript
// biome-ignore lint/style/noNonNullAssertion: validated before calling
args.push("-i", mainInput!);
```

**After:**
```typescript
// Option A: widen the assertion function to cover this field
function validateExportState(
  state: ExportState,
): asserts state is ExportState & { inputPath: string } {
  if (state.inputPath === undefined && state.videoInputPath === undefined) {
    throw missingFieldError("input");
  }
}

// Option B: explicit narrowing at point of use
const resolvedInput = state.videoInputPath ?? state.inputPath;
if (resolvedInput === undefined) throw missingFieldError("input");
args.push("-i", resolvedInput); // no `!` needed
```

### Synthetic example: API response

**Before:**
```typescript
const data = response.body as UserData;
console.log(data.name!.toUpperCase());
```

**After:**
```typescript
function assertUserData(body: unknown): asserts body is UserData {
  if (typeof body !== "object" || body === null) throw new Error("Invalid response");
  if (!("name" in body) || typeof body.name !== "string") throw new Error("Missing name");
}

assertUserData(response.body);
console.log(response.body.name.toUpperCase()); // type-safe
```

## Exceptions

- `as const` assertions are fine — they widen nothing, they narrow
- `as Record<string, unknown>` on validated `unknown` objects is acceptable in type guard functions
- Non-null assertions in test files are acceptable (biome rule is `off` for tests)

## Scope

- Applies to: all production code in `src/`
- Does NOT apply to: test files (`__tests__/`), type guard implementation internals

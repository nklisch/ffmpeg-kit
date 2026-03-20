# Rule: Separate Trees

> Tests live in `__tests__/` and types live in `src/types/` — never co-located with source files.

## Motivation

Separating tests and types into dedicated trees keeps `src/` focused on implementation.
The `__tests__/` tree mirrors the test tier structure (unit, builder, integration) which maps
to how tests are run, not how source is organized. Centralized types in `src/types/` create
a single source of truth for all type definitions, making them easy to discover and review.

## Before / After

### From this codebase: test structure

**Current (correct):**
```
__tests__/
├── unit/           (pure logic tests, no FFmpeg binary)
│   ├── args.test.ts
│   ├── cache.test.ts
│   └── validate.test.ts
├── builder/        (builder .toArgs() tests, no FFmpeg binary)
│   ├── audio.test.ts
│   ├── export.test.ts
│   └── transform.test.ts
├── integration/    (real FFmpeg execution)
│   ├── audio.e2e.test.ts
│   ├── export.e2e.test.ts
│   └── probe.e2e.test.ts
├── fixtures/       (sample media files)
└── helpers.ts      (shared test utilities)
```

### Synthetic anti-pattern: co-located tests

**Before (anti-pattern for this project):**
```
src/operations/
├── audio.ts
├── audio.test.ts        ← mixed with source
├── audio.e2e.test.ts    ← integration test in source tree
├── transform.ts
└── transform.test.ts
```

**After:**
```
src/operations/
├── audio.ts
└── transform.ts

__tests__/builder/
├── audio.test.ts
└── transform.test.ts

__tests__/integration/
├── audio.e2e.test.ts
```

## Exceptions

- Inline type definitions within a source file are fine when the type is only used in that file
- Test helper utilities specific to a single test file can live in that test file

## Scope

- Applies to: all test files (`.test.ts`, `.e2e.test.ts`), all shared type definitions
- Does NOT apply to: file-local types, test-specific inline helpers

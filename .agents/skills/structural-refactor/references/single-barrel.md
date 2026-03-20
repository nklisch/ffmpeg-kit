# Rule: Single Barrel Export

> One curated barrel export at `src/index.ts`. No per-folder index files (except `src/types/index.ts`).

## Motivation

A single barrel keeps the public API surface intentional and discoverable. Per-folder barrels
create indirection that makes it harder to trace imports, can cause tree-shaking issues, and
encourage exporting implementation details. Internal imports use direct file paths, which are
explicit and IDE-friendly.

## Before / After

### From this codebase: barrel structure

**Current (correct):**
```
src/
├── index.ts              ← single public API barrel (173 exports)
├── types/
│   └── index.ts          ← type-only barrel (re-exports all type files)
├── operations/
│   ├── audio.ts          ← no index.ts here
│   └── transform.ts
└── core/
    ├── execute.ts         ← no index.ts here
    └── probe.ts
```

Internal imports use direct paths:
```typescript
import { audio } from "./operations/audio.ts";
import { execute } from "./core/execute.ts";
```

### Synthetic anti-pattern: per-folder barrels

**Before (anti-pattern):**
```
src/operations/
├── index.ts              ← unnecessary barrel
│   export { audio } from "./audio.ts";
│   export { transform } from "./transform.ts";
├── audio.ts
└── transform.ts

// Elsewhere:
import { audio } from "../operations";  // indirect
```

**After:**
```
// Direct import — explicit, traceable:
import { audio } from "../operations/audio.ts";
```

## Exceptions

- `src/types/index.ts` is allowed because types are consumed as a group and have no runtime cost
- If the project adds a `packages/` workspace, each package gets its own barrel

## Scope

- Applies to: all `src/` subdirectories
- Does NOT apply to: package entry points, type-only barrels

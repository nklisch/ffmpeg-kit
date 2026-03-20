# Rule: Layer Import Direction

> Lower layers must never import from higher layers. Import direction flows downward only.

## Motivation

Unidirectional imports prevent circular dependencies and keep the architecture layered. When
a core module imports from an operation builder, the layers collapse — everything becomes
coupled to everything. The layer hierarchy is explicit and enforced:

```
Layer 0: types/, schemas/         (no runtime imports from src/)
Layer 1: util/                    (imports: types)
Layer 2: core/                    (imports: types, util)
Layer 3: encoding/, filters/, hardware/  (imports: types, util, core)
Layer 4: operations/              (imports: types, util, core, encoding, filters, hardware)
Layer 5: convenience/             (imports: all lower layers)
Layer 6: sdk.ts, index.ts         (imports: all layers)
```

## Before / After

### From this codebase: correct pattern

**Current (correct):**
```typescript
// src/operations/audio.ts (Layer 4)
import type { AudioCodec } from "../types/codecs.ts";       // Layer 0 ✓
import { FFmpegError } from "../types/errors.ts";           // Layer 0 ✓
import { wrapTryExecute } from "../util/builder-helpers.ts"; // Layer 1 ✓
import { execute } from "../core/execute.ts";                // Layer 2 ✓
```

### Synthetic anti-pattern: upward import

**Before (violation):**
```typescript
// src/core/execute.ts (Layer 2)
import { audio } from "../operations/audio.ts";  // Layer 4 — VIOLATION
// Core should never know about specific operations
```

**After:**
```typescript
// src/core/execute.ts (Layer 2)
// Only imports from Layer 0-1
import type { ExecuteOptions } from "../types/base.ts";
import { logger } from "../util/logger.ts";
```

### Synthetic anti-pattern: cross-layer convenience import

**Before (violation):**
```typescript
// src/operations/transform.ts (Layer 4)
import { smartTranscode } from "../convenience/smart.ts";  // Layer 5 — VIOLATION
```

**After:**
```typescript
// The convenience layer wraps operations, not the other way around.
// If shared logic is needed, extract it to util/ (Layer 1).
```

## Exceptions

- Type-only imports (`import type`) from any layer are always allowed — they have no runtime cost
- `src/index.ts` and `src/sdk.ts` are entry points that import from all layers by design

## Scope

- Applies to: all runtime imports between `src/` modules
- Does NOT apply to: type-only imports, test files, config files

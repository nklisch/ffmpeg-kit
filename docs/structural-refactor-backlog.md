# Structural Refactor Backlog

Generated: 2026-03-19

## High Value

### 1. Archive completed design docs to `designs/completed/`

**Rule:** doc-layout

**Current structure:**
```
docs/designs/
├── phase-1-scaffolding.md          ← completed
├── phase-2-types-schemas.md        ← completed
├── phase-3-core-layer.md           ← completed
├── phase-4-hardware-encoding.md    ← completed
├── phase-5-extract-transform.md    ← completed
├── phase-7-export-overlay-text.md  ← completed
├── phase-8-subtitle-image-streaming-gif.md ← completed
├── phase-9-filter-graph.md         ← completed
├── phase-10-convenience-layer.md   ← completed
├── phase-12-polish-publish.md      ← completed
├── refactor-plan.md                ← completed
├── refactor-plan-2.md              ← completed
├── refactor-operations.md          ← completed
└── design-docs-site.md             ← completed
```

**Proposed change:** Create `docs/designs/completed/` and move all 14 completed design docs into it.

**Rationale:** The designs/ folder is 10K+ lines of historical docs. Archiving completed designs
keeps the folder scannable — developers looking for active design work shouldn't wade through
phase-1 through phase-12. Low risk: no code imports these files.

**Affected files:** 14 markdown files moved, no code changes.

---

### 2. Move misplaced design docs into `docs/designs/`

**Rule:** doc-layout

**Current structure:**
```
docs/
├── design-phase-6.md     ← design doc at top level
├── design-phase-11.md    ← design doc at top level
├── ARCH.md               ← reference doc (correct)
├── INTERFACE.md           ← reference doc (correct)
└── ...
```

**Proposed change:** Move `docs/design-phase-6.md` and `docs/design-phase-11.md` into
`docs/designs/completed/` alongside the other phase docs.

**Rationale:** These are completed phase design docs that landed in the wrong directory.
Reference docs (ARCH.md, TESTING.md) belong at docs/ root; design docs belong in designs/.

**Affected files:** 2 markdown files moved, no code changes.

---

## Worth Considering

### 3. Subdivide `src/operations/` by output-type domain

**Rule:** domain-grouping

**Current structure (11 files, 5,158 lines):**
```
src/operations/
├── audio.ts        (797 lines)
├── concat.ts       (430 lines)
├── export.ts       (503 lines)
├── extract.ts      (195 lines)
├── gif.ts          (189 lines)
├── image.ts        (281 lines)
├── overlay.ts      (331 lines)
├── streaming.ts    (432 lines)
├── subtitle.ts     (237 lines)
├── text.ts         (344 lines)
└── transform.ts    (615 lines)
```

**Proposed change:**
```
src/operations/
├── audio/
│   └── audio.ts
├── video/
│   ├── transform.ts
│   ├── overlay.ts
│   ├── text.ts
│   ├── subtitle.ts
│   └── streaming.ts
├── image/
│   ├── image.ts
│   ├── gif.ts
│   └── extract.ts
└── io/
    ├── export.ts
    └── concat.ts
```

**Rationale:** 11 files just exceeds the ~10 file threshold. Grouping by output type matches
how developers think about operations ("I need a video operation" vs scanning a flat list).
The domain grouping also scales as new builders are added.

**Trade-offs:** This is a moderate-churn change. Every import of an operations/ file across the
codebase needs updating (~30+ import sites in src/, __tests__/, and docs examples). The barrel
export at `src/index.ts` also needs path updates. The current flat structure is honestly
navigable at 11 files — this is worth doing but not urgent.

**Affected files:** 11 source files moved, ~30+ import paths updated across src/ and __tests__/.

---

### 4. Organize `__tests__/integration/` by domain

**Rule:** domain-grouping

**Current structure (33 files):**
```
__tests__/integration/
├── audio.e2e.test.ts
├── batch.e2e.test.ts
├── concat.e2e.test.ts
├── edge-cases.e2e.test.ts
├── error-handling.e2e.test.ts
├── export.e2e.test.ts
├── extract.e2e.test.ts
├── filter-graph.e2e.test.ts
├── gif.e2e.test.ts
├── hardware.e2e.test.ts
├── image.e2e.test.ts
├── overlay.e2e.test.ts
├── ... (33 total)
```

**Proposed change:** Subdivide into domain folders mirroring operations/:
```
__tests__/integration/
├── audio/
├── video/
├── image/
├── io/
└── cross-cutting/
    ├── edge-cases.e2e.test.ts
    ├── error-handling.e2e.test.ts
    └── hardware.e2e.test.ts
```

**Rationale:** 33 files significantly exceeds the threshold. Domain grouping would make it
easier to run a subset of integration tests (e.g., all video tests).

**Trade-offs:** Test files have no importers — moving them is safe. But the 1:1 naming between
operations and integration tests is a useful convention. If operations/ gets reorganized (item 3),
tests should follow the same structure. Consider doing both together.

**Affected files:** ~33 test files moved, vitest config may need glob updates.

---

## Not Worth It

### 5. `src/convenience/` is at 9 files — don't pre-subdivide

**Rule:** domain-grouping

9 files is under the ~10 threshold. The convenience/ folder contains small, focused files
(73–171 lines each). Subdividing would create subfolders with 2–3 files each — unnecessary
nesting that hurts rather than helps navigability.

**Why skip:** Below threshold. Files are small. Premature grouping adds indirection.

---

### 6. `src/types/errors.ts` contains a runtime class (`FFmpegError`)

**Rule:** separate-trees (types should be type-only)

`src/types/errors.ts` exports the `FFmpegError` class, which is runtime code living in the
types/ directory. Technically, this violates the "types in src/types/" rule since it's not
purely type definitions.

**Why skip:** `FFmpegError` extends `Error` and is intrinsically tied to the type system —
it defines `FFmpegErrorCode` (the enum) and the error class together. Splitting them would
scatter related concerns. Every consumer imports both the class and the type from the same
location. Moving it would be pure churn with no navigability benefit.

---

### 7. `__tests__/builder/` has 13 files — borderline but fine

**Rule:** domain-grouping

13 files just exceeds the threshold, but builder tests are simple, focused files (100–150 lines
each) with a clear 1:1 mapping to operation builders. The flat structure is easy to scan.

**Why skip:** The 1:1 naming convention (audio.test.ts tests audio.ts) is more valuable than
domain grouping for test files. Churn outweighs the marginal benefit of subfolders.

---

### 8. `src/types/sdk.ts` defines the `FFmpegSDK` interface (206 lines, 40+ methods)

**Rule:** Not a god object — just a wide interface

The SDK interface is large because it's the public API surface aggregating all builders and
convenience functions. It's intentionally wide. Splitting it would scatter the API contract
across multiple files, making it harder to understand the full SDK surface.

**Why skip:** Wide interfaces for SDK entry points are normal. The interface is read-only
(no implementation logic). It's the single source of truth for the public API shape.

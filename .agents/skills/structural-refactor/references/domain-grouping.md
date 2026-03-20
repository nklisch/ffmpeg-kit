# Rule: Domain Grouping

> Subdivide folders that exceed ~10 files into domain-based subfolders grouped by output type.

## Motivation

Flat folders with 10+ files become hard to scan visually. Grouping by output type creates
natural clusters that match how developers think about operations: "I'm working on audio",
"I need an image operation". This scales as new builders are added.

## Before / After

### From this codebase: operations/

**Before:**
```
src/operations/
├── audio.ts        (797 lines)
├── concat.ts       (430 lines)
├── export.ts       (503 lines)
├── extract.ts      (195 lines)
├── gif.ts          (150 lines)
├── image.ts        (281 lines)
├── overlay.ts      (331 lines)
├── streaming.ts    (432 lines)
├── subtitle.ts     (237 lines)
├── text.ts         (344 lines)
└── transform.ts    (615 lines)
```

**After:**
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

### Synthetic example: large utils/ folder

**Before:**
```
src/utils/
├── cache.ts
├── logger.ts
├── platform.ts
├── tempfile.ts
├── timecode.ts
├── audio-filters.ts
├── builder-helpers.ts
├── string-helpers.ts
├── path-helpers.ts
├── env.ts
├── retry.ts
└── hash.ts
```

**After:**
```
src/utils/
├── fs/
│   ├── tempfile.ts
│   ├── path-helpers.ts
│   └── hash.ts
├── runtime/
│   ├── cache.ts
│   ├── logger.ts
│   ├── platform.ts
│   ├── env.ts
│   └── retry.ts
└── media/
    ├── audio-filters.ts
    ├── timecode.ts
    └── string-helpers.ts
```

## Exceptions

- Folders with fewer than ~10 files should stay flat — premature grouping adds unnecessary nesting
- If a subfolder would contain only 1 file, don't create it — keep the file in the parent
- Generated or vendored directories are exempt (e.g., `dist/`, `node_modules/`)

## Scope

- Applies to: `src/` directories that grow beyond ~10 files
- Does NOT apply to: `__tests__/` (already subdivided by test tier), `docs/`, config files

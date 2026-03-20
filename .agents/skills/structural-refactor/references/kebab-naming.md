# Rule: Kebab-Case File Naming

> All source files use kebab-case. No PascalCase, no suffixes like `.service.ts` or `.util.ts`. Tests use `.test.ts` or `.e2e.test.ts` suffixes only.

## Motivation

Consistent naming eliminates guesswork. Kebab-case is the most readable for multi-word file
names and avoids case-sensitivity issues across operating systems. No role suffixes (`.service`,
`.util`, `.controller`) because the folder structure already communicates the file's role —
a file in `core/` is obviously a core module.

## Before / After

### From this codebase: naming conventions

**Current (correct):**
```
src/
├── convenience/
│   ├── batch.ts              ← kebab-case ✓
│   ├── normalize-media.ts    ← kebab-case ✓
│   ├── thumbnail-sheet.ts    ← kebab-case ✓
│   └── smart.ts              ← kebab-case ✓
├── util/
│   ├── audio-filters.ts      ← kebab-case ✓
│   ├── builder-helpers.ts    ← kebab-case ✓
│   └── tempfile.ts           ← kebab-case ✓
└── types/
    ├── base.ts               ← kebab-case ✓
    └── sdk.ts                ← kebab-case ✓

__tests__/
├── builder/
│   └── audio.test.ts         ← .test.ts suffix ✓
└── integration/
    └── audio.e2e.test.ts     ← .e2e.test.ts suffix ✓
```

### Synthetic anti-pattern: mixed naming

**Before:**
```
src/
├── AudioBuilder.ts           ← PascalCase
├── audio.service.ts          ← role suffix
├── audio_helpers.ts          ← snake_case
├── AudioTypes.ts             ← PascalCase
└── utils.ts                  ← generic name
```

**After:**
```
src/
├── operations/
│   └── audio.ts              ← kebab-case, folder provides role
├── util/
│   └── audio-filters.ts      ← kebab-case, descriptive name
└── types/
    └── audio.ts              ← kebab-case, folder provides role
```

## Exceptions

- Configuration files at the repo root follow their own conventions (`tsconfig.json`, `vitest.config.ts`)
- Generated files (e.g., from code generators) may have different naming
- `CLAUDE.md`, `README.md`, and similar uppercase convention files are exempt

## Scope

- Applies to: all files in `src/` and `__tests__/`
- Does NOT apply to: repo root config files, generated files, documentation files

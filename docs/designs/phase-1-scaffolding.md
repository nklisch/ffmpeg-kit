# Design: Phase 1 — Project Scaffolding

## Overview

Set up the complete project foundation: package.json, TypeScript config, build toolchain, linter/formatter, test framework, directory skeleton, barrel export, and CI workflow. After this phase, `pnpm build` produces `dist/`, `pnpm check` passes, and `pnpm test` runs with 0 tests.

**Reference configs**: termtube (biome style, vitest), youtube-ts-auto/packages/shared (tsup, package exports, tsconfig patterns).

---

## Implementation Units

### Unit 1: package.json

**File**: `package.json`

```json
{
  "name": "@ffmpeg-sdk/core",
  "version": "0.0.0",
  "description": "TypeScript SDK wrapping the FFmpeg CLI",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "engines": {
    "node": ">=22.0.0"
  },
  "sideEffects": false,
  "scripts": {
    "build": "tsup",
    "check": "biome check . && tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "vitest run --project e2e",
    "test:unit": "vitest run --project unit"
  },
  "dependencies": {
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.0",
    "@types/node": "^22.0.0",
    "tsup": "^8.5.0",
    "typescript": "^5.9.0",
    "vitest": "^4.0.0"
  },
  "peerDependencies": {
    "pino": ">=9.0.0"
  },
  "peerDependenciesMeta": {
    "pino": {
      "optional": true
    }
  }
}
```

**Implementation Notes**:
- `sideEffects: false` enables tree-shaking for consumers
- `zod` is a runtime dependency (used for probe schema validation)
- `pino` is an optional peer dep (logger is no-op by default, per ARCH.md)
- `@types/node` pinned to `^22.0.0` to match engines requirement
- No `workspace:*` references yet — those come in Phase 12
- The `check` script runs both biome and typecheck for the CI "passes" criterion

**Acceptance Criteria**:
- [ ] `pnpm install` succeeds without errors
- [ ] `pnpm build` is a valid script (will work after tsup config exists)
- [ ] `pnpm check` is a valid script (will work after biome + tsconfig exist)
- [ ] `pnpm test` is a valid script (will work after vitest config exists)
- [ ] Package exports point to `dist/index.js` and `dist/index.d.ts`

---

### Unit 2: tsconfig.json

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2024"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "__tests__"]
}
```

**Implementation Notes**:
- Matches CLAUDE.md requirements: `strict: true`, `noUncheckedIndexedAccess: true`, `target: ES2024`, `module: ESNext`, `moduleResolution: Bundler`, `verbatimModuleSyntax: true`, `isolatedModules: true`
- `lib: ["ES2024"]` — no DOM, this is a Node.js-only package
- `__tests__/` excluded from compilation (test files use vitest's own TS handling)
- `declaration` + `declarationMap` for `.d.ts` generation (tsup uses this)
- Aligns with youtube-ts-auto root tsconfig conventions

**Acceptance Criteria**:
- [ ] `pnpm typecheck` passes with empty `src/index.ts`
- [ ] `verbatimModuleSyntax` enforces `import type` for type-only imports
- [ ] No DOM types available (Node.js only)

---

### Unit 3: tsup.config.ts

**File**: `tsup.config.ts`

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

**Implementation Notes**:
- ESM only per ARCH.md and CLAUDE.md (`"type": "module"`)
- `dts: true` generates `.d.ts` files
- `clean: true` removes `dist/` before each build
- `sourcemap: true` for debugging
- Mirrors youtube-ts-auto/packages/shared/tsup.config.ts pattern exactly
- No `external` config needed yet (zod is bundled, pino is optional peer dep)

**Acceptance Criteria**:
- [ ] `pnpm build` produces `dist/index.js`, `dist/index.d.ts`, `dist/index.js.map`
- [ ] Output is ESM (contains `export` statements, no `require`)
- [ ] No CJS output produced

---

### Unit 4: biome.json

**File**: `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.0/schema.json",
  "files": {
    "includes": [
      "src/**",
      "__tests__/**",
      "*.json",
      "*.ts",
      "!dist",
      "!node_modules",
      "!.claude"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "error"
      },
      "style": {
        "noNonNullAssertion": "warn",
        "useConst": "error",
        "useImportType": "error"
      },
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "error"
      }
    }
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": {
          "level": "on"
        }
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  },
  "json": {
    "formatter": {
      "indentWidth": 2
    }
  },
  "overrides": [
    {
      "includes": ["__tests__/**", "**/*.test.ts"],
      "linter": {
        "rules": {
          "suspicious": {
            "noExplicitAny": "off"
          },
          "style": {
            "noNonNullAssertion": "off"
          }
        }
      }
    }
  ]
}
```

**Implementation Notes**:
- **SDK's own style decisions** (independent of termtube or youtube-ts-auto):
  - Double quotes (matches termtube convention, more common in TypeScript ecosystem)
  - 100 char line width (matches termtube, reasonable for an SDK)
  - `trailingCommas: "all"` — cleaner diffs
  - `semicolons: "always"` — matches both reference projects
- `noExplicitAny: "error"` — strict for library code, relaxed in tests via override
- `useImportType: "error"` — enforces `import type` alongside `verbatimModuleSyntax`
- `noUnusedImports` + `noUnusedVariables` as errors — clean code from day one
- Test files get relaxed rules (no `any` restriction, non-null assertions allowed)

**Acceptance Criteria**:
- [ ] `pnpm lint` passes with empty `src/index.ts`
- [ ] Double quotes enforced
- [ ] Line width is 100 characters
- [ ] `noExplicitAny` is error in src, off in tests

---

### Unit 5: vitest.config.ts

**File**: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.test.ts",
      "__tests__/**/*.test.ts",
    ],
    testTimeout: 30_000,
    hookTimeout: 15_000,
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 4,
      },
    },
    globals: false,
    environment: "node",
  },
});
```

**Implementation Notes**:
- Matches TESTING.md vitest config exactly: `pool: "forks"`, `maxForks: 4`, `testTimeout: 30_000`
- `globals: false` — explicit imports (`import { describe, it, expect } from "vitest"`)
- Includes both `src/**/*.test.ts` (Tier 1 builder tests) and `__tests__/**/*.test.ts` (Tier 2 E2E)
- `hookTimeout: 15_000` — generous for fixture setup
- `environment: "node"` — no JSDOM needed

**Acceptance Criteria**:
- [ ] `pnpm test` runs and reports 0 tests (no test files yet)
- [ ] Pool is forks with max 4
- [ ] Timeout is 30 seconds

---

### Unit 6: Directory Skeleton

Create all directories per ARCH.md module structure.

**Directories to create** (each with a `.gitkeep` to ensure git tracks them):

```
src/
src/core/
src/hardware/
src/encoding/
src/operations/
src/convenience/
src/filters/
src/types/
src/schemas/
src/util/
__tests__/
__tests__/fixtures/
__tests__/unit/
__tests__/builder/
__tests__/integration/
```

**Implementation Notes**:
- Use `.gitkeep` files in empty directories so they're tracked by git
- Test directory structure matches ARCH.md testing strategy: `unit/`, `builder/`, `integration/`
- `__tests__/fixtures/` will hold generated test media files (Phase 3)
- Source directories match ARCH.md module structure exactly

**Acceptance Criteria**:
- [ ] All directories exist
- [ ] `git status` shows all directories tracked (via `.gitkeep`)
- [ ] Directory structure matches ARCH.md

---

### Unit 7: Barrel Export

**File**: `src/index.ts`

```typescript
// @ffmpeg-sdk/core — public API barrel export
// Populated as modules are implemented in subsequent phases.
```

**Implementation Notes**:
- Empty placeholder per ROADMAP.md Phase 1 specification
- Comment explains purpose, will be filled in as phases progress
- Must compile and produce valid `dist/index.js` + `dist/index.d.ts`

**Acceptance Criteria**:
- [ ] `pnpm build` succeeds and produces `dist/index.js` with empty module
- [ ] `dist/index.d.ts` is generated
- [ ] `pnpm typecheck` passes

---

### Unit 8: .gitignore

**File**: `.gitignore`

```
node_modules/
dist/
*.tsbuildinfo
.turbo/
coverage/
```

**Implementation Notes**:
- Standard ignores for Node.js + TypeScript project
- `dist/` is build output (not committed)
- `coverage/` for vitest coverage reports
- `.turbo/` in case turbo is used in future monorepo integration
- Test fixtures (`__tests__/fixtures/*.mp4` etc.) are intentionally NOT ignored — per TESTING.md they're committed

**Acceptance Criteria**:
- [ ] `node_modules/` and `dist/` are not tracked by git
- [ ] Test fixtures directory IS tracked

---

### Unit 9: CI Workflow

**File**: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  check:
    name: Lint + Typecheck + Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test (Tier 1 — no ffmpeg needed)
        run: pnpm test
```

**Implementation Notes**:
- Phase 1 CI runs lint + typecheck + Tier 1 tests only (no ffmpeg binary needed)
- Uses pnpm v9 (matches youtube-ts-auto's packageManager)
- Node 22 matches `engines` requirement
- `--frozen-lockfile` ensures CI uses exact lockfile
- FFmpeg installation step will be added in Phase 3 when E2E tests are introduced
- Single job keeps it simple — can be split later if needed

**Acceptance Criteria**:
- [ ] Workflow file is valid YAML
- [ ] Triggers on push to main and PRs
- [ ] Runs lint, typecheck, and test steps
- [ ] Uses Node 22 and pnpm

---

## Implementation Order

1. **`.gitignore`** (Unit 8) — so node_modules/dist aren't tracked from the start
2. **`package.json`** (Unit 1) — enables `pnpm install`
3. **`tsconfig.json`** (Unit 2) — TypeScript configuration
4. **`tsup.config.ts`** (Unit 3) — build toolchain
5. **`biome.json`** (Unit 4) — linter/formatter
6. **`vitest.config.ts`** (Unit 5) — test framework
7. **Directory skeleton** (Unit 6) — all `src/` and `__tests__/` subdirectories
8. **`src/index.ts`** (Unit 7) — barrel export placeholder
9. **`.github/workflows/ci.yml`** (Unit 9) — CI workflow

**Rationale**: `.gitignore` first prevents accidental commits. `package.json` next so `pnpm install` works and all other configs can reference installed packages. Config files follow in dependency order. Directory skeleton and barrel export come after all configs. CI last since it depends on everything else.

---

## Testing

Phase 1 has no tests to write. The "done when" criteria are:

1. `pnpm install` — installs all dependencies
2. `pnpm build` — produces `dist/` with `index.js`, `index.d.ts`, `index.js.map`
3. `pnpm check` — biome lint + typecheck both pass (0 errors)
4. `pnpm test` — vitest runs and reports 0 tests (no failures)

These are verified manually and by the CI workflow.

---

## Verification Checklist

```bash
# After implementation, run these commands to verify Phase 1 is complete:

# 1. Install dependencies
pnpm install

# 2. Build produces dist/
pnpm build
ls dist/index.js dist/index.d.ts dist/index.js.map

# 3. Lint + typecheck pass
pnpm check

# 4. Tests run (0 tests, no failures)
pnpm test

# 5. Verify ESM output
head -5 dist/index.js  # Should not contain "require"

# 6. Verify directory structure
find src -type d | sort
find __tests__ -type d | sort

# 7. Verify biome formatting
pnpm lint
```

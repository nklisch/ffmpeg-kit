---
name: structural-refactor
description: >
  Project structural organization rules for TypeScript/ffmpeg-kit. Proactively scans for
  organizational issues and produces a prioritized backlog. Defines the team's preferred
  file, folder, and module structure.
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent, Write
---

# Structural Refactor

Scan the codebase for organizational issues based on these structural rules.
Each rule has a reference file with rationale, examples, and exceptions.

## Rules

| Rule | Summary | Reference |
|------|---------|-----------|
| domain-grouping | Subdivide folders exceeding ~10 files by output-type domain | [details](references/domain-grouping.md) |
| separate-trees | Tests in `__tests__/`, types in `src/types/` — never co-located | [details](references/separate-trees.md) |
| single-barrel | One curated barrel at `src/index.ts`; no per-folder index files | [details](references/single-barrel.md) |
| doc-layout | Structured doc categories; completed designs archived to `designs/completed/` | [details](references/doc-layout.md) |
| layer-imports | Lower layers must never import from higher layers | [details](references/layer-imports.md) |
| kebab-naming | All source files kebab-case; tests use `.test.ts` / `.e2e.test.ts` only | [details](references/kebab-naming.md) |

## Output

Write the refactoring backlog to `docs/structural-refactor-backlog.md`.

The document should be a **prioritized refactoring backlog** with three tiers:

### High Value
Structural changes that significantly improve navigability, maintainability, or developer
onboarding with low risk. Each entry: current structure, proposed change, rationale, affected files.

### Worth Considering
Valid reorganizations with moderate impact or moderate effort. Include rationale.

### Not Worth It
Code that technically violates a structural rule but should NOT be reorganized. Include WHY:
too many dependents, would break imports across the codebase, churn outweighs benefit, the
current structure has historical reasons that still apply.

Focus on structural changes that make the codebase easier to navigate — skip changes that
would cause massive churn for marginal improvement.

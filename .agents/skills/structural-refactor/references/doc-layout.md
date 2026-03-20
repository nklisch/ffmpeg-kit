# Rule: Documentation Layout

> Structured doc categories with completed design docs archived to `designs/completed/`.

## Motivation

As a project grows, the `docs/` folder can become a dumping ground. Separating active references
(architecture, testing guides) from historical design docs (phase plans, completed proposals)
keeps the docs tree navigable. Developers looking for "how does this work" shouldn't wade
through "how we decided to build it in phase 3".

## Before / After

### From this codebase: docs/

**Before:**
```
docs/
├── ARCH.md                        ← active reference
├── INTERFACE.md                   ← active reference
├── TESTING.md                     ← active reference
├── ROADMAP.md                     ← active reference
├── CLAUDE.md                      ← active reference
├── changelog.md                   ← active reference
├── test-gap-analysis.md           ← active reference
├── test-design.md                 ← active reference
├── designs/
│   ├── phase-1-scaffolding.md     ← completed
│   ├── phase-2-core.md            ← completed
│   ├── phase-3-operations.md      ← completed
│   ├── ...
│   ├── phase-12-polish-publish.md ← completed
│   ├── refactor-plan.md           ← completed
│   ├── refactor-plan-2.md         ← completed
│   ├── refactor-operations.md     ← completed
│   └── design-docs-site.md        ← may be active
```

**After:**
```
docs/
├── ARCH.md                        ← active reference
├── INTERFACE.md                   ← active reference
├── TESTING.md                     ← active reference
├── ROADMAP.md                     ← active reference
├── CLAUDE.md                      ← active reference
├── changelog.md                   ← active reference
├── test-gap-analysis.md           ← active reference
├── test-design.md                 ← active reference
├── designs/
│   ├── completed/
│   │   ├── phase-1-scaffolding.md
│   │   ├── phase-2-core.md
│   │   ├── ...
│   │   ├── phase-12-polish-publish.md
│   │   ├── refactor-plan.md
│   │   ├── refactor-plan-2.md
│   │   └── refactor-operations.md
│   └── design-docs-site.md        ← active design
```

### Synthetic example: growing docs folder

**Before:**
```
docs/
├── README.md
├── api.md
├── adr-001-database-choice.md
├── adr-002-auth-provider.md
├── migration-guide-v1-v2.md
├── deployment.md
├── architecture.md
└── old-rfc-streaming.md
```

**After:**
```
docs/
├── README.md
├── api.md
├── architecture.md
├── deployment.md
├── migration-guide-v1-v2.md
├── decisions/
│   ├── completed/
│   │   ├── adr-001-database-choice.md
│   │   └── adr-002-auth-provider.md
│   └── (active ADRs here)
```

## Exceptions

- Design docs that are actively being implemented should stay in `designs/` root, not `completed/`
- VitePress site structure (`docs/.vitepress/`, `docs/public/`) is governed by the framework, not this rule
- `docs/guide/` and `docs/api/` for the VitePress site follow their own organization

## Scope

- Applies to: `docs/designs/` and any future decision/proposal documents
- Does NOT apply to: VitePress content structure, top-level reference docs, README files

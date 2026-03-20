---
name: stylistic-refactor
description: >
  Project stylistic refactoring rules for TypeScript/FFmpeg-kit. Proactively scans for
  refactoring opportunities and produces a prioritized backlog.
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent, Write
---

# Stylistic Refactor

Scan the codebase for opportunities to apply these stylistic preferences.
Each style has a reference file with rationale, examples, and exceptions.

## Styles

| Style | Rule (one line) | Reference |
|-------|-----------------|-----------|
| Factory over class | Prefer factory functions with closure state over classes | [details](references/factory-over-class.md) |
| Early returns | Prefer early returns and guard clauses over nested conditionals | [details](references/early-returns.md) |
| Array assembly | Build multi-part strings by pushing to arrays and joining, not concatenation | [details](references/array-assembly.md) |
| Explicit over clever | Prefer readable, explicit code over clever one-liners or chained transforms | [details](references/explicit-over-clever.md) |
| Narrow types early | Use assertion functions and discriminated unions to narrow types; avoid `as` casts and `!` | [details](references/narrow-types-early.md) |
| Compose, don't nest | Break complex logic into small named helpers rather than long monolithic functions | [details](references/compose-dont-nest.md) |
| Pure where possible | Isolate pure computation from side effects; keep I/O at the boundaries | [details](references/pure-where-possible.md) |

## Output

Produce a **prioritized refactoring backlog** as a markdown document with three tiers:

### High Value
Refactors that significantly improve readability, consistency, or maintainability
with low risk. Each entry: file path, current code snippet, proposed change, rationale.

### Worth Considering
Valid refactors with moderate impact or moderate effort. Include rationale.

### Not Worth It
Code that technically violates a style but should NOT be refactored. Include WHY:
too destructive, too complex for marginal gain, would obscure domain logic, breaks
API contracts, or forces unnatural patterns. We want a unified feel, not refactoring
for refactoring's sake.

Focus on code that benefits from the change -- skip trivial or cosmetic-only improvements.

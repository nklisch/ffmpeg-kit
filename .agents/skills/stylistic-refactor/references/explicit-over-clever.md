# Style: Explicit Over Clever

> Prefer readable, explicit code over clever one-liners, chained transforms, or dense expressions.

## Motivation

FFmpeg integration code is already complex due to the domain. Adding clever JavaScript patterns
(long reduce chains, nested ternaries, type assertion chains) compounds the cognitive load.
Explicit code is easier to debug, review, and modify by contributors unfamiliar with the tricks.

## Before / After

### From this codebase: isPinoLike type guard (`src/util/logger.ts`)

**Before:** (current — repeated `as` casts)
```typescript
function isPinoLike(value: unknown): value is PinoLike {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).debug === "function" &&
    typeof (value as Record<string, unknown>).info === "function" &&
    typeof (value as Record<string, unknown>).warn === "function" &&
    typeof (value as Record<string, unknown>).error === "function"
  );
}
```

**After:**
```typescript
function isPinoLike(value: unknown): value is PinoLike {
  if (value == null || typeof value !== "object") return false;

  const obj = value as Record<string, unknown>;
  const required = ["debug", "info", "warn", "error"] as const;
  return required.every((method) => typeof obj[method] === "function");
}
```

### Synthetic example: data transformation

**Before:**
```typescript
const result = items
  .filter(x => x.active)
  .reduce((acc, x) => ({
    ...acc,
    [x.id]: x.tags.reduce((t, tag) => ({ ...t, [tag]: (t[tag] ?? 0) + 1 }), {} as Record<string, number>)
  }), {} as Record<string, Record<string, number>>);
```

**After:**
```typescript
const result: Record<string, Record<string, number>> = {};
for (const item of items) {
  if (!item.active) continue;

  const tagCounts: Record<string, number> = {};
  for (const tag of item.tags) {
    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }
  result[item.id] = tagCounts;
}
```

## Exceptions

- Simple `.map()`, `.filter()`, `.find()` chains are fine — those are idiomatic and clear
- Single ternaries for simple value selection are fine: `codec === "jpg" ? "mjpeg" : codec`
- Array spreads and destructuring are fine when they improve clarity

## Scope

- Applies to: all source code in `src/`
- Does NOT apply to: one-liner utility functions where the "clever" version is genuinely clearer

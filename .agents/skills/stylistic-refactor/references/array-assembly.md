# Style: Array Assembly

> Build multi-part strings by pushing to arrays and joining, not by concatenation or template nesting.

## Motivation

FFmpeg commands and filter chains are complex multi-part strings. Pushing segments to an array
and joining with a delimiter is more readable, debuggable (inspect the array), and maintainable
(add/remove segments independently) than nested template literals or string concatenation.

## Before / After

### From this codebase: zoompan filter (`src/operations/transform.ts`)

**Before:** (current concatenation)
```typescript
const zExpr = ez === sz ? String(sz) : `${sz}+(${ez - sz})*(${t})`;
const xCenterExpr = ex === sx ? `${sx}*iw` : `(${sx}+(${ex - sx})*(${t}))*iw`;
const yCenterExpr = ey === sy ? `${sy}*ih` : `(${sy}+(${ey - sy})*(${t}))*ih`;
const xExpr = `${xCenterExpr}-iw/(2*zoom)`;
const yExpr = `${yCenterExpr}-ih/(2*zoom)`;

return `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${d}:s=${width}x${height}:fps=${fps}`;
```

**After:**
```typescript
const zExpr = ez === sz ? String(sz) : `${sz}+(${ez - sz})*(${t})`;
const xCenter = ex === sx ? `${sx}*iw` : `(${sx}+(${ex - sx})*(${t}))*iw`;
const yCenter = ey === sy ? `${sy}*ih` : `(${sy}+(${ey - sy})*(${t}))*ih`;

const params: string[] = [
  `z='${zExpr}'`,
  `x='${xCenter}-iw/(2*zoom)'`,
  `y='${yCenter}-ih/(2*zoom)'`,
  `d=${d}`,
  `s=${width}x${height}`,
  `fps=${fps}`,
];
return `zoompan=${params.join(":")}`;
```

### From this codebase: buildFilter (`src/core/args.ts` - preferred)

```typescript
export function buildFilter(
  name: string,
  options?: Record<string, string | number | boolean> | string,
): string {
  if (options === undefined) return name;
  if (typeof options === "string") return `${name}=${options}`;

  const parts: string[] = [];
  for (const [key, val] of Object.entries(options)) {
    if (val === false) continue;
    if (val === true) parts.push(key);
    else parts.push(`${key}=${val}`);
  }
  return parts.length > 0 ? `${name}=${parts.join(":")}` : name;
}
```

### Synthetic example: SQL query builder

**Before:**
```typescript
let query = "SELECT " + columns.join(", ") + " FROM " + table;
if (where) query += " WHERE " + where;
if (orderBy) query += " ORDER BY " + orderBy;
if (limit) query += " LIMIT " + limit;
```

**After:**
```typescript
const parts = [`SELECT ${columns.join(", ")}`, `FROM ${table}`];
if (where) parts.push(`WHERE ${where}`);
if (orderBy) parts.push(`ORDER BY ${orderBy}`);
if (limit) parts.push(`LIMIT ${limit}`);
const query = parts.join(" ");
```

## Exceptions

- Simple two-part template literals like `` `${name}.${ext}` `` don't need array assembly
- Single-expression FFmpeg parameters like `-ss ${timestamp}` are fine as templates

## Scope

- Applies to: FFmpeg filter strings, argument building, any multi-segment string construction
- Does NOT apply to: simple interpolations, log messages, error messages with 1-2 variables

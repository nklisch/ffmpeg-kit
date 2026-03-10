# Pattern: Filter Chain Assembly

Operations build filter chains by conditionally pushing individual filter strings into an array, then joining with `,`. Each feature appends to the array only if its config is set.

## Rationale
Keeps filter construction declarative and readable. Each feature is isolated — easy to add, remove, or reorder. The resulting comma-joined string is passed to `-vf`, `-af`, or `-filter_complex`.

## Examples

### Example 1: Audio filter chain
**File**: `src/operations/audio.ts:138-275` (excerpt)
```typescript
function buildAudioFilters(state: ValidatedAudioState): string {
  const filters: string[] = [];

  if (state.highpassFreq !== undefined) {
    filters.push(highpass(state.highpassFreq.frequency, state.highpassFreq.order));
  }
  if (state.lowpassFreq !== undefined) {
    filters.push(lowpass(state.lowpassFreq.frequency, state.lowpassFreq.order));
  }
  if (state.gateConfig !== undefined) {
    filters.push(agate(state.gateConfig));
  }
  // ... 14 more sections
  if (state.fadeInConfig !== undefined) {
    filters.push(afade({ type: "in", duration: state.fadeInConfig.duration }));
  }

  return filters.join(",");
}
```

### Example 2: Video filter chain
**File**: `src/operations/transform.ts:206-277` (excerpt)
```typescript
function buildVideoFilters(state: ValidatedTransformState): string {
  const filters: string[] = [];

  if (state.scaleConfig !== undefined) {
    filters.push(scale(state.scaleConfig));
  }
  if (state.cropConfig !== undefined) {
    filters.push(crop(state.cropConfig));
  }
  if (state.padConfig !== undefined) {
    filters.push(pad(state.padConfig));
  }
  // ... additional sections

  return filters.join(",");
}
```

### Example 3: buildFilter core utility
**File**: `src/core/args.ts:49-66`
```typescript
export function buildFilter(
  name: string,
  options: Record<string, string | number | boolean> | string,
): string {
  if (typeof options === "string") return `${name}=${options}`;
  const parts = Object.entries(options)
    .filter(([, v]) => v !== false)
    .map(([k, v]) => `${k}=${v}`);
  return parts.length > 0 ? `${name}=${parts.join(":")}` : name;
}
```

## When to Use
- Any time multiple optional filters may be combined into a `-vf`, `-af`, or `-filter_complex` chain
- Individual filter helper functions in `src/filters/video.ts` and `src/filters/audio.ts` use `buildFilter()` as their foundation

## When NOT to Use
- Complex filter graphs with labeled pads (`[label]`) — use `FilterGraphBuilder` instead
- Single fixed filters that are always present (just inline them)

## Common Violations
- Concatenating filter strings with `+` or manually building `name=val:val` without `buildFilter()`
- Pushing empty strings into the filters array (they create spurious `,` separators)
- Hardcoding filter parameter separators instead of using `buildFilter()`'s `:` joining

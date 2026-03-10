# Pattern: Fluent Builder with Closure State

Each operation is a factory function returning a typed interface. State lives in a closure (not a class), and all configuration methods return `this` for chaining.

## Rationale
Enables tree-shakeable, type-safe, fluent APIs without `new`. The interface defines the public contract; the closure keeps state private.

## Examples

### Example 1: AudioBuilder
**File**: `src/operations/audio.ts:14-115`
```typescript
interface AudioState {
  inputPath?: string;
  additionalInputs: Array<{ path: string; config?: AudioInputConfig }>;
  // ...many optional config fields
}

export interface AudioBuilder {
  input(path: string): this;
  // ...configuration methods
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<AudioResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<AudioResult>>;
}

export function audio(): AudioBuilder {
  const state: AudioState = { additionalInputs: [], eqConfigs: [] };
  const builder: AudioBuilder = {
    input(path) { state.inputPath = path; return builder; },
    // ...other methods
  };
  return builder;
}
```

### Example 2: ExtractBuilder
**File**: `src/operations/extract.ts:95-186`
```typescript
interface ExtractState {
  inputPath?: string;
  timestamp?: Timestamp;
  outputPath?: string;
  // ...
}

export interface ExtractBuilder {
  input(path: string): this;
  timestamp(ts: Timestamp): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ExtractResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ExtractResult>>;
}
```

### Example 3: FilterGraphBuilder
**File**: `src/filters/graph.ts:31-162`
```typescript
export interface FilterGraphBuilder {
  videoFilter(filter: string): this;
  audioFilter(filter: string): this;
  complex(expr: string): this;
  output(label: string, type: "v" | "a"): this;
  toArgs(): string[];
}

export function filterGraph(): FilterGraphBuilder {
  // state in closure
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  // ...
}
```

## When to Use
- Adding a new operation (audio, video, image processing, etc.)
- Exposing a fluent configuration API

## When NOT to Use
- One-off utility functions that don't need state
- Internal helpers not exposed in the public API

## Common Violations
- Using a class instead of a factory + interface (breaks tree-shaking)
- Mutating state without returning `this`/`builder` (breaks chaining)
- Exposing state directly instead of via the interface

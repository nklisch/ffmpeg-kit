# Style: Factory Over Class

> Prefer factory functions returning object literals with closure state over class definitions.

## Motivation

The codebase achieves fluent builder APIs without class boilerplate. Factory functions with
closure state are simpler, avoid `this` binding issues, and make dependency injection natural
via function parameters. This keeps the entire codebase consistent with one composition model.

## Before / After

### From this codebase: extract builder

**Before:** (hypothetical class-based version)
```typescript
class ExtractBuilder {
  private state: ExtractState = {};
  constructor(private deps: BuilderDeps) {}

  input(path: string): this {
    this.state.inputPath = path;
    return this;
  }

  output(path: string): this {
    this.state.outputPath = path;
    return this;
  }
}
```

**After:** (actual code — `src/operations/extract.ts`)
```typescript
export function extract(deps: BuilderDeps = defaultDeps): ExtractBuilder {
  const state: ExtractState = {};

  const builder: ExtractBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
    },
    // ...
  };
  return builder;
}
```

### Synthetic example: utility service

**Before:**
```typescript
class FileConverter {
  private format: string = "mp4";
  setFormat(f: string) { this.format = f; return this; }
  convert(input: string) { return runConvert(input, this.format); }
}
```

**After:**
```typescript
function fileConverter() {
  let format = "mp4";
  return {
    setFormat(f: string) { format = f; return this; },
    convert(input: string) { return runConvert(input, format); },
  };
}
```

## Exceptions

- `FFmpegError extends Error` is the one justified class — extending built-in `Error` requires a class
- Third-party library integration may require classes if the library expects them

## Scope

- Applies to: all builder APIs, services, and stateful utilities in `src/`
- Does NOT apply to: error types extending `Error`, test helpers, third-party adapters

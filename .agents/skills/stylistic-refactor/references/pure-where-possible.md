# Style: Pure Where Possible

> Prefer pure functions for computation and logic; isolate side effects (I/O, state mutation) to execution boundaries.

## Motivation

The codebase's tri-modal execution pattern (`toArgs()` / `execute()` / `tryExecute()`) already
embodies this: `toArgs()` is pure computation, `execute()` is the side-effect boundary. Extending
this principle keeps logic testable without mocking, makes functions predictable, and clearly
separates "what to do" from "doing it."

## Before / After

### From this codebase: toArgs is pure (`src/operations/extract.ts`)

**Preferred pattern:**
```typescript
toArgs() {
  validateExtractState(state);

  let resolvedTimestamp: number | undefined;
  if (state.timestampValue !== undefined) {
    const ts = state.timestampValue;
    if (typeof ts === "string" && ts.trim().endsWith("%")) {
      throw new FFmpegError({ /* ... */ });
    }
    resolvedTimestamp = parseTimecode(ts);
  }

  return buildArgs(state, resolvedTimestamp);
}
```
Pure: no I/O, no async, same input gives same output. Testable by asserting on return value.

### From this codebase: mixed concerns in execute (`src/operations/export.ts`)

**Before:** (computation mixed with I/O and cleanup)
```typescript
async execute(options) {
  validateExportState(state);
  const outPath = state.outputPath;

  let chapterTempFile: ReturnType<typeof createTempFile> | undefined;
  if (state.chaptersValue !== undefined && state.chaptersValue.length > 0) {
    chapterTempFile = createTempFile({ suffix: ".txt" }, deps.tempDir);
    writeChapterFile(state.chaptersValue, chapterTempFile.path);
  }

  try {
    await deps.execute(buildArgs(state, undefined, undefined, chapterTempFile?.path), options);
  } finally {
    chapterTempFile?.cleanup();
  }

  const probeData = await probeOutput(outPath, deps.probe);
  return { outputPath: probeData.outputPath, /* ... */ };
}
```

**After:** (separate pure preparation from impure execution)
```typescript
async execute(options) {
  validateExportState(state);

  // Pure: compute what we need
  const chapterContent = state.chaptersValue?.length
    ? formatChapterFile(state.chaptersValue)
    : undefined;

  // Impure: execute with resource management
  const result = await executeWithChapters(
    deps, state, chapterContent, options,
  );

  // Pure: shape the result
  return buildExportResult(result);
}
```

### Synthetic example: report generation

**Before:**
```typescript
function generateReport(userId: string) {
  const user = db.getUser(userId);          // I/O
  const stats = computeStats(user.data);    // pure
  const html = renderTemplate(stats);       // pure
  fs.writeFileSync("report.html", html);    // I/O
  sendEmail(user.email, html);              // I/O
  return { sent: true };
}
```

**After:**
```typescript
// Pure
function buildReport(userData: UserData): { stats: Stats; html: string } {
  const stats = computeStats(userData);
  const html = renderTemplate(stats);
  return { stats, html };
}

// Impure orchestrator
async function generateAndSendReport(userId: string) {
  const user = await db.getUser(userId);
  const { html } = buildReport(user.data);
  await fs.writeFile("report.html", html);
  await sendEmail(user.email, html);
}
```

## Exceptions

- `execute()` methods are inherently impure — that's by design (tri-modal pattern)
- Builder methods that mutate closure state are acceptable — the mutation is scoped and intentional
- Caching (like probe cache) is an acceptable side effect when it's transparent to callers

## Scope

- Applies to: computation, argument building, data transformation, result shaping
- Does NOT apply to: `execute()` / `tryExecute()` methods, builder state mutation, cache operations

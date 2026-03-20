# Style: Compose, Don't Nest

> Break complex logic into small named helper functions rather than long monolithic functions.

## Motivation

Long functions with many conditional branches are hard to test in isolation, hard to name
(what does it do?), and hard to review (which branch changed?). Extracting named helpers
makes each piece independently testable, self-documenting via its name, and reusable.

## Before / After

### From this codebase: audio filter assembly (`src/operations/audio.ts`)

**Before:** (current — ~137-line monolithic function)
```typescript
function buildAudioFilters(state: AudioState, fadeOutStart?: number): string[] {
  const filters: string[] = [];

  if (state.highpassFreq !== undefined) {
    filters.push(buildFilter("highpass", { f: state.highpassFreq }));
  }
  if (state.lowpassFreq !== undefined) {
    filters.push(buildFilter("lowpass", { f: state.lowpassFreq }));
  }
  if (state.gateConfig !== undefined) { /* 8 lines */ }
  if (state.denoiseConfig !== undefined) { /* 5 lines */ }
  if (state.deessConfig !== undefined) { /* 5 lines */ }
  for (const eq of state.eqConfigs) { /* 5 lines */ }
  if (state.bassConfig !== undefined) { /* 5 lines */ }
  if (state.trebleConfig !== undefined) { /* 5 lines */ }
  if (state.compressConfig !== undefined) { /* 12 lines */ }
  if (state.limitConfig !== undefined) { /* 5 lines */ }
  if (state.normalizeConfig !== undefined) { /* 10 lines */ }
  if (state.tempoFactor !== undefined) { /* 5 lines */ }
  if (state.pitchSemitones !== undefined) { /* 5 lines */ }
  if (state.fadeInConfig !== undefined) { /* 5 lines */ }
  if (state.fadeOutConfig !== undefined) { /* 5 lines */ }
  if (state.echoConfig !== undefined) { /* 8 lines */ }
  if (state.resampleConfig !== undefined) { /* 5 lines */ }
  return filters;
}
```

**After:**
```typescript
function buildAudioFilters(state: AudioState, fadeOutStart?: number): string[] {
  return [
    ...buildFrequencyFilters(state),
    ...buildDynamicsFilters(state),
    ...buildEqualizerFilters(state),
    ...buildTimeFilters(state, fadeOutStart),
    ...buildEffectFilters(state),
  ];
}

function buildFrequencyFilters(state: AudioState): string[] {
  const filters: string[] = [];
  if (state.highpassFreq !== undefined) filters.push(buildFilter("highpass", { f: state.highpassFreq }));
  if (state.lowpassFreq !== undefined) filters.push(buildFilter("lowpass", { f: state.lowpassFreq }));
  return filters;
}
// ... etc.
```

### Synthetic example: request handler

**Before:**
```typescript
function handleUpload(req: Request) {
  // validate (10 lines)
  // parse file (15 lines)
  // resize image (20 lines)
  // save to storage (10 lines)
  // update database (10 lines)
  // send notification (10 lines)
  // return response (5 lines)
}
```

**After:**
```typescript
function handleUpload(req: Request) {
  const file = validateAndParse(req);
  const resized = resizeImage(file);
  const record = saveToStorage(resized);
  await updateDatabase(record);
  await notifyUpload(record);
  return formatResponse(record);
}
```

## Exceptions

- A long function that is a flat sequence of independent steps (like filter assembly) may be
  acceptable if each step is 1-3 lines and the function reads like a checklist
- Don't extract single-use helpers just to shrink a function — the helper must have a clear name
  and represent a meaningful unit of work

## Scope

- Applies to: functions over ~40 lines with multiple distinct responsibilities
- Does NOT apply to: long but flat switch/case statements, data-driven config objects

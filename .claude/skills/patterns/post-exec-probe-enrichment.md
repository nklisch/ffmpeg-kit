# Pattern: Post-Execution Result Enrichment via Probing

After FFmpeg completes, operations call `probeOutput()` to get file metadata, then combine it with operation-specific data (dimensions, codec, stream info) to build the typed result object.

## Rationale
FFmpeg doesn't always report the final output properties reliably. Probing the output file after execution guarantees accurate metadata and enables strongly-typed result objects.

## Examples

### Example 1: probeOutput helper
**File**: `src/util/builder-helpers.ts:54-59`
```typescript
export async function probeOutput(outputPath: string): Promise<BaseProbeInfo> {
  const fileStat = statSync(outputPath);
  const probeResult = await probe(outputPath, { noCache: true });
  const duration = probeResult.format.duration ?? 0;
  return { outputPath, sizeBytes: fileStat.size, duration, probeResult };
}
```

### Example 2: ExtractBuilder enriching result
**File**: `src/operations/extract.ts:153-179`
```typescript
async execute(options?: ExecuteOptions): Promise<ExtractResult> {
  validateExtractState(state);
  const args = buildArgs(state);
  await runFFmpeg(args, options);

  const { outputPath, sizeBytes, probeResult } = await probeOutput(state.outputPath);
  const videoStream = probeResult.streams.find((s) => s.type === "video");
  return {
    outputPath,
    sizeBytes,
    width: videoStream?.width,
    height: videoStream?.height,
    format: probeResult.format.formatName,
  };
},
```

### Example 3: AudioBuilder with stderr parsing + probe
**File**: `src/operations/audio.ts:707-776`
```typescript
async execute(options?: ExecuteOptions): Promise<AudioResult> {
  validateAudioState(state);
  const { stderr } = await runFFmpeg(args, options);

  const { outputPath, sizeBytes, duration, probeResult } = await probeOutput(state.outputPath!);
  const audioStream = getAudioStream(probeResult);
  const silenceRanges = state.detectSilenceConfig ? parseSilenceRanges(stderr) : undefined;
  const loudness = state.normalizeConfig?.twoPass ? parseLoudnormJson(stderr) : undefined;

  return {
    outputPath,
    sizeBytes,
    duration,
    codec: audioStream?.codec,
    sampleRate: audioStream?.sampleRate,
    channels: audioStream?.channels,
    silenceRanges,
    loudness,
  };
},
```

### Example 4: TransformBuilder extracting dimensions
**File**: `src/operations/transform.ts:541-599`
```typescript
const { outputPath, sizeBytes, duration, probeResult } = await probeOutput(state.outputPath!);
const videoStream = probeResult.streams.find((s) => s.type === "video");
return {
  outputPath,
  sizeBytes,
  duration,
  width: videoStream?.width,
  height: videoStream?.height,
};
```

## When to Use
- Every operation that produces an output file must call `probeOutput()` to populate result fields
- Parse stderr for additional metrics (silence ranges, loudness) when FFmpeg writes them there

## When NOT to Use
- Don't probe input files during `execute()` unless required (e.g., percentage timestamps); prefer probing output only

## Common Violations
- Returning `{ outputPath }` without size/duration — callers expect `BaseProbeInfo` fields
- Using `statSync` alone without `probe()` — misses codec, duration, stream info
- Caching probe results for output files — always use `{ noCache: true }` after writing

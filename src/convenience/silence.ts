import { extname, join } from "node:path";
import { audio } from "../operations/audio/audio.ts";
import { transform } from "../operations/video/transform.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { SilenceRange, SplitSegment } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";

export interface TrimSilenceOptions {
  input: string;
  output: string;
  /** Silence threshold in dB (default: -40) */
  threshold?: number;
  /** Keep this much silence at edges in seconds (default: 0.1) */
  padding?: number;
}

export interface SplitOnSilenceOptions {
  input: string;
  /** Output directory for segments */
  outputDir: string;
  /** Silence threshold in dB (default: -40) */
  threshold?: number;
  /** Minimum silence duration for a split point (default: 0.5) */
  minSilence?: number;
  /** Minimum segment duration in seconds (default: 1.0) */
  minSegment?: number;
}

export async function detectSilence(
  deps: BuilderDeps,
  input: string,
  options?: { threshold?: number; minDuration?: number },
  executeOptions?: ExecuteOptions,
): Promise<SilenceRange[]> {
  const result = await audio(deps)
    .input(input)
    .detectSilence({
      threshold: options?.threshold ?? -50,
      duration: options?.minDuration ?? 0.5,
    })
    .execute(executeOptions);
  return result.silenceRanges ?? [];
}

export async function trimSilence(
  deps: BuilderDeps,
  options: TrimSilenceOptions,
  executeOptions?: ExecuteOptions,
): Promise<{ outputPath: string; duration: number; sizeBytes: number }> {
  const { input, output, threshold = -40, padding = 0.1 } = options;

  const [silences, inputProbe] = await Promise.all([
    detectSilence(deps, input, { threshold }, executeOptions),
    deps.probe(input),
  ]);
  const totalDuration = inputProbe.format.duration ?? 0;

  let trimStart = 0;
  let trimEnd = totalDuration;

  // If first silence starts at 0, skip past it
  const firstSilence = silences[0];
  if (firstSilence !== undefined && firstSilence.start <= 0.01) {
    trimStart = Math.max(0, firstSilence.end - padding);
  }

  // If last silence extends to the end, cut before it
  if (silences.length > 0) {
    const last = silences[silences.length - 1]!;
    if (last.end >= totalDuration - 0.1) {
      trimEnd = Math.min(totalDuration, last.start + padding);
    }
  }

  const result = await transform(deps)
    .input(input)
    .trimStart(trimStart)
    .trimEnd(trimEnd)
    .output(output)
    .execute(executeOptions);

  return { outputPath: result.outputPath, duration: result.duration, sizeBytes: result.sizeBytes };
}

export async function splitOnSilence(
  deps: BuilderDeps,
  options: SplitOnSilenceOptions,
  executeOptions?: ExecuteOptions,
): Promise<SplitSegment[]> {
  const { input, outputDir, threshold = -40, minSilence = 0.5, minSegment = 1.0 } = options;

  const [silences, inputProbe] = await Promise.all([
    detectSilence(deps, input, { threshold, minDuration: minSilence }, executeOptions),
    deps.probe(input),
  ]);
  const totalDuration = inputProbe.format.duration ?? 0;

  // Compute segment boundaries using midpoint of each silence as split point
  const splitPoints: number[] = [0];
  for (const silence of silences) {
    const mid = (silence.start + silence.end) / 2;
    splitPoints.push(mid);
  }
  splitPoints.push(totalDuration);

  // Build segment ranges
  const segments: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const start = splitPoints[i]!;
    const end = splitPoints[i + 1]!;
    if (end - start >= minSegment) {
      segments.push({ start, end });
    }
  }

  const ext = extname(input) || ".wav";
  const results: SplitSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const padded = String(i + 1).padStart(3, "0");
    const segPath = join(outputDir, `segment_${padded}${ext}`);
    const segDuration = seg.end - seg.start;

    await transform(deps)
      .input(input)
      .trimStart(seg.start)
      .duration(segDuration)
      .output(segPath)
      .execute(executeOptions);

    results.push({ path: segPath, start: seg.start, end: seg.end, duration: segDuration });
  }

  return results;
}

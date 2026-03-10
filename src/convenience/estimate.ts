import { getPreset } from "../encoding/presets.ts";
import type { ExportPreset } from "../types/codecs.ts";
import type { EstimateResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";

export interface EstimateOptions {
  input: string;
  /** Use preset to determine bitrate */
  preset?: ExportPreset;
  /** Explicit video bitrate (e.g., '5M') */
  videoBitrate?: string;
  /** Explicit audio bitrate (e.g., '192k') */
  audioBitrate?: string;
  /** Override duration (seconds) */
  duration?: number;
}

/** Parse bitrate string like '5M', '192k', '10000' to bits/second */
export function parseBitrate(value: string): number {
  const trimmed = value.trim().toUpperCase();
  if (trimmed.endsWith("M")) {
    return parseFloat(trimmed) * 1_000_000;
  }
  if (trimmed.endsWith("K")) {
    return parseFloat(trimmed) * 1_000;
  }
  return parseInt(trimmed, 10);
}

/** Format bytes to a human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

export async function estimateSize(deps: BuilderDeps, options: EstimateOptions): Promise<EstimateResult> {
  const { input, preset, videoBitrate, audioBitrate, duration: durationOverride } = options;

  let duration: number;
  if (durationOverride !== undefined) {
    duration = durationOverride;
  } else {
    const probeResult = await deps.probe(input);
    duration = probeResult.format.duration ?? 0;
  }

  let videoBps: number | undefined;
  let audioBps: number | undefined;
  let confidence: "high" | "medium" | "low" = "medium";

  // Determine video bitrate
  if (videoBitrate !== undefined) {
    videoBps = parseBitrate(videoBitrate);
    confidence = "high";
  } else if (preset !== undefined) {
    const presetConfig = getPreset(preset);
    if (presetConfig?.video.videoBitrate !== undefined) {
      videoBps = parseBitrate(presetConfig.video.videoBitrate);
      confidence = "high";
    } else if (presetConfig?.video.crf !== undefined) {
      // CRF-based — low confidence, rough estimate at 4 Mbps for CRF 23
      const crf = presetConfig.video.crf;
      videoBps = Math.round(8_000_000 * 0.9 ** (crf - 18));
      confidence = "low";
    }
  }

  // Determine audio bitrate
  if (audioBitrate !== undefined) {
    audioBps = parseBitrate(audioBitrate);
  } else if (preset !== undefined) {
    const presetConfig = getPreset(preset);
    if (presetConfig?.audio.bitrate !== undefined) {
      audioBps = parseBitrate(presetConfig.audio.bitrate);
    }
  }

  // Defaults if still not determined
  if (videoBps === undefined) videoBps = 5_000_000;
  if (audioBps === undefined) audioBps = 128_000;

  const totalBps = videoBps + audioBps;
  const bytes = Math.round((totalBps * duration) / 8);

  return { bytes, formatted: formatBytes(bytes), confidence };
}

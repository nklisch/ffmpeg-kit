import { copyFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { exportVideo } from "../operations/export.ts";
import type { HwAccelMode, PixelFormat } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { ProbeResult } from "../types/probe.ts";
import type { BuilderDeps } from "../types/sdk.ts";

interface NormalizeTarget {
  width: number;
  height: number;
  fps: number;
  pixelFormat?: PixelFormat;
  audioSampleRate?: number;
  audioChannels?: number;
}

export interface NormalizeMediaOptions {
  inputs: string[];
  outputDir: string;
  target: NormalizeTarget;
  /** Skip re-encoding if input already matches target (default: true) */
  skipIfMatching?: boolean;
  hwAccel?: HwAccelMode;
}

export interface NormalizeMediaResult {
  outputs: Array<{
    inputPath: string;
    outputPath: string;
    action: "transcoded" | "copied" | "skipped";
    sizeBytes: number;
  }>;
}

function inputMatchesTarget(probeResult: ProbeResult, target: NormalizeTarget): boolean {
  const video = probeResult.streams.find((s) => s.type === "video");
  if (!video || video.type !== "video") return false;

  if (video.width !== target.width || video.height !== target.height) return false;

  const fps = video.avgFrameRate || video.frameRate;
  if (Math.abs(fps - target.fps) > 0.01) return false;

  if (target.pixelFormat !== undefined && video.pixelFormat !== target.pixelFormat) return false;

  const audio = probeResult.streams.find((s) => s.type === "audio");
  if (audio && audio.type === "audio") {
    if (target.audioSampleRate !== undefined && audio.sampleRate !== target.audioSampleRate) {
      return false;
    }
    if (target.audioChannels !== undefined && audio.channels !== target.audioChannels) {
      return false;
    }
  }

  return true;
}

export async function normalizeMedia(
  deps: BuilderDeps,
  options: NormalizeMediaOptions,
  executeOptions?: ExecuteOptions,
): Promise<NormalizeMediaResult> {
  const { inputs, outputDir, target, skipIfMatching = true, hwAccel } = options;

  const outputs: NormalizeMediaResult["outputs"] = [];

  for (const inputPath of inputs) {
    const outputPath = join(outputDir, basename(inputPath));
    const probeResult = await deps.probe(inputPath);

    if (skipIfMatching && inputMatchesTarget(probeResult, target)) {
      copyFileSync(inputPath, outputPath);
      const sizeBytes = statSync(outputPath).size;
      outputs.push({ inputPath, outputPath, action: "copied", sizeBytes });
      continue;
    }

    const vfParts = [`scale=${target.width}:${target.height}`, `fps=${target.fps}`];
    if (target.pixelFormat !== undefined) {
      vfParts.push(`format=${target.pixelFormat}`);
    }

    const builder = exportVideo(deps)
      .input(inputPath)
      .outputArgs(["-vf", vfParts.join(",")]);
    if (target.audioSampleRate !== undefined) {
      builder.audioSampleRate(target.audioSampleRate);
    }
    if (target.audioChannels !== undefined) {
      builder.audioChannels(target.audioChannels);
    }
    if (hwAccel !== undefined) {
      builder.hwAccel(hwAccel);
    }

    const result = await builder.output(outputPath).execute(executeOptions);
    outputs.push({ inputPath, outputPath, action: "transcoded", sizeBytes: result.sizeBytes });
  }

  return { outputs };
}

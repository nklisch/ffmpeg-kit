import { readFileSync } from "node:fs";
import type { ExecuteOptions } from "../types/options.ts";
import type { WaveformResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";
import { createTempFile } from "../util/tempfile.ts";

export interface WaveformOptions {
  input: string;
  /** Samples per second (e.g., 30 for video fps match) */
  samplesPerSecond: number;
  /** Channel handling */
  channels?: "mono" | "stereo" | "all";
  /** Data format */
  format?: "peaks" | "rms" | "raw";
}

export async function waveform(
  deps: BuilderDeps,
  options: WaveformOptions,
  executeOptions?: ExecuteOptions,
): Promise<WaveformResult> {
  const { input, samplesPerSecond, channels = "mono", format = "peaks" } = options;

  const probeResult = await deps.probe(input);
  const duration = probeResult.format.duration ?? 0;
  const tempFile = createTempFile({ suffix: ".raw" }, deps.tempDir);

  try {
    const channelCount = channels === "stereo" ? 2 : 1;

    const args = [
      "-y",
      "-i",
      input,
      "-ac",
      String(channelCount),
      "-ar",
      String(samplesPerSecond),
      "-f",
      "f32le",
      "-c:a",
      "pcm_f32le",
      tempFile.path,
    ];

    await deps.execute(args, executeOptions);

    const buffer = readFileSync(tempFile.path);
    const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);

    let data: Float32Array;
    if (format === "peaks") {
      data = new Float32Array(floatArray.length);
      for (let i = 0; i < floatArray.length; i++) {
        data[i] = Math.abs(floatArray[i]!);
      }
    } else if (format === "rms") {
      // Group samples into windows (use windowSize = 1 at this already-downsampled rate)
      data = new Float32Array(floatArray.length);
      for (let i = 0; i < floatArray.length; i++) {
        const v = floatArray[i]!;
        data[i] = Math.sqrt(v * v);
      }
    } else {
      // raw
      data = new Float32Array(floatArray);
    }

    return { sampleRate: samplesPerSecond, data, duration };
  } finally {
    tempFile.cleanup();
  }
}

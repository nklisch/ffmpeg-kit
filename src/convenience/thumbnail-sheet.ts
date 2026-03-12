import { statSync } from "node:fs";
import type { ExecuteOptions } from "../types/options.ts";
import type { ThumbnailSheetResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";

export interface ThumbnailSheetOptions {
  input: string;
  /** Number of columns in the grid */
  columns: number;
  /** Number of rows in the grid */
  rows: number;
  /** Width of each individual thumbnail in pixels */
  width: number;
  /** How to select timestamps */
  timestamps: "uniform" | "scene" | number[];
  output: string;
}

export async function thumbnailSheet(
  deps: BuilderDeps,
  options: ThumbnailSheetOptions,
  executeOptions?: ExecuteOptions,
): Promise<ThumbnailSheetResult> {
  const { input, columns, rows, width, timestamps: tsOption, output } = options;
  const totalFrames = columns * rows;

  const probeResult = await deps.probe(input);
  const videoStream = probeResult.streams.find((s) => s.type === "video");
  const duration = probeResult.format.duration ?? 0;

  let timestamps: number[];
  let filterStr: string;

  if (tsOption === "scene") {
    // Use select='gt(scene,0.3)' + tile in one pass
    filterStr = `select='gt(scene,0.3)',scale=${width}:-2,tile=${columns}x${rows}`;
    // Generate timestamps as uniform for the result (scene detection doesn't produce predictable ones)
    timestamps = Array.from(
      { length: totalFrames },
      (_, i) => ((i + 0.5) * duration) / totalFrames,
    );
  } else {
    if (tsOption === "uniform") {
      timestamps = Array.from(
        { length: totalFrames },
        (_, i) => ((i + 0.5) * duration) / totalFrames,
      );
    } else {
      if (tsOption.length !== totalFrames) {
        throw new Error(
          `timestamps array length (${tsOption.length}) must equal columns × rows (${totalFrames})`,
        );
      }
      timestamps = tsOption;
    }

    // Compute frame numbers from timestamps using probe fps
    const fps =
      videoStream?.type === "video" ? videoStream.avgFrameRate || videoStream.frameRate : 25;
    const frameNums = timestamps.map((ts) => Math.round(ts * fps));
    const selectExpr = frameNums.map((n) => `eq(n,${n})`).join("+");
    filterStr = `select='${selectExpr}',scale=${width}:-2,tile=${columns}x${rows}`;
  }

  const args = ["-y", "-i", input, "-vf", filterStr, "-frames:v", "1", "-vsync", "vfr", output];

  await deps.execute(args, executeOptions);

  // Probe output for dimensions
  const outProbe = await deps.probe(output, { noCache: true });
  const outVideo = outProbe.streams.find((s) => s.type === "video");
  const fileStat = statSync(output);

  return {
    outputPath: output,
    width: outVideo?.type === "video" ? outVideo.width : columns * width,
    height: outVideo?.type === "video" ? outVideo.height : rows * Math.round((width * 9) / 16),
    timestamps,
    sizeBytes: fileStat.size,
  };
}

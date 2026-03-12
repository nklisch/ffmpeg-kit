import { expect, it } from "vitest";
import { probe } from "../../src/core/probe.ts";
import { createFFmpeg } from "../../src/sdk.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, tmp } from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("thumbnailSheet", () => {
  it("generates image with correct grid dimensions (uniform)", async () => {
    const output = tmp("thumbnail-sheet.jpg");
    const columns = 3;
    const rows = 2;
    const thumbWidth = 160;

    const result = await ffmpeg.thumbnailSheet({
      input: FIXTURES.videoH264,
      columns,
      rows,
      width: thumbWidth,
      timestamps: "uniform",
      output,
    });

    expectFileExists(output);
    expect(result.timestamps).toHaveLength(columns * rows);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const outProbe = await probe(output);
    const videoStream = outProbe.streams.find((s) => s.type === "video");
    expect(videoStream).toBeDefined();
    if (videoStream?.type === "video") {
      expect(videoStream.width).toBe(thumbWidth * columns);
    }
  });

  it("uniform timestamps produces evenly spaced frames", async () => {
    const output = tmp("thumbnail-uniform.jpg");
    const columns = 2;
    const rows = 2;

    const result = await ffmpeg.thumbnailSheet({
      input: FIXTURES.videoH264,
      columns,
      rows,
      width: 160,
      timestamps: "uniform",
      output,
    });

    expect(result.timestamps).toHaveLength(4);
    // Timestamps should be roughly evenly spaced
    const diffs = result.timestamps.slice(1).map((t, i) => t - result.timestamps[i]!);
    const firstDiff = diffs[0]!;
    for (const diff of diffs) {
      expect(Math.abs(diff - firstDiff)).toBeLessThan(0.5);
    }
  });

  it("custom timestamps mode uses provided timestamps", async () => {
    const output = tmp("thumbnail-custom.jpg");
    const customTimestamps = [1, 2, 3, 4];

    const result = await ffmpeg.thumbnailSheet({
      input: FIXTURES.videoH264,
      columns: 2,
      rows: 2,
      width: 160,
      timestamps: customTimestamps,
      output,
    });

    expectFileExists(output);
    expect(result.timestamps).toEqual(customTimestamps);
  });
});

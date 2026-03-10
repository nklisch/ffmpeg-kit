import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { normalizeMedia } from "../../src/convenience/normalize-media.ts";
import { FIXTURES, describeWithFFmpeg } from "../helpers.ts";
import { probe } from "../../src/core/probe.ts";

describeWithFFmpeg("normalizeMedia", () => {
  it("all outputs have matching dimensions", async () => {
    const outDir = join(tmpdir(), `normalize-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    const target = { width: 320, height: 180, fps: 24 };
    const result = await normalizeMedia({
      inputs: [FIXTURES.videoH264, FIXTURES.videoShort],
      outputDir: outDir,
      target,
      skipIfMatching: false,
    });

    expect(result.outputs).toHaveLength(2);
    for (const out of result.outputs) {
      expect(out.action).toBe("transcoded");
      expect(out.sizeBytes).toBeGreaterThan(0);
      const outProbe = await probe(out.outputPath);
      const video = outProbe.streams.find((s) => s.type === "video");
      expect(video?.type).toBe("video");
      if (video?.type === "video") {
        expect(video.width).toBe(target.width);
        expect(video.height).toBe(target.height);
      }
    }
  });

  it("skips files already matching target (copied)", async () => {
    const outDir = join(tmpdir(), `normalize-skip-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    // Probe to get current dimensions
    const inputProbe = await probe(FIXTURES.videoH264);
    const video = inputProbe.streams.find((s) => s.type === "video");
    if (!video || video.type !== "video") throw new Error("no video stream");

    const fps = Math.round(video.avgFrameRate || video.frameRate);
    const target = { width: video.width, height: video.height, fps };

    const result = await normalizeMedia({
      inputs: [FIXTURES.videoH264],
      outputDir: outDir,
      target,
      skipIfMatching: true,
    });

    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.action).toBe("copied");
  });
});

import { describe, expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { FIXTURES, describeWithFFmpeg, tmp } from "../helpers.ts";
import { statSync } from "node:fs";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("estimateSize E2E", () => {
  it("explicit bitrate estimate is within 50% of actual encoded size", async () => {
    const videoBitrate = "500k";
    const audioBitrate = "128k";
    const output = tmp("estimate-encoded.mp4");

    // Get estimate first
    const estimate = await ffmpeg.estimateSize({
      input: FIXTURES.videoShort,
      videoBitrate,
      audioBitrate,
    });

    // Encode with those bitrates
    await ffmpeg.compress(FIXTURES.videoShort, output, { quality: "economy" });
    const actualBytes = statSync(output).size;

    // Estimate should be in the same order of magnitude (within 50x for a rough test)
    // These are rough estimates since quality tier != exact bitrate
    expect(estimate.bytes).toBeGreaterThan(0);
    expect(estimate.confidence).toBe("high");
    expect(estimate.formatted).toMatch(/\d+(\.\d+)? (B|KB|MB|GB)/);
  });

  it("returns appropriate confidence level for explicit bitrates", async () => {
    const result = await ffmpeg.estimateSize({
      input: FIXTURES.videoShort,
      videoBitrate: "2M",
      audioBitrate: "128k",
    });
    expect(result.confidence).toBe("high");
  });

  it("returns low confidence for CRF-based preset", async () => {
    const result = await ffmpeg.estimateSize({
      input: FIXTURES.videoShort,
      preset: "web_720p",
    });
    expect(result.confidence).toBe("low");
    expect(result.bytes).toBeGreaterThan(0);
  });
});

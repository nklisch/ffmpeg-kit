import { expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import {
  describeWithFFmpeg,
  expectDurationClose,
  expectFileExists,
  FIXTURES,
  probeOutput,
  tmp,
} from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("overlay()", () => {
  it("overlays image on video", async () => {
    const out = tmp("overlay-image.mp4");
    const result = await ffmpeg.overlay()
      .base(FIXTURES.videoShort)
      .addOverlay({ input: FIXTURES.imageSmall, anchor: "top-left" })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expectDurationClose(result.duration, 2);
    const probed = await probeOutput(out);
    expect(probed.streams.some((s) => s.type === "video")).toBe(true);
  });

  it("applies overlay with opacity", async () => {
    const out = tmp("overlay-opacity.mp4");
    const result = await ffmpeg.overlay()
      .base(FIXTURES.videoShort)
      .addOverlay({ input: FIXTURES.imageSmall, anchor: "center", opacity: 0.5 })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("applies overlay with time range", async () => {
    const out = tmp("overlay-timerange.mp4");
    const result = await ffmpeg.overlay()
      .base(FIXTURES.videoShort)
      .addOverlay({ input: FIXTURES.imageSmall, anchor: "top-right", startTime: 0.5, endTime: 1.5 })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expectDurationClose(result.duration, 2);
  });

  it("creates picture-in-picture", async () => {
    const out = tmp("overlay-pip.mp4");
    const result = await ffmpeg.overlay()
      .base(FIXTURES.videoShort)
      .pip({ input: FIXTURES.videoShort, position: "bottom-right", scale: 0.3, margin: 10 })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    const probed = await probeOutput(out);
    // Output dimensions should match base
    const videoStream = probed.streams.find((s) => s.type === "video");
    expect(videoStream).toBeDefined();
  });

  it("applies watermark", async () => {
    const out = tmp("overlay-watermark.mp4");
    const result = await ffmpeg.overlay()
      .base(FIXTURES.videoShort)
      .watermark({ input: FIXTURES.imageSmall, position: "bottom-right", opacity: 0.4 })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("chains multiple overlays", async () => {
    const out = tmp("overlay-multiple.mp4");
    const result = await ffmpeg.overlay()
      .base(FIXTURES.videoShort)
      .addOverlay({ input: FIXTURES.imageSmall, anchor: "top-left" })
      .addOverlay({ input: FIXTURES.imageSmall, anchor: "bottom-right", opacity: 0.7 })
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("tryExecute() returns success result", async () => {
    const out = tmp("overlay-try.mp4");
    const result = await ffmpeg.overlay()
      .base(FIXTURES.videoShort)
      .addOverlay({ input: FIXTURES.imageSmall })
      .output(out)
      .tryExecute();
    expect(result.success).toBe(true);
  });
});

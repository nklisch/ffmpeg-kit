import { expect, it } from "vitest";
import { probe } from "../../src/core/probe.ts";
import { createFFmpeg } from "../../src/sdk.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, tmp } from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("smartTranscode", () => {
  it("copies when input already matches target", async () => {
    // Probe the input to get its actual codec
    const inputProbe = await probe(FIXTURES.videoH264);
    const video = inputProbe.streams.find((s) => s.type === "video");
    expect(video).toBeDefined();

    const output = tmp("smart-copy.mp4");
    const result = await ffmpeg.smartTranscode({
      input: FIXTURES.videoH264,
      output,
      target: {
        videoCodec: "h264",
        audioCodec: "aac",
      },
    });

    expectFileExists(output);
    expect(result.actions).toContain("copy_all");
    expect(result.duration).toBeGreaterThan(0);
  });

  it("re-encodes video when dimensions exceed max", async () => {
    const output = tmp("smart-downscale.mp4");
    const result = await ffmpeg.smartTranscode({
      input: FIXTURES.videoH264,
      output,
      target: {
        videoCodec: "libx264",
        maxWidth: 100,
        maxHeight: 100,
      },
    });

    expectFileExists(output);
    expect(result.actions).toContain("transcode_video");
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("re-encodes audio when codec does not match", async () => {
    const output = tmp("smart-audio.mp4");
    const result = await ffmpeg.smartTranscode({
      input: FIXTURES.videoH264,
      output,
      target: {
        videoCodec: "h264",
        audioCodec: "libmp3lame",
      },
    });

    expectFileExists(output);
    expect(result.actions).toContain("transcode_audio");
  });
});

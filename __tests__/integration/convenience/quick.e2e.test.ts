import { expect, it } from "vitest";
import { probe } from "../../../src/core/probe.ts";
import { createFFmpeg } from "../../../src/sdk.ts";
import { describeWithFFmpeg, expectCodec, expectFileExists, FIXTURES, tmp } from "../../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("remux", () => {
  it("changes container without re-encoding", async () => {
    const output = tmp("remux-out.mkv");
    await ffmpeg.remux(FIXTURES.videoH264, output);
    expectFileExists(output);
    const probeResult = await probe(output);
    expectCodec(probeResult, "video", "h264");
  });
});

describeWithFFmpeg("compress", () => {
  it("produces valid output with standard quality", async () => {
    const output = tmp("compress-out.mp4");
    const result = await ffmpeg.compress(FIXTURES.videoH264, output, { quality: "economy" });
    expectFileExists(output);
    expect(result.outputPath).toBe(output);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });
});

describeWithFFmpeg("extractAudio", () => {
  it("produces audio-only output", async () => {
    const output = tmp("audio-out.aac");
    const result = await ffmpeg.extractAudio(FIXTURES.videoH264, output);
    expectFileExists(output);
    expect(result.sizeBytes).toBeGreaterThan(0);
    const probeResult = await probe(output);
    const audioStream = probeResult.streams.find((s) => s.type === "audio");
    expect(audioStream).toBeDefined();
    const videoStream = probeResult.streams.find((s) => s.type === "video");
    expect(videoStream).toBeUndefined();
  });
});

describeWithFFmpeg("imageToVideo", () => {
  it("creates video from still image", async () => {
    const output = tmp("image-video.mp4");
    const result = await ffmpeg.imageToVideo(FIXTURES.image1080p, output, { duration: 3 });
    expectFileExists(output);
    expect(result.duration).toBe(3);
    const probeResult = await probe(output);
    const videoStream = probeResult.streams.find((s) => s.type === "video");
    expect(videoStream).toBeDefined();
  });
});

describeWithFFmpeg("resize", () => {
  it("produces video with correct dimensions", async () => {
    const output = tmp("resize-out.mp4");
    const _result = await ffmpeg.resize(FIXTURES.videoH264, output, { width: 320, height: 180 });
    expectFileExists(output);
    const probeResult = await probe(output);
    const videoStream = probeResult.streams.find((s) => s.type === "video");
    expect(videoStream?.type).toBe("video");
    if (videoStream?.type === "video") {
      expect(videoStream.width).toBe(320);
    }
  });
});

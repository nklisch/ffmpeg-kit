import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { createFFmpeg } from "../../../src/sdk.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, probeOutput, tmp } from "../../helpers.ts";

const ffmpeg = createFFmpeg();

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

describeWithFFmpeg("extract()", () => {
  it("extracts frame at timestamp as PNG", async () => {
    const output = tmp("extract-frame.png");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoH264)
      .timestamp(1)
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.outputPath).toBe(output);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.sizeBytes).toBeGreaterThan(100);
  });

  it("extracts frame at percentage", async () => {
    const output = tmp("extract-pct.png");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoH264)
      .timestamp("50%")
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it("extracts with resize", async () => {
    const output = tmp("extract-resize.png");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoH264)
      .timestamp(1)
      .size({ width: 320 })
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.width).toBe(320);
    // Height should be auto-calculated from 1920x1080 = 180
    expect(result.height).toBe(180);
  });

  it("extracts as JPEG with quality", async () => {
    const output = tmp("extract-quality.jpg");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoH264)
      .timestamp(1)
      .format("jpg")
      .quality(2)
      .output(output)
      .execute();

    expectFileExists(output, 100);
    const probeResult = await probeOutput(output);
    const videoStream = probeResult.streams.find((s) => s.type === "video");
    expect(videoStream?.codec).toBe("mjpeg");
    expect(result.sizeBytes).toBeGreaterThan(100);
  });

  it("extracts as WebP", async () => {
    const output = tmp("extract-webp.webp");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoH264)
      .timestamp(1)
      .format("webp")
      .output(output)
      .execute();

    expectFileExists(output, 100);
    const probeResult = await probeOutput(output);
    const videoStream = probeResult.streams.find((s) => s.type === "video");
    expect(videoStream?.codec).toBe("webp");
    expect(result.sizeBytes).toBeGreaterThan(100);
  });

  it("extracts thumbnail via scene detection", async () => {
    const output = tmp("extract-thumbnail.png");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoH264)
      .thumbnail()
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });

  it("tryExecute returns success result on valid input", async () => {
    const output = tmp("extract-try-success.png");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoH264)
      .timestamp(1)
      .output(output)
      .tryExecute();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputPath).toBe(output);
    }
  });

  it("tryExecute returns failure on bad input", async () => {
    const output = tmp("extract-try-fail.png");
    const result = await ffmpeg
      .extract()
      .input("/nonexistent/path.mp4")
      .output(output)
      .tryExecute();

    expect(result.success).toBe(false);
  });
});

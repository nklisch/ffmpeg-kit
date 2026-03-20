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

describeWithFFmpeg(
  "image()",
  () => {
    it("converts image format (jpg → png)", async () => {
      const output = tmp("image-convert.png");
      const result = await ffmpeg
        .image()
        .input(FIXTURES.image1080p)
        .convert("png")
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.outputPath).toBe(output);
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.sizeBytes).toBeGreaterThan(100);
    });

    it("converts image format (jpg → webp)", async () => {
      const output = tmp("image-convert.webp");
      await ffmpeg.image().input(FIXTURES.image1080p).convert("webp").output(output).execute();

      expectFileExists(output);
      const probeResult = await probeOutput(output);
      const videoStream = probeResult.streams.find((s) => s.type === "video");
      expect(videoStream?.codec).toBe("webp");
    });

    it("resizes image to specified width", async () => {
      const output = tmp("image-resize.png");
      const result = await ffmpeg
        .image()
        .input(FIXTURES.image1080p)
        .resize({ width: 640 })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.width).toBe(640);
      // Height should be auto-calculated from 1920x1080 aspect ratio = 360
      expect(result.height).toBe(360);
    });

    it("creates video from still image", async () => {
      const output = tmp("image-to-video.mp4");
      const result = await ffmpeg
        .image()
        .input(FIXTURES.image1080p)
        .toVideo({ duration: 3, fps: 30 })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.sizeBytes).toBeGreaterThan(100);
      const probeResult = await probeOutput(output);
      const videoStream = probeResult.streams.find((s) => s.type === "video");
      expect(videoStream).toBeDefined();
      // Duration should be close to 3 seconds
      expect(probeResult.format.duration).toBeGreaterThan(2.5);
      expect(probeResult.format.duration).toBeLessThan(3.5);
    });

    it("generates test pattern video", async () => {
      const output = tmp("image-testpattern.mp4");
      const result = await ffmpeg
        .image()
        .testPattern({ type: "testsrc2", width: 640, height: 480, duration: 2 })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.width).toBe(640);
      expect(result.height).toBe(480);
      const probeResult = await probeOutput(output);
      expect(probeResult.format.duration).toBeGreaterThan(1.5);
    });

    it("generates solid color video", async () => {
      const output = tmp("image-solidcolor.mp4");
      const result = await ffmpeg
        .image()
        .solidColor({ color: "blue", width: 320, height: 240, duration: 1 })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.width).toBe(320);
      expect(result.height).toBe(240);
    });

    it("generates silent audio", async () => {
      const output = tmp("image-silent.aac");
      const result = await ffmpeg
        .image()
        .silentAudio({ duration: 2, sampleRate: 48000 })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.sizeBytes).toBeGreaterThan(100);
      const probeResult = await probeOutput(output);
      const audioStream = probeResult.streams.find((s) => s.type === "audio");
      expect(audioStream).toBeDefined();
      expect(probeResult.format.duration).toBeGreaterThan(1.5);
    });

    it("resize and convert compose correctly", async () => {
      const output = tmp("image-resize-convert.webp");
      const result = await ffmpeg
        .image()
        .input(FIXTURES.image1080p)
        .resize({ width: 640 })
        .convert("webp")
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.width).toBe(640);
      const probeResult = await probeOutput(output);
      const videoStream = probeResult.streams.find((s) => s.type === "video");
      expect(videoStream?.codec).toBe("webp");
    });

    it("tryExecute() returns success result", async () => {
      const output = tmp("image-try-success.png");
      const result = await ffmpeg
        .image()
        .input(FIXTURES.image1080p)
        .convert("png")
        .output(output)
        .tryExecute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.outputPath).toBe(output);
      }
    });
  },
  60000,
);

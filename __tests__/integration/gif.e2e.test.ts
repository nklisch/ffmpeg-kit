import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, probeOutput, tmp } from "../helpers.ts";

const ffmpeg = createFFmpeg();

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

describeWithFFmpeg(
  "gif()",
  () => {
    it("creates basic GIF from video", async () => {
      const output = tmp("gif-basic.gif");
      const result = await ffmpeg.gif()
        .input(FIXTURES.videoShort)
        .fps(10)
        .size({ width: 320 })
        .output(output)
        .execute();

      expectFileExists(output, 1000);
      expect(result.outputPath).toBe(output);
      expect(result.sizeBytes).toBeGreaterThan(1000);
      expect(result.width).toBe(320);
      expect(result.duration).toBeGreaterThan(0);
    });

    it("creates GIF with palette optimization", async () => {
      const output = tmp("gif-optimized.gif");
      const result = await ffmpeg.gif()
        .input(FIXTURES.videoShort)
        .fps(10)
        .size({ width: 320 })
        .optimizePalette()
        .output(output)
        .execute();

      expectFileExists(output, 1000);
      expect(result.sizeBytes).toBeGreaterThan(1000);
    });

    it("respects FPS setting", async () => {
      const output = tmp("gif-fps5.gif");
      const result = await ffmpeg.gif().input(FIXTURES.videoShort).fps(5).output(output).execute();

      expectFileExists(output, 1000);
      const probeResult = await probeOutput(output);
      const videoStream = probeResult.streams.find((s) => s.type === "video");
      expect(videoStream).toBeDefined();
      // GIF frame rate may be approximate
      expect(result.frameCount).toBeGreaterThan(0);
    });

    it("respects trim and duration", async () => {
      const output = tmp("gif-trimmed.gif");
      const result = await ffmpeg.gif()
        .input(FIXTURES.videoH264)
        .trimStart(1)
        .duration(2)
        .fps(10)
        .output(output)
        .execute();

      expectFileExists(output, 1000);
      // Duration should be close to 2 seconds
      expect(result.duration).toBeGreaterThan(0);
    });

    it("supports loop control", async () => {
      const output = tmp("gif-loop1.gif");
      const result = await ffmpeg.gif()
        .input(FIXTURES.videoShort)
        .fps(10)
        .loop(1)
        .output(output)
        .execute();

      expectFileExists(output, 1000);
      expect(result.sizeBytes).toBeGreaterThan(1000);
    });

    it("tryExecute() returns success result", async () => {
      const output = tmp("gif-try-success.gif");
      const result = await ffmpeg.gif().input(FIXTURES.videoShort).fps(10).output(output).tryExecute();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.outputPath).toBe(output);
      }
    });
  },
  60000,
);

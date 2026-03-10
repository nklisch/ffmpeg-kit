import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { subtitle } from "../../src/operations/subtitle.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, probeOutput, tmp } from "../helpers.ts";

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

describeWithFFmpeg(
  "subtitle()",
  () => {
    it("embeds soft sub SRT into MKV", async () => {
      const output = tmp("subtitle-soft.mkv");
      const result = await subtitle()
        .input(FIXTURES.videoShort)
        .softSub({ path: FIXTURES.subtitle })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.outputPath).toBe(output);
      expect(result.sizeBytes).toBeGreaterThan(100);

      // Verify subtitle stream is present
      const probeResult = await probeOutput(output);
      const subStream = probeResult.streams.find((s) => s.type === "subtitle");
      expect(subStream).toBeDefined();

      // Verify video and audio were stream-copied (not re-encoded)
      const videoStream = probeResult.streams.find((s) => s.type === "video");
      expect(videoStream?.codec).toBe("h264");
    });

    it("embeds soft sub with language and title metadata", async () => {
      const output = tmp("subtitle-soft-meta.mkv");
      const result = await subtitle()
        .input(FIXTURES.videoShort)
        .softSub({ path: FIXTURES.subtitle, language: "eng", title: "English" })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.sizeBytes).toBeGreaterThan(100);
      const probeResult = await probeOutput(output);
      const subStream = probeResult.streams.find((s) => s.type === "subtitle");
      expect(subStream).toBeDefined();
    });

    it("hard burns SRT into video", async () => {
      const output = tmp("subtitle-hardburn.mp4");
      const result = await subtitle()
        .input(FIXTURES.videoShort)
        .hardBurn({ path: FIXTURES.subtitle })
        .output(output)
        .execute();

      expectFileExists(output);
      expect(result.sizeBytes).toBeGreaterThan(100);

      // No subtitle stream in output (burned in)
      const probeResult = await probeOutput(output);
      const subStream = probeResult.streams.find((s) => s.type === "subtitle");
      expect(subStream).toBeUndefined();

      // Video was re-encoded
      const videoStream = probeResult.streams.find((s) => s.type === "video");
      expect(videoStream?.codec).toBe("h264");
    });

    it("extracts subtitle stream from MKV with subtitles", async () => {
      // First embed a subtitle
      const mkvWithSub = tmp("subtitle-with-sub.mkv");
      await subtitle()
        .input(FIXTURES.videoShort)
        .softSub({ path: FIXTURES.subtitle })
        .output(mkvWithSub)
        .execute();

      // Now extract subtitle stream (stream index 2 = third stream = subtitle)
      const probeResult = await probeOutput(mkvWithSub);
      const subStream = probeResult.streams.find((s) => s.type === "subtitle");
      expect(subStream).toBeDefined();

      const extractedSrt = tmp("subtitle-extracted.srt");
      const result = await subtitle()
        .input(mkvWithSub)
        .extract({ streamIndex: subStream!.index, format: "srt" })
        .output(extractedSrt)
        .execute();

      expectFileExists(extractedSrt, 10);
      expect(result.sizeBytes).toBeGreaterThan(10);
    });

    it("tryExecute() returns success result", async () => {
      const output = tmp("subtitle-try-success.mkv");
      const result = await subtitle()
        .input(FIXTURES.videoShort)
        .softSub({ path: FIXTURES.subtitle })
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

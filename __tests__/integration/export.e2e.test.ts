import { describe, expect, it } from "vitest";
import { exportVideo } from "../../src/operations/export.ts";
import {
  describeWithFFmpeg,
  expectCodec,
  expectDurationClose,
  expectFileExists,
  FIXTURES,
  probeOutput,
  tmp,
} from "../helpers.ts";

describeWithFFmpeg("exportVideo()", () => {
  it("exports with youtube_hd preset", async () => {
    const out = tmp("export-youtube-hd.mp4");
    const result = await exportVideo()
      .input(FIXTURES.videoShort)
      .preset("youtube_hd")
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.videoCodec).toBe("h264");
    expect(result.audioCodec).toBe("aac");
    expect(result.sizeBytes).toBeGreaterThan(0);
    expectDurationClose(result.duration, 2);

    const probed = await probeOutput(out);
    expectCodec(probed, "video", "h264");
    expectCodec(probed, "audio", "aac");
  });

  it("exports with youtube_draft preset", async () => {
    const out = tmp("export-youtube-draft.mp4");
    const result = await exportVideo()
      .input(FIXTURES.videoShort)
      .preset("youtube_draft")
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.videoCodec).toBe("h264");
  });

  it("exports with separate video + audio inputs", async () => {
    const out = tmp("export-separate-inputs.mp4");
    const result = await exportVideo()
      .videoInput(FIXTURES.videoNoAudio)
      .audioInput(FIXTURES.audioSpeech)
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    const probed = await probeOutput(out);
    expect(probed.streams.some((s) => s.type === "video")).toBe(true);
    expect(probed.streams.some((s) => s.type === "audio")).toBe(true);
  });

  it("exports with custom CRF (lower CRF = larger file)", async () => {
    const out18 = tmp("export-crf18.mp4");
    const out28 = tmp("export-crf28.mp4");

    await exportVideo().input(FIXTURES.videoShort).crf(18).output(out18).execute();
    await exportVideo().input(FIXTURES.videoShort).crf(28).output(out28).execute();

    const { statSync } = await import("node:fs");
    const size18 = statSync(out18).size;
    const size28 = statSync(out28).size;
    expect(size18).toBeGreaterThan(size28);
  });

  it("exports as MKV format", async () => {
    const out = tmp("export-mkv.mkv");
    const result = await exportVideo()
      .input(FIXTURES.videoShort)
      .format("mkv")
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    const probed = await probeOutput(out);
    expect(probed.format.formatName).toContain("matroska");
  });

  it("applies faststart for mp4", async () => {
    const out = tmp("export-faststart.mp4");
    await exportVideo().input(FIXTURES.videoShort).faststart(true).output(out).execute();

    expectFileExists(out);
    const probed = await probeOutput(out);
    // moov atom is at the start — just verify the file is valid
    expect(probed.format.duration).toBeGreaterThan(0);
  });

  it("writes metadata tags", async () => {
    const out = tmp("export-metadata.mp4");
    await exportVideo()
      .input(FIXTURES.videoShort)
      .metadata({ title: "Test Video", artist: "Test Artist" })
      .output(out)
      .execute();

    expectFileExists(out);
    const probed = await probeOutput(out);
    expect(probed.format.tags?.title).toBe("Test Video");
  });

  it("maps specific streams", async () => {
    const out = tmp("export-mapped.mp4");
    await exportVideo().input(FIXTURES.videoShort).map(["0:v:0", "0:a:0"]).output(out).execute();

    expectFileExists(out);
    const probed = await probeOutput(out);
    expect(probed.streams.some((s) => s.type === "video")).toBe(true);
    expect(probed.streams.some((s) => s.type === "audio")).toBe(true);
  });

  it("exports with outputArgs", async () => {
    const out = tmp("export-output-args.mp4");
    await exportVideo().input(FIXTURES.videoShort).outputArgs(["-t", "1"]).output(out).execute();

    expectFileExists(out);
    const probed = await probeOutput(out);
    // With -t 1 output should be ~1 second
    expectDurationClose(probed.format.duration ?? 0, 1, 0.5);
  });

  it("performs two-pass encoding", async () => {
    const out = tmp("export-twopass.mp4");
    const result = await exportVideo()
      .input(FIXTURES.videoShort)
      .videoBitrate("1M")
      .twoPass()
      .output(out)
      .execute();

    expectFileExists(result.outputPath);
    expect(result.sizeBytes).toBeGreaterThan(0);
    const probed = await probeOutput(out);
    expectCodec(probed, "video", "h264");
  }, 60000);

  describe("tryExecute()", () => {
    it("returns success result on valid input", async () => {
      const out = tmp("export-try-success.mp4");
      const result = await exportVideo().input(FIXTURES.videoShort).output(out).tryExecute();
      expect(result.success).toBe(true);
      if (result.success) {
        expectFileExists(result.data.outputPath);
      }
    });

    it("returns failure result on invalid input", async () => {
      const result = await exportVideo()
        .input("nonexistent-file.mp4")
        .output(tmp("export-try-fail.mp4"))
        .tryExecute();
      expect(result.success).toBe(false);
    });
  });
});

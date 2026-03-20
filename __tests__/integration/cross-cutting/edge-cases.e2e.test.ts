import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { createFFmpeg } from "../../../src/sdk.ts";
import { FFmpegError, FFmpegErrorCode } from "../../../src/types/errors.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, probeOutput, tmp } from "../../helpers.ts";

const ffmpeg = createFFmpeg();

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

describeWithFFmpeg("edge cases", () => {
  // Test 1: Spaces in output file path
  it("handles spaces in output file path", async () => {
    const output = tmp("my output file.png");
    await ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output(output).execute();

    expectFileExists(output);
    const info = await probeOutput(output);
    const video = info.streams.find((s) => s.type === "video");
    expect(video).toBeDefined();
  });

  // Test 2: Unicode in output file path
  it("handles unicode in output file path", async () => {
    const output = tmp("frame-éè-日本.png");
    await ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output(output).execute();

    expectFileExists(output);
  });

  // Test 3: Very short input clip
  it("handles very short trimmed input", async () => {
    const shortClip = tmp("edge-short.mp4");
    const frame = tmp("edge-short-frame.png");

    // Create a very short clip (0.1s)
    await ffmpeg.transform().input(FIXTURES.videoShort).duration(0.1).output(shortClip).execute();

    expectFileExists(shortClip);
    const info = await probeOutput(shortClip);
    expect(info.format.duration).toBeLessThan(0.5);

    // Extract frame from the very short clip
    await ffmpeg.extract().input(shortClip).timestamp(0).output(frame).execute();

    expectFileExists(frame);
  });

  // Test 4: Timestamp beyond video duration — ffmpeg exits 0 but produces no file
  it("throws FFmpegError when timestamp is beyond video duration", async () => {
    const output = tmp("edge-beyond.png");

    await expect(
      ffmpeg.extract().input(FIXTURES.videoShort).timestamp(999).output(output).execute(),
    ).rejects.toMatchObject({
      code: FFmpegErrorCode.OUTPUT_ERROR,
    });
  });

  // Test 5: Empty/zero-byte input file
  it("throws clear error for zero-byte input file", async () => {
    const emptyFile = tmp("edge-empty.mp4");
    // Create a 0-byte file
    writeFileSync(emptyFile, "");

    await expect(ffmpeg.probe(emptyFile)).rejects.toBeInstanceOf(FFmpegError);
  });

  // Test 6: Audio extraction from video-only input (no audio stream)
  it("handles audio extraction from video without audio", async () => {
    const output = tmp("edge-no-audio.wav");

    // This should either fail gracefully or produce empty output
    try {
      await ffmpeg.audio().input(FIXTURES.videoNoAudio).extractAudio().output(output).execute();
      // If it succeeded, the file should exist
      expect(existsSync(output)).toBe(true);
    } catch (err) {
      // If it fails, should be an FFmpegError with stderr
      expect(err).toBeInstanceOf(FFmpegError);
      const ffErr = err as FFmpegError;
      expect(ffErr.stderr.length).toBeGreaterThan(0);
    }
  });

  // Test 7: Concurrent operations don't interfere
  it("runs concurrent operations independently", async () => {
    const outputs = [
      tmp("edge-concurrent-1.png"),
      tmp("edge-concurrent-2.png"),
      tmp("edge-concurrent-3.png"),
    ];

    // Run 3 extracts in parallel
    await Promise.all([
      ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0).output(outputs[0]!).execute(),
      ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output(outputs[1]!).execute(),
      ffmpeg.extract().input(FIXTURES.videoH264).timestamp(1).output(outputs[2]!).execute(),
    ]);

    // All 3 should produce valid output
    for (const output of outputs) {
      expectFileExists(output);
      const info = await probeOutput(output);
      const video = info.streams.find((s) => s.type === "video");
      expect(video).toBeDefined();
    }
  });

  // Test 8: Pre-aborted signal rejects immediately
  it("pre-aborted signal rejects immediately without hanging", async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    const start = Date.now();
    await expect(
      ffmpeg
        .exportVideo()
        .input(FIXTURES.videoH264)
        .output(tmp("edge-preabort.mp4"))
        .execute({ signal: controller.signal }),
    ).rejects.toMatchObject({
      code: FFmpegErrorCode.CANCELLED,
    });

    // Should reject quickly (not waiting for encode)
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });
});

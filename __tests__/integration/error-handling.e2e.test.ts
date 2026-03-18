import { expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { FFmpegError, FFmpegErrorCode } from "../../src/types/errors.ts";
import { describeWithFFmpeg, FIXTURES, tmp } from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("error handling", () => {
  // Test 1: Missing required builder fields throw before execution
  it("throws when required input field is missing", async () => {
    await expect(
      ffmpeg.extract().timestamp(1).output(tmp("err-no-input.png")).execute(),
    ).rejects.toThrow(/input\(\) is required/i);
  });

  // Test 2: Missing output field throws
  it("throws when required output field is missing", async () => {
    await expect(
      ffmpeg.extract().input(FIXTURES.videoShort).timestamp(1).execute(),
    ).rejects.toThrow(/output\(\) is required/i);
  });

  // Test 3: tryExecute wraps error instead of throwing
  it("tryExecute returns error result for bad input", async () => {
    const result = await ffmpeg
      .extract()
      .input("/nonexistent/video.mp4")
      .timestamp(1)
      .output(tmp("err-try.png"))
      .tryExecute();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(FFmpegError);
    }
  });

  // Test 4: tryExecute returns success data on valid operation
  it("tryExecute returns success for valid operation", async () => {
    const output = tmp("err-try-ok.png");
    const result = await ffmpeg
      .extract()
      .input(FIXTURES.videoShort)
      .timestamp(0.5)
      .output(output)
      .tryExecute();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outputPath).toBe(output);
      expect(result.data.width).toBeGreaterThan(0);
    }
  });

  // Test 5: Invalid codec name produces clear error
  it("throws FFmpegError for invalid codec name", async () => {
    try {
      await ffmpeg
        .exportVideo()
        .input(FIXTURES.videoShort)
        .videoCodec("libx264_typo" as any)
        .output(tmp("err-codec.mp4"))
        .execute();
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FFmpegError);
      const ffErr = err as FFmpegError;
      expect(ffErr.stderr.length).toBeGreaterThan(0);
      expect(ffErr.command.length).toBeGreaterThan(0);
    }
  });

  // Test 6: Concat with fewer than 2 clips throws
  it("concat throws for fewer than 2 clips", async () => {
    await expect(
      ffmpeg.concat().addClip(FIXTURES.videoShort).output(tmp("err-concat.mp4")).execute(),
    ).rejects.toThrow(/at least 2 clips/);
  });

  // Test 7: Probe on non-existent file throws INPUT_NOT_FOUND
  it("probe throws INPUT_NOT_FOUND for missing file", async () => {
    await expect(ffmpeg.probe("/nonexistent/file.mp4")).rejects.toMatchObject({
      code: FFmpegErrorCode.INPUT_NOT_FOUND,
    });
  });
});

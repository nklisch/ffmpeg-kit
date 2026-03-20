import { describe, expect, it } from "vitest";
import { validateInstallation } from "../../../src/core/validate.ts";
import { FFmpegErrorCode } from "../../../src/types/errors.ts";
import { describeWithFFmpeg } from "../../helpers.ts";

describeWithFFmpeg("validateInstallation()", () => {
  it("returns version info for ffmpeg and ffprobe", async () => {
    const info = await validateInstallation();
    expect(info.ffmpeg.path.length).toBeGreaterThan(0);
    expect(info.ffmpeg.version).toMatch(/\d+\.\d+/);
    expect(info.ffprobe.path.length).toBeGreaterThan(0);
    expect(info.ffprobe.version).toMatch(/\d+\.\d+/);
  });

  it("paths are non-empty strings", async () => {
    const info = await validateInstallation();
    expect(typeof info.ffmpeg.path).toBe("string");
    expect(typeof info.ffprobe.path).toBe("string");
    expect(info.ffmpeg.path.length).toBeGreaterThan(0);
    expect(info.ffprobe.path.length).toBeGreaterThan(0);
  });

  it("throws BINARY_NOT_FOUND for invalid ffmpeg path", async () => {
    await expect(validateInstallation({ ffmpegPath: "/nonexistent/ffmpeg" })).rejects.toMatchObject(
      {
        code: FFmpegErrorCode.BINARY_NOT_FOUND,
      },
    );
  });

  it("throws BINARY_NOT_FOUND for invalid ffprobe path", async () => {
    await expect(
      validateInstallation({ ffprobePath: "/nonexistent/ffprobe" }),
    ).rejects.toMatchObject({
      code: FFmpegErrorCode.BINARY_NOT_FOUND,
    });
  });
});

describe("validateInstallation() — no binary", () => {
  it("rejects with BINARY_NOT_FOUND when ffmpeg is not found", async () => {
    await expect(
      validateInstallation({
        ffmpegPath: "/nonexistent/ffmpeg",
        ffprobePath: "/nonexistent/ffprobe",
      }),
    ).rejects.toMatchObject({
      code: FFmpegErrorCode.BINARY_NOT_FOUND,
    });
  });
});

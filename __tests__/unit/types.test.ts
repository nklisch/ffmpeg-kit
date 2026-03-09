import { describe, expect, it } from "vitest";
import { FFmpegError, FFmpegErrorCode } from "../../src/types/errors.ts";

describe("FFmpegErrorCode", () => {
  it("has all 13 error codes", () => {
    const codes = Object.values(FFmpegErrorCode);
    expect(codes).toHaveLength(13);
    expect(codes).toContain("BINARY_NOT_FOUND");
    expect(codes).toContain("INPUT_NOT_FOUND");
    expect(codes).toContain("INVALID_INPUT");
    expect(codes).toContain("ENCODING_FAILED");
    expect(codes).toContain("TIMEOUT");
    expect(codes).toContain("FILTER_ERROR");
    expect(codes).toContain("HWACCEL_ERROR");
    expect(codes).toContain("OUTPUT_ERROR");
    expect(codes).toContain("CANCELLED");
    expect(codes).toContain("SESSION_LIMIT");
    expect(codes).toContain("CODEC_NOT_AVAILABLE");
    expect(codes).toContain("PERMISSION_DENIED");
    expect(codes).toContain("UNKNOWN");
  });
});

describe("FFmpegError", () => {
  it("constructs with all required fields", () => {
    const err = new FFmpegError({
      code: FFmpegErrorCode.TIMEOUT,
      message: "Operation timed out",
      stderr: "...ffmpeg output...",
      command: ["-i", "input.mp4", "output.mp4"],
      exitCode: 1,
    });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FFmpegError);
    expect(err.name).toBe("FFmpegError");
    expect(err.code).toBe(FFmpegErrorCode.TIMEOUT);
    expect(err.message).toBe("Operation timed out");
    expect(err.stderr).toBe("...ffmpeg output...");
    expect(err.command).toEqual(["-i", "input.mp4", "output.mp4"]);
    expect(err.exitCode).toBe(1);
  });

  it("supports cause option", () => {
    const cause = new Error("original");
    const err = new FFmpegError({
      code: FFmpegErrorCode.UNKNOWN,
      message: "Wrapped error",
      stderr: "",
      command: [],
      exitCode: 1,
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it("has correct stack trace", () => {
    const err = new FFmpegError({
      code: FFmpegErrorCode.INPUT_NOT_FOUND,
      message: "File not found",
      stderr: "",
      command: [],
      exitCode: 1,
    });
    expect(err.stack).toContain("FFmpegError");
    expect(err.stack).toContain("File not found");
  });

  it("is instanceof Error and instanceof FFmpegError", () => {
    const err = new FFmpegError({
      code: FFmpegErrorCode.UNKNOWN,
      message: "test",
      stderr: "",
      command: [],
      exitCode: -1,
    });
    expect(err instanceof Error).toBe(true);
    expect(err instanceof FFmpegError).toBe(true);
  });

  it("has immutable fields", () => {
    const err = new FFmpegError({
      code: FFmpegErrorCode.TIMEOUT,
      message: "timed out",
      stderr: "stderr text",
      command: ["ffmpeg", "-i", "in.mp4"],
      exitCode: 124,
    });
    // Readonly fields should be set correctly
    expect(err.code).toBe(FFmpegErrorCode.TIMEOUT);
    expect(err.stderr).toBe("stderr text");
    expect(err.command).toEqual(["ffmpeg", "-i", "in.mp4"]);
    expect(err.exitCode).toBe(124);
  });
});

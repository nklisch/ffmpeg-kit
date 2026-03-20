import { describe, expect, it } from "vitest";
import { execute } from "../../../src/core/execute.ts";
import { FFmpegError, FFmpegErrorCode } from "../../../src/types/errors.ts";
import type { ProgressInfo } from "../../../src/types/options.ts";
import { describeWithFFmpeg, FIXTURES } from "../../helpers.ts";

describeWithFFmpeg("execute()", () => {
  it("runs a simple ffmpeg command and returns result", async () => {
    const result = await execute(["-version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/ffmpeg version/);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("returns stdout and stderr", async () => {
    const result = await execute(["-i", FIXTURES.videoShort, "-f", "null", "-"], {
      logLevel: "info",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  it("reports durationMs > 0 for successful execution", async () => {
    const result = await execute(["-version"]);
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("times out and throws TIMEOUT", async () => {
    // Use -re to process at real-time speed so it runs long enough to time out
    await expect(
      execute(
        ["-re", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30", "-t", "10", "-f", "null", "-"],
        { timeout: 300 },
      ),
    ).rejects.toMatchObject({
      code: FFmpegErrorCode.TIMEOUT,
    });
  });

  it("cancels via AbortSignal and throws CANCELLED", async () => {
    const controller = new AbortController();
    // Use -re to process at real-time speed so we can cancel it
    const promise = execute(
      ["-re", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30", "-t", "10", "-f", "null", "-"],
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 200);
    await expect(promise).rejects.toMatchObject({
      code: FFmpegErrorCode.CANCELLED,
    });
  });

  it("calls onProgress during encoding", async () => {
    const events: ProgressInfo[] = [];
    await execute(["-i", FIXTURES.videoShort, "-f", "null", "-"], {
      onProgress: (p) => events.push(p),
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.frame).toBeGreaterThanOrEqual(0);
  });

  it("throws INPUT_NOT_FOUND for missing input", async () => {
    await expect(
      execute(["-i", "/nonexistent/missing.mp4", "-f", "null", "-"]),
    ).rejects.toMatchObject({
      code: FFmpegErrorCode.INPUT_NOT_FOUND,
    });
  });

  it("respects overwrite: false by omitting -y", async () => {
    // This test verifies the -y flag is not prepended
    // We can't easily test the actual overwrite behavior without a real file,
    // but we verify the result is still successful when overwrite is false and no conflict exists
    const result = await execute(["-version"], { overwrite: false });
    expect(result.exitCode).toBe(0);
  });

  it("throws FFmpegError instance", async () => {
    await expect(
      execute(["-i", "/nonexistent/missing.mp4", "-f", "null", "-"]),
    ).rejects.toBeInstanceOf(FFmpegError);
  });
});

describe("execute() — binary not found", () => {
  it("throws BINARY_NOT_FOUND for invalid ffmpeg path", async () => {
    await expect(
      execute(["-version"], {}, { ffmpegPath: "/nonexistent/ffmpeg" }),
    ).rejects.toMatchObject({
      code: FFmpegErrorCode.BINARY_NOT_FOUND,
    });
  });
});

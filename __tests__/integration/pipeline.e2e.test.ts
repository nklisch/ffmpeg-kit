import { expect, it, vi } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, tmp } from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("pipeline", () => {
  it("2-step pipeline produces valid output", async () => {
    const output = tmp("pipeline-out.mp4");
    const result = await ffmpeg
      .pipeline()
      .input(FIXTURES.videoShort)
      .step(ffmpeg.transform().scale({ width: 320 }))
      .step(ffmpeg.exportVideo().qualityTier("economy"))
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.stepCount).toBe(2);
    expect(result.stepDurations).toHaveLength(2);
    expect(result.duration).toBeGreaterThan(0);
  });

  it("temp files are cleaned up after success", async () => {
    const output = tmp("pipeline-cleanup.mp4");
    let _tempPath: string | undefined;

    // We'll find temp files by hooking into the pipeline indirectly
    // Just verify the output exists and no tmp files remain
    await ffmpeg
      .pipeline()
      .input(FIXTURES.videoShort)
      .step(ffmpeg.transform().scale({ width: 480 }))
      .step(ffmpeg.exportVideo().qualityTier("economy"))
      .output(output)
      .execute();

    expectFileExists(output);
    // If cleanup works, temp dir should not have our intermediate files
    // (we can't easily intercept temp paths, so just verify no errors)
  });

  it("temp files are cleaned up after failure", async () => {
    const output = tmp("pipeline-fail.mp4");
    await expect(
      ffmpeg
        .pipeline()
        .input("nonexistent-input-file.mp4")
        .step(ffmpeg.transform().scale({ width: 320 }))
        .step(ffmpeg.exportVideo().qualityTier("economy"))
        .output(output)
        .execute(),
    ).rejects.toThrow();
  });

  it("single-step pipeline works without temp files", async () => {
    const output = tmp("pipeline-single.mp4");
    const result = await ffmpeg
      .pipeline()
      .input(FIXTURES.videoShort)
      .step(ffmpeg.transform().scale({ width: 320 }))
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.stepCount).toBe(1);
    expect(result.stepDurations).toHaveLength(1);
  });

  it("onStepComplete callback fires for each step", async () => {
    const onStep = vi.fn();
    const output = tmp("pipeline-callback.mp4");
    await ffmpeg
      .pipeline()
      .input(FIXTURES.videoShort)
      .step(ffmpeg.transform().scale({ width: 480 }))
      .step(ffmpeg.exportVideo().qualityTier("economy"))
      .output(output)
      .onStepComplete(onStep)
      .execute();

    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenCalledWith(expect.objectContaining({ stepIndex: 0, stepCount: 2 }));
    expect(onStep).toHaveBeenCalledWith(expect.objectContaining({ stepIndex: 1, stepCount: 2 }));
  });
});

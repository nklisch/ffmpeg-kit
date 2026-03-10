import { describe, expect, it, vi } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { FIXTURES, describeWithFFmpeg, expectFileExists, tmp } from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("batch E2E", () => {
  it("processes 3 files with concurrency 2", async () => {
    const inputs = [FIXTURES.videoShort, FIXTURES.videoShort, FIXTURES.videoShort];
    const outputs = inputs.map((_, i) => tmp(`batch-out-${i}.mp4`));
    let idx = 0;

    const result = await ffmpeg.batch({
      inputs,
      concurrency: 2,
      operation: () => {
        const outPath = outputs[idx++]!;
        return {
          input: (path: string) => ({
            execute: () => ffmpeg.compress(path, outPath, { quality: "economy" }),
          }),
        };
      },
    });

    expect(result.results).toHaveLength(3);
    for (const r of result.results) {
      expect(r.success).toBe(true);
    }
    for (const out of outputs) {
      expectFileExists(out);
    }
  });

  it("individual failure does not stop the batch", async () => {
    const onError = vi.fn();
    const inputs = ["nonexistent.mp4", FIXTURES.videoShort, "alsonotfound.mp4"];
    const result = await ffmpeg.batch({
      inputs,
      onItemError: onError,
      operation: (input) => {
        const outPath = tmp(`batch-fail-${Date.now()}.mp4`);
        return {
          input: (path: string) => ({
            execute: () => ffmpeg.compress(path, outPath),
          }),
        };
      },
    });

    expect(result.results).toHaveLength(3);
    expect(result.results[0]!.success).toBe(false);
    expect(result.results[1]!.success).toBe(true);
    expect(result.results[2]!.success).toBe(false);
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("calls onItemComplete for each success", async () => {
    const onComplete = vi.fn();
    const inputs = [FIXTURES.videoShort, FIXTURES.videoShort];
    let idx = 0;
    const outputs = inputs.map((_, i) => tmp(`batch-complete-${i}.mp4`));

    await ffmpeg.batch({
      inputs,
      onItemComplete: onComplete,
      operation: () => {
        const outPath = outputs[idx++]!;
        return {
          input: (path: string) => ({
            execute: () => ffmpeg.compress(path, outPath, { quality: "economy" }),
          }),
        };
      },
    });

    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});

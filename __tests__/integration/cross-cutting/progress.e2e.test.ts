import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { createFFmpeg } from "../../../src/sdk.ts";
import type { ProgressInfo } from "../../../src/types/options.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, tmp } from "../../helpers.ts";

const ffmpeg = createFFmpeg();

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

describeWithFFmpeg("progress callbacks", () => {
  // Test 1: onProgress fires during builder execute
  it("onProgress fires during export", async () => {
    const events: ProgressInfo[] = [];
    const output = tmp("progress-export.mp4");

    await ffmpeg
      .exportVideo()
      .input(FIXTURES.videoH264)
      .output(output)
      .execute({
        onProgress: (info) => events.push(info),
      });

    expectFileExists(output);

    // Should have received at least one progress event
    expect(events.length).toBeGreaterThan(0);

    // Each event should have valid fields
    for (const event of events) {
      expect(event.frame).toBeGreaterThanOrEqual(0);
      expect(event.fps).toBeGreaterThanOrEqual(0);
      expect(event.time).toBeGreaterThanOrEqual(0);
    }
  });

  // Test 2: onProgress reports percent when totalDuration is provided
  it("onProgress reports percent with totalDuration", async () => {
    const events: ProgressInfo[] = [];
    const output = tmp("progress-percent.mp4");

    // First probe to get duration
    const probeResult = await ffmpeg.probe(FIXTURES.videoH264);
    const duration = probeResult.format.duration;

    await ffmpeg
      .exportVideo()
      .input(FIXTURES.videoH264)
      .output(output)
      .execute({
        onProgress: (info) => events.push(info),
        totalDuration: duration,
      });

    expectFileExists(output);
    expect(events.length).toBeGreaterThan(0);

    // At least one event should have a percent value
    const withPercent = events.filter((e) => e.percent !== null && e.percent !== undefined);
    expect(withPercent.length).toBeGreaterThan(0);

    // The percent values should be between 0 and ~100
    for (const event of withPercent) {
      expect(event.percent).toBeGreaterThanOrEqual(0);
      expect(event.percent!).toBeLessThanOrEqual(110); // allow slight overshoot
    }
  });
});

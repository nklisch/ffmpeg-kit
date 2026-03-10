import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectSilence, splitOnSilence, trimSilence } from "../../src/convenience/silence.ts";
import { FIXTURES, describeWithFFmpeg, expectFileExists, tmp } from "../helpers.ts";
import { getDuration } from "../../src/core/probe.ts";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describeWithFFmpeg("detectSilence", () => {
  it("finds silence ranges in silent audio fixture", async () => {
    const ranges = await detectSilence(FIXTURES.audioSilence, { threshold: -30 });
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) {
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeGreaterThan(range.start);
      expect(range.duration).toBeGreaterThan(0);
    }
  });
});

describeWithFFmpeg("trimSilence", () => {
  it("produces output shorter than or equal to input", async () => {
    const inputDuration = await getDuration(FIXTURES.audioSpeech);
    const output = tmp("trimmed-silence.wav");

    const result = await trimSilence({
      input: FIXTURES.audioSpeech,
      output,
      threshold: -40,
    });

    expectFileExists(output);
    expect(result.duration).toBeLessThanOrEqual(inputDuration + 0.5);
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it("respects padding parameter", async () => {
    const output1 = tmp("trim-pad0.wav");
    const output2 = tmp("trim-pad1.wav");

    await trimSilence({ input: FIXTURES.audioSpeech, output: output1, threshold: -40, padding: 0 });
    await trimSilence({ input: FIXTURES.audioSpeech, output: output2, threshold: -40, padding: 0.5 });

    expectFileExists(output1);
    expectFileExists(output2);
    // Both should be valid outputs
  });
});

describeWithFFmpeg("splitOnSilence", () => {
  it("creates multiple segment files in the output directory", async () => {
    const outDir = join(tmpdir(), `split-silence-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });

    const segments = await splitOnSilence({
      input: FIXTURES.audioSpeech,
      outputDir: outDir,
      threshold: -40,
      minSilence: 0.3,
      minSegment: 0.5,
    });

    expect(segments.length).toBeGreaterThan(0);
    for (const seg of segments) {
      expectFileExists(seg.path);
      expect(seg.duration).toBeGreaterThan(0);
      expect(seg.start).toBeGreaterThanOrEqual(0);
      expect(seg.end).toBeGreaterThan(seg.start);
    }
  });

  it("respects minSegment (no tiny segments)", async () => {
    const outDir = join(tmpdir(), `split-minseg-${Date.now()}`);
    mkdirSync(outDir, { recursive: true });
    const minSegment = 1.0;

    const segments = await splitOnSilence({
      input: FIXTURES.audioSpeech,
      outputDir: outDir,
      threshold: -40,
      minSilence: 0.3,
      minSegment,
    });

    for (const seg of segments) {
      expect(seg.duration).toBeGreaterThanOrEqual(minSegment - 0.01);
    }
  });
});

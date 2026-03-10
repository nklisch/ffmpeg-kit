import { describe, expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { FIXTURES, describeWithFFmpeg } from "../helpers.ts";
import { getDuration } from "../../src/core/probe.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("waveform", () => {
  it("returns Float32Array with approximately correct sample count", async () => {
    const samplesPerSecond = 10;
    const result = await ffmpeg.waveform({
      input: FIXTURES.audioSpeech,
      samplesPerSecond,
    });

    const expectedSamples = Math.round(result.duration * samplesPerSecond);
    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.data.length).toBeGreaterThan(0);
    // Allow ±20% tolerance for rounding
    expect(result.data.length).toBeGreaterThanOrEqual(expectedSamples * 0.8);
    expect(result.data.length).toBeLessThanOrEqual(expectedSamples * 1.2);
  });

  it("values are in valid range for peaks mode", async () => {
    const result = await ffmpeg.waveform({
      input: FIXTURES.audioSpeech,
      samplesPerSecond: 10,
      format: "peaks",
    });

    expect(result.data.length).toBeGreaterThan(0);
    for (const sample of result.data) {
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1.1); // allow small float overshoot
    }
  });

  it("returns correct duration matching input", async () => {
    const expectedDuration = await getDuration(FIXTURES.audioSpeech);
    const result = await ffmpeg.waveform({
      input: FIXTURES.audioSpeech,
      samplesPerSecond: 10,
    });

    expect(result.duration).toBeCloseTo(expectedDuration, 0);
  });

  it("mono channel mode produces single-channel data", async () => {
    const result = await ffmpeg.waveform({
      input: FIXTURES.audioSpeech,
      samplesPerSecond: 10,
      channels: "mono",
    });

    // Each sample is a single float
    expect(result.data).toBeInstanceOf(Float32Array);
    expect(result.sampleRate).toBe(10);
  });
});

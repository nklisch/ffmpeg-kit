import { expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, tmp } from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("SDK instance E2E", () => {
  it("extract produces valid output", async () => {
    const output = tmp("sdk-extract.png");
    const result = await ffmpeg.extract().input(FIXTURES.videoShort).timestamp(0.5).output(output).execute();
    expectFileExists(output);
    expect(result.width).toBeGreaterThan(0);
  });

  it("probe returns metadata", async () => {
    const result = await ffmpeg.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
    expect(result.streams.length).toBeGreaterThan(0);
  });

  it("getDuration returns positive number", async () => {
    const duration = await ffmpeg.getDuration(FIXTURES.videoShort);
    expect(duration).toBeGreaterThan(0);
  });

  it("getVideoStream returns video info", async () => {
    const stream = await ffmpeg.getVideoStream(FIXTURES.videoShort);
    expect(stream).not.toBeNull();
    expect(stream?.codec).toBeTruthy();
  });

  it("getAudioStream returns audio info for video with audio", async () => {
    const stream = await ffmpeg.getAudioStream(FIXTURES.videoH264);
    expect(stream).not.toBeNull();
  });

  it("remux convenience works", async () => {
    const output = tmp("sdk-remux.mkv");
    const result = await ffmpeg.remux(FIXTURES.videoShort, output);
    expectFileExists(output);
    expect(result.outputPath).toBe(output);
  });

  it("multiple instances have independent caches", async () => {
    const sdk1 = createFFmpeg();
    const sdk2 = createFFmpeg();

    await sdk1.probe(FIXTURES.videoShort);
    sdk1.clearProbeCache();
    // sdk2 cache is unaffected
    const result = await sdk2.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
  });

  it("validateInstallation returns versions", async () => {
    const info = await ffmpeg.validateInstallation();
    expect(info.ffmpeg.version).toBeTruthy();
    expect(info.ffprobe.version).toBeTruthy();
  });

  it("default export works", async () => {
    const { ffmpeg: defaultInstance } = await import("../../src/sdk.ts");
    const result = await defaultInstance.probe(FIXTURES.videoShort);
    expect(result.format.duration).toBeGreaterThan(0);
  });
});

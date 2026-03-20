import { expect, it } from "vitest";
import {
  clearProbeCache,
  getAudioStream,
  getDuration,
  getVideoStream,
  probe,
} from "../../../src/core/probe.ts";
import { FFmpegErrorCode } from "../../../src/types/errors.ts";
import {
  describeWithFFmpeg,
  expectCodec,
  expectDimensions,
  expectDurationClose,
  FIXTURES,
} from "../../helpers.ts";

describeWithFFmpeg("probe()", () => {
  it("probes video file and returns correct format info", async () => {
    const result = await probe(FIXTURES.videoH264, { noCache: true });
    expectDurationClose(result.format.duration, 5, 0.5);
    expect(result.format.nbStreams).toBeGreaterThanOrEqual(2);
  });

  it("returns correct video stream info", async () => {
    const result = await probe(FIXTURES.videoH264, { noCache: true });
    expectDimensions(result, 1920, 1080);
    expectCodec(result, "video", "h264");
    const videoStream = result.streams.find((s) => s.type === "video");
    expect(videoStream?.type).toBe("video");
    if (videoStream?.type === "video") {
      expect(videoStream.frameRate).toBeCloseTo(30, 0);
    }
  });

  it("returns correct audio stream info", async () => {
    const result = await probe(FIXTURES.videoH264, { noCache: true });
    expectCodec(result, "audio", "aac");
    const audioStream = result.streams.find((s) => s.type === "audio");
    expect(audioStream?.type).toBe("audio");
    if (audioStream?.type === "audio") {
      expect(audioStream.sampleRate).toBe(48000);
      expect(audioStream.channels).toBe(2);
    }
  });

  it("caches probe results (second call is faster)", async () => {
    clearProbeCache();
    const t1 = Date.now();
    await probe(FIXTURES.videoH264);
    const firstDuration = Date.now() - t1;

    const t2 = Date.now();
    await probe(FIXTURES.videoH264);
    const secondDuration = Date.now() - t2;

    // Second call should be much faster (cache hit)
    expect(secondDuration).toBeLessThan(firstDuration);
    expect(secondDuration).toBeLessThan(10);
  });

  it("bypasses cache with noCache: true", async () => {
    clearProbeCache();
    // First call to prime cache
    await probe(FIXTURES.videoH264);
    // Force fresh probe
    const t = Date.now();
    await probe(FIXTURES.videoH264, { noCache: true });
    const elapsed = Date.now() - t;
    // Should take real time (>5ms) since it bypasses cache
    expect(elapsed).toBeGreaterThan(5);
  });

  it("getDuration returns format duration", async () => {
    const duration = await getDuration(FIXTURES.videoH264);
    expectDurationClose(duration, 5, 0.5);
  });

  it("getVideoStream returns first video stream", async () => {
    const stream = await getVideoStream(FIXTURES.videoH264);
    expect(stream).not.toBeNull();
    expect(stream?.type).toBe("video");
    expect(stream?.codec).toBe("h264");
  });

  it("getAudioStream returns first audio stream", async () => {
    const stream = await getAudioStream(FIXTURES.videoH264);
    expect(stream).not.toBeNull();
    expect(stream?.type).toBe("audio");
    expect(stream?.codec).toBe("aac");
  });

  it("getVideoStream returns null for audio-only file", async () => {
    const stream = await getVideoStream(FIXTURES.audioSpeech);
    expect(stream).toBeNull();
  });

  it("throws INPUT_NOT_FOUND for missing file", async () => {
    await expect(probe("/nonexistent/missing.mp4")).rejects.toMatchObject({
      code: FFmpegErrorCode.INPUT_NOT_FOUND,
    });
  });

  it("clearProbeCache invalidates cache", async () => {
    // Prime cache
    await probe(FIXTURES.videoShort);
    clearProbeCache();
    // After clear, next call should hit ffprobe again (takes real time)
    const t = Date.now();
    await probe(FIXTURES.videoShort, { noCache: false });
    const elapsed = Date.now() - t;
    expect(elapsed).toBeGreaterThan(5);
  });

  it("probes short video correctly", async () => {
    const result = await probe(FIXTURES.videoShort, { noCache: true });
    expectDurationClose(result.format.duration, 2, 0.5);
    expectDimensions(result, 640, 360);
  });

  it("probes audio file correctly", async () => {
    const result = await probe(FIXTURES.audioSpeech, { noCache: true });
    expectDurationClose(result.format.duration, 3, 0.5);
    const audioStream = result.streams.find((s) => s.type === "audio");
    expect(audioStream).toBeDefined();
  });
});

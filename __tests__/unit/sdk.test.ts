import { describe, expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";

describe("createFFmpeg", () => {
  it("returns SDK with all expected methods", () => {
    const sdk = createFFmpeg();
    const methods = [
      "execute",
      "probe",
      "getDuration",
      "getVideoStream",
      "getAudioStream",
      "validateInstallation",
      "clearProbeCache",
      "parseTimecode",
      "extract",
      "transform",
      "audio",
      "concat",
      "exportVideo",
      "overlay",
      "text",
      "subtitle",
      "image",
      "hls",
      "dash",
      "gif",
      "filterGraph",
      "filter",
      "chain",
      "detectHardware",
      "pipeline",
      "batch",
      "smartTranscode",
      "thumbnailSheet",
      "waveform",
      "estimateSize",
      "detectSilence",
      "trimSilence",
      "splitOnSilence",
      "normalizeMedia",
      "remux",
      "compress",
      "extractAudio",
      "imageToVideo",
      "resize",
    ];
    for (const method of methods) {
      expect(typeof (sdk as Record<string, unknown>)[method], `method: ${method}`).toBe("function");
    }
  });

  it("default instance works for pure functions", () => {
    const sdk = createFFmpeg();
    expect(sdk.parseTimecode("01:30:00")).toBe(5400);
    expect(sdk.filter("scale", { w: 1920, h: -2 })).toContain("scale");
  });

  it("builders from namespace produce valid args", () => {
    const sdk = createFFmpeg();
    const args = sdk.extract().input("/test.mp4").timestamp(5).output("/frame.png").toArgs();
    expect(args).toContain("-i");
    expect(args).toContain("/test.mp4");
  });

  it("builders without SDK throw on execute", async () => {
    const { extract } = await import("../../src/operations/extract.ts");
    await expect(
      extract().input("/test.mp4").timestamp(5).output("/frame.png").execute(),
    ).rejects.toThrow("requires an SDK instance");
  });

  it("accepts all config options without throwing", () => {
    const sdk = createFFmpeg({
      ffmpegPath: "/custom/ffmpeg",
      ffprobePath: "/custom/ffprobe",
      tempDir: "/tmp/custom",
      defaultTimeout: 30_000,
      defaultHwAccel: "cpu",
      logLevel: "warning",
      probeCacheSize: 50,
      probeCacheTtl: 60_000,
    });
    expect(typeof sdk.execute).toBe("function");
  });

  it("two instances are independent objects", () => {
    const sdk1 = createFFmpeg();
    const sdk2 = createFFmpeg();
    expect(sdk1).not.toBe(sdk2);
  });

  it("clearProbeCache does not throw", () => {
    const sdk = createFFmpeg();
    expect(() => sdk.clearProbeCache()).not.toThrow();
  });

  it("chain filter helper works", () => {
    const sdk = createFFmpeg();
    const result = sdk.chain("scale=1920:-2", "fps=30");
    expect(result).toBe("scale=1920:-2,fps=30");
  });
});

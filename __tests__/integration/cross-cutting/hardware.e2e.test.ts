import { describe, expect, it } from "vitest";
import { clearHardwareCache, detectHardware } from "../../../src/hardware/detect.ts";
import { describeWithFFmpeg } from "../../helpers.ts";

describeWithFFmpeg("detectHardware()", () => {
  it("returns capabilities with cpu always available", async () => {
    clearHardwareCache();
    const caps = await detectHardware();
    expect(caps.available).toContain("cpu");
    expect(caps.encoders).toBeDefined();
    expect(caps.decoders).toBeDefined();
  });

  it("caches result across calls (same object reference)", async () => {
    clearHardwareCache();
    const caps1 = await detectHardware();
    const caps2 = await detectHardware();
    expect(caps1).toBe(caps2);
  });

  it("clearHardwareCache forces re-detection (different object reference)", async () => {
    clearHardwareCache();
    const caps1 = await detectHardware();
    clearHardwareCache();
    const caps2 = await detectHardware();
    expect(caps1).not.toBe(caps2);
    expect(caps2.available).toContain("cpu");
  });

  it("encoders has all required codec family keys", async () => {
    clearHardwareCache();
    const caps = await detectHardware();
    expect(caps.encoders).toHaveProperty("h264");
    expect(caps.encoders).toHaveProperty("hevc");
    expect(caps.encoders).toHaveProperty("av1");
    expect(caps.encoders).toHaveProperty("vp9");
    expect(Array.isArray(caps.encoders.h264)).toBe(true);
    expect(Array.isArray(caps.encoders.hevc)).toBe(true);
  });

  it("decoders has all required codec family keys", async () => {
    clearHardwareCache();
    const caps = await detectHardware();
    expect(caps.decoders).toHaveProperty("h264");
    expect(caps.decoders).toHaveProperty("hevc");
    expect(caps.decoders).toHaveProperty("av1");
    expect(caps.decoders).toHaveProperty("vp9");
  });

  it("handles concurrent calls without double-running detection", async () => {
    clearHardwareCache();
    const [caps1, caps2, caps3] = await Promise.all([
      detectHardware(),
      detectHardware(),
      detectHardware(),
    ]);
    // All concurrent calls should return the same cached result
    expect(caps1).toBe(caps2);
    expect(caps2).toBe(caps3);
  });
});

describe("detectHardware() — invalid ffmpeg path", () => {
  it("returns cpu-only capabilities when ffmpeg is not found", async () => {
    const caps = await detectHardware({ ffmpegPath: "/nonexistent/ffmpeg" });
    // On error, should gracefully degrade — may return from cache if already detected
    expect(caps.available).toContain("cpu");
  });
});

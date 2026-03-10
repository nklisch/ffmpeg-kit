import { describe, expect, it } from "vitest";
import { estimateSize, formatBytes, parseBitrate } from "../../src/convenience/estimate.ts";

describe("parseBitrate", () => {
  it("parses megabit strings", () => {
    expect(parseBitrate("5M")).toBe(5_000_000);
    expect(parseBitrate("10M")).toBe(10_000_000);
    expect(parseBitrate("1.5M")).toBe(1_500_000);
  });

  it("parses kilobit strings", () => {
    expect(parseBitrate("192k")).toBe(192_000);
    expect(parseBitrate("128k")).toBe(128_000);
    expect(parseBitrate("320K")).toBe(320_000);
  });

  it("parses plain numeric strings", () => {
    expect(parseBitrate("10000")).toBe(10_000);
    expect(parseBitrate("1000000")).toBe(1_000_000);
  });
});

describe("formatBytes", () => {
  it("formats bytes under 1 KB", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
    expect(formatBytes(145_200_000)).toBe("145.2 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(2_000_000_000)).toBe("2.0 GB");
  });
});

describe("estimateSize calculation", () => {
  it("computes correct byte estimate with explicit bitrates", async () => {
    // 10 seconds at 5M video + 192k audio
    // bytes = (5_000_000 + 192_000) * 10 / 8 = 6_490_000
    const result = await estimateSize({
      input: "dummy",
      videoBitrate: "5M",
      audioBitrate: "192k",
      duration: 10,
    });
    expect(result.bytes).toBe(6_490_000);
    expect(result.confidence).toBe("high");
    expect(result.formatted).toContain("MB");
  });

  it("returns high confidence for explicit bitrates", async () => {
    const result = await estimateSize({
      input: "dummy",
      videoBitrate: "2M",
      audioBitrate: "128k",
      duration: 60,
    });
    expect(result.confidence).toBe("high");
  });
});

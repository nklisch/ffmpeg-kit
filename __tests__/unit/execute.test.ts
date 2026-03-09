import { describe, expect, it } from "vitest";
import { parseProgressLine } from "../../src/core/execute.ts";

describe("parseProgressLine", () => {
  it("parses frame", () => {
    expect(parseProgressLine("frame=123")).toEqual({ frame: 123 });
  });

  it("parses fps", () => {
    expect(parseProgressLine("fps=30.0")).toEqual({ fps: 30 });
  });

  it("parses out_time_us to seconds", () => {
    expect(parseProgressLine("out_time_us=5000000")).toEqual({ time: 5 });
  });

  it("parses speed (strips x suffix)", () => {
    expect(parseProgressLine("speed=2.5x")).toEqual({ speed: 2.5 });
  });

  it("parses bitrate as string", () => {
    expect(parseProgressLine("bitrate=5000.0kbits/s")).toEqual({
      bitrate: "5000.0kbits/s",
    });
  });

  it("parses total_size", () => {
    expect(parseProgressLine("total_size=1234567")).toEqual({ totalSize: 1234567 });
  });

  it("returns null for progress sentinel", () => {
    expect(parseProgressLine("progress=continue")).toBeNull();
    expect(parseProgressLine("progress=end")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseProgressLine("")).toBeNull();
  });

  it("returns null for unknown keys", () => {
    expect(parseProgressLine("dup_frames=0")).toBeNull();
  });

  it("calculates percent when totalDuration is known", () => {
    const result = parseProgressLine("out_time_us=5000000", 10);
    expect(result?.percent).toBe(50);
  });

  it("clamps percent to 0-100", () => {
    const result = parseProgressLine("out_time_us=15000000", 10);
    expect(result?.percent).toBe(100);
  });

  it("returns null for line without =", () => {
    expect(parseProgressLine("notapair")).toBeNull();
  });
});

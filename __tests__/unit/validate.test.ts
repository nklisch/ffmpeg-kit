import { describe, expect, it } from "vitest";
import { parseVersionString } from "../../src/core/validate.ts";

describe("parseVersionString", () => {
  it("parses release version", () => {
    expect(parseVersionString("ffmpeg version 7.1.1 Copyright (c) 2000-2024")).toBe("7.1.1");
  });

  it("parses build version", () => {
    expect(parseVersionString("ffmpeg version N-123-gabcdef ...")).toBe("N-123-gabcdef");
  });

  it("parses ffprobe version", () => {
    expect(parseVersionString("ffprobe version 6.0 Copyright (c) 2000-2023")).toBe("6.0");
  });

  it("throws for unrecognized format", () => {
    expect(() => parseVersionString("garbage")).toThrow();
  });

  it("parses multi-part version", () => {
    expect(parseVersionString("ffmpeg version 5.1.4 Copyright")).toBe("5.1.4");
  });
});

import { describe, expect, it } from "vitest";
import { parseTimecode } from "../../src/util/timecode.ts";

describe("parseTimecode", () => {
  it("returns number as-is", () => {
    expect(parseTimecode(90.5)).toBe(90.5);
  });

  it("parses HH:MM:SS.ms", () => {
    expect(parseTimecode("01:30:00.5")).toBe(5400.5);
  });

  it("parses 1:02:03.456", () => {
    expect(parseTimecode("1:02:03.456")).toBe(3723.456);
  });

  it("parses MM:SS", () => {
    expect(parseTimecode("1:30")).toBe(90);
  });

  it("parses 0:00", () => {
    expect(parseTimecode("0:00")).toBe(0);
  });

  it("parses plain seconds string", () => {
    expect(parseTimecode("30")).toBe(30);
  });

  it("parses plain seconds with decimal", () => {
    expect(parseTimecode("30.5")).toBe(30.5);
  });

  it("parses percentage with duration", () => {
    expect(parseTimecode("50%", 120)).toBe(60);
  });

  it("throws for percentage without duration", () => {
    expect(() => parseTimecode("50%")).toThrow();
  });

  it("throws for invalid string", () => {
    expect(() => parseTimecode("invalid")).toThrow();
  });

  it("throws for empty string", () => {
    expect(() => parseTimecode("")).toThrow();
  });

  it("parses 100% correctly", () => {
    expect(parseTimecode("100%", 120)).toBe(120);
  });

  it("handles large values", () => {
    expect(parseTimecode("99:59:59")).toBe(99 * 3600 + 59 * 60 + 59);
  });
});

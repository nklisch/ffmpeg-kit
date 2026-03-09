import { describe, expect, it } from "vitest";
import { buildBaseArgs, buildFilter, escapeFilterValue, flattenArgs } from "../../src/core/args.ts";

describe("escapeFilterValue", () => {
  it("escapes apostrophe", () => {
    expect(escapeFilterValue("it's a test")).toBe("it\\'s a test");
  });

  it("escapes = and :", () => {
    expect(escapeFilterValue("key=val:opt")).toBe("key\\=val\\:opt");
  });

  it("escapes backslash first", () => {
    expect(escapeFilterValue("a\\b")).toBe("a\\\\b");
  });

  it("escapes brackets", () => {
    expect(escapeFilterValue("[0:v]")).toBe("\\[0\\:v\\]");
  });

  it("escapes semicolon", () => {
    expect(escapeFilterValue("a;b")).toBe("a\\;b");
  });

  it("leaves plain strings unchanged", () => {
    expect(escapeFilterValue("hello world")).toBe("hello world");
  });
});

describe("buildFilter", () => {
  it("builds filter with object options", () => {
    expect(buildFilter("scale", { w: 1920, h: -2 })).toBe("scale=w=1920:h=-2");
  });

  it("builds filter with string option", () => {
    expect(buildFilter("volume", "0.5")).toBe("volume=0.5");
  });

  it("builds filter with no options", () => {
    expect(buildFilter("anull")).toBe("anull");
  });

  it("omits false boolean options", () => {
    expect(buildFilter("test", { a: true, b: false })).toBe("test=a");
  });

  it("includes true boolean option as key only", () => {
    expect(buildFilter("test", { flag: true })).toBe("test=flag");
  });
});

describe("buildBaseArgs", () => {
  it("produces -y for overwrite (default)", () => {
    const args = buildBaseArgs({ inputs: ["a.mp4"] });
    expect(args).toContain("-y");
    expect(args).toContain("-i");
    expect(args).toContain("a.mp4");
  });

  it("omits -y when overwrite is false", () => {
    const args = buildBaseArgs({ overwrite: false, inputs: ["a.mp4"] });
    expect(args).not.toContain("-y");
  });

  it("places -ss before -i when seekBefore is set", () => {
    const args = buildBaseArgs({ seekBefore: 30, inputs: ["a.mp4"] });
    const ssIdx = args.indexOf("-ss");
    const iIdx = args.indexOf("-i");
    expect(ssIdx).toBeGreaterThanOrEqual(0);
    expect(ssIdx).toBeLessThan(iIdx);
    expect(args[ssIdx + 1]).toBe("30");
  });

  it("includes loglevel", () => {
    const args = buildBaseArgs({ logLevel: "quiet" });
    expect(args).toContain("-loglevel");
    expect(args).toContain("quiet");
  });

  it("includes progress flags", () => {
    const args = buildBaseArgs({ progress: true });
    expect(args).toContain("-progress");
    expect(args).toContain("pipe:1");
    expect(args).toContain("-stats_period");
  });

  it("handles multiple inputs", () => {
    const args = buildBaseArgs({ inputs: ["a.mp4", "b.mp4"] });
    expect(args.filter((a) => a === "-i").length).toBe(2);
  });
});

describe("flattenArgs", () => {
  it("filters false/null/undefined and flattens arrays", () => {
    expect(flattenArgs(["-y", false, ["-ss", "10"]])).toEqual(["-y", "-ss", "10"]);
  });

  it("handles all falsy values", () => {
    expect(flattenArgs(["-y", false, null, undefined, "-i"])).toEqual(["-y", "-i"]);
  });

  it("handles nested arrays", () => {
    expect(flattenArgs([["-a", "-b"], "-c"])).toEqual(["-a", "-b", "-c"]);
  });

  it("returns empty array for all-falsy input", () => {
    expect(flattenArgs([false, null, undefined])).toEqual([]);
  });
});

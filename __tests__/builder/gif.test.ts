import { describe, expect, it } from "vitest";
import { gif } from "../../src/operations/image/gif.ts";

describe("GifBuilder", () => {
  // 1-pass (simple)

  it("produces -vf fps=10 as default", () => {
    const args = gif().input("v.mp4").output("o.gif").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("fps=10");
  });

  it("produces -vf fps={n} from fps()", () => {
    const args = gif().input("v.mp4").fps(15).output("o.gif").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("fps=15");
  });

  it("produces scale filter with width and auto height from size()", () => {
    const args = gif().input("v.mp4").fps(15).size({ width: 480 }).output("o.gif").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("fps=15");
    expect(args[vfIdx + 1]).toContain("scale=480:-2:flags=lanczos");
  });

  it("produces scale with auto width and specified height", () => {
    const args = gif().input("v.mp4").size({ height: 240 }).output("o.gif").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("scale=-2:240:flags=lanczos");
  });

  it("produces -ss from trimStart()", () => {
    const args = gif().input("v.mp4").trimStart(2).output("o.gif").toArgs();
    const ssIdx = args.indexOf("-ss");
    expect(ssIdx).toBeGreaterThanOrEqual(0);
    expect(args[ssIdx + 1]).toBe("2");
  });

  it("places -ss before -i", () => {
    const args = gif().input("v.mp4").trimStart(2).output("o.gif").toArgs();
    const ssIdx = args.indexOf("-ss");
    const iIdx = args.indexOf("-i");
    expect(ssIdx).toBeLessThan(iIdx);
  });

  it("produces -t from duration()", () => {
    const args = gif().input("v.mp4").duration(3).output("o.gif").toArgs();
    const tIdx = args.indexOf("-t");
    expect(tIdx).toBeGreaterThanOrEqual(0);
    expect(args[tIdx + 1]).toBe("3");
  });

  it("places -t after -i", () => {
    const args = gif().input("v.mp4").duration(3).output("o.gif").toArgs();
    const iIdx = args.indexOf("-i");
    const tIdx = args.indexOf("-t");
    expect(tIdx).toBeGreaterThan(iIdx);
  });

  it("produces -loop from loop()", () => {
    const args = gif().input("v.mp4").loop(0).output("o.gif").toArgs();
    const loopIdx = args.indexOf("-loop");
    expect(loopIdx).toBeGreaterThanOrEqual(0);
    expect(args[loopIdx + 1]).toBe("0");
  });

  it("produces -loop -1 for no-loop", () => {
    const args = gif().input("v.mp4").loop(-1).output("o.gif").toArgs();
    const loopIdx = args.indexOf("-loop");
    expect(loopIdx).toBeGreaterThanOrEqual(0);
    expect(args[loopIdx + 1]).toBe("-1");
  });

  it("does not include -loop by default", () => {
    const args = gif().input("v.mp4").output("o.gif").toArgs();
    expect(args).not.toContain("-loop");
  });

  // 2-pass (optimized palette)

  it("produces -filter_complex with split/palettegen/paletteuse from optimizePalette()", () => {
    const args = gif().input("v.mp4").optimizePalette().output("o.gif").toArgs();
    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    const fc = args[fcIdx + 1];
    expect(fc).toContain("split");
    expect(fc).toContain("palettegen");
    expect(fc).toContain("paletteuse");
    expect(args).not.toContain("-vf");
  });

  it("includes default dither method in paletteuse", () => {
    const args = gif().input("v.mp4").optimizePalette().output("o.gif").toArgs();
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("dither=sierra2_4a");
  });

  it("includes custom dither method from dither()", () => {
    const args = gif().input("v.mp4").optimizePalette().dither("bayer").output("o.gif").toArgs();
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("dither=bayer");
  });

  it("includes max_colors in palettegen from maxColors()", () => {
    const args = gif().input("v.mp4").optimizePalette().maxColors(128).output("o.gif").toArgs();
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("max_colors=128");
  });

  it("includes stats_mode in palettegen from paletteMode()", () => {
    const args = gif()
      .input("v.mp4")
      .optimizePalette()
      .paletteMode("diff")
      .output("o.gif")
      .toArgs();
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("stats_mode=diff");
  });

  it("includes scale in filter_complex when size is set with optimizePalette", () => {
    const args = gif()
      .input("v.mp4")
      .optimizePalette()
      .size({ width: 320 })
      .output("o.gif")
      .toArgs();
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("scale=320:-2:flags=lanczos");
  });

  it("trimStart and duration work with optimizePalette", () => {
    const args = gif()
      .input("v.mp4")
      .trimStart(1)
      .duration(2)
      .optimizePalette()
      .output("o.gif")
      .toArgs();
    expect(args).toContain("-ss");
    expect(args).toContain("-t");
    expect(args).toContain("-filter_complex");
  });

  // Validation

  it("throws when input is missing", () => {
    expect(() => gif().output("o.gif").toArgs()).toThrow();
  });

  it("throws when output is missing", () => {
    expect(() => gif().input("v.mp4").toArgs()).toThrow();
  });
});

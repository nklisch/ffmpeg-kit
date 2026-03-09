import { describe, expect, it } from "vitest";
import { transform } from "../../src/operations/transform.ts";

describe("TransformBuilder", () => {
  // Scale

  it("produces scale=W:-2 for width-only", () => {
    const args = transform().input("v.mp4").scale({ width: 1920 }).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=1920:-2");
  });

  it("produces scale=-2:H for height-only", () => {
    const args = transform().input("v.mp4").scale({ height: 1080 }).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=-2:1080");
  });

  it("produces scale=W:H for both dimensions", () => {
    const args = transform()
      .input("v.mp4")
      .scale({ width: 640, height: 360 })
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=640:360");
  });

  it("adds force_original_aspect_ratio=decrease for contain mode", () => {
    const args = transform()
      .input("v.mp4")
      .scale({ width: 1920, height: 1080 })
      // biome-ignore lint/suspicious/noFocusedTests: TransformBuilder.fit() is not a vitest focus
      .fit("contain")
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("force_original_aspect_ratio=decrease");
  });

  it("adds pad after scale for contain mode", () => {
    const args = transform()
      .input("v.mp4")
      .scale({ width: 1920, height: 1080 })
      // biome-ignore lint/suspicious/noFocusedTests: TransformBuilder.fit() is not a vitest focus
      .fit("contain")
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("pad=1920:1080");
  });

  it("adds force_original_aspect_ratio=increase for cover mode", () => {
    const args = transform()
      .input("v.mp4")
      .scale({ width: 1920, height: 1080 })
      // biome-ignore lint/suspicious/noFocusedTests: TransformBuilder.fit() is not a vitest focus
      .fit("cover")
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("force_original_aspect_ratio=increase");
  });

  it("adds crop after scale for cover mode", () => {
    const args = transform()
      .input("v.mp4")
      .scale({ width: 1920, height: 1080 })
      // biome-ignore lint/suspicious/noFocusedTests: TransformBuilder.fit() is not a vitest focus
      .fit("cover")
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("crop=1920:1080");
  });

  it("adds scale flags for algorithm", () => {
    const args = transform()
      .input("v.mp4")
      .scale({ width: 1920, height: 1080 })
      .scaleAlgorithm("lanczos")
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("flags=lanczos");
  });

  // Crop

  it("produces crop expression for aspect ratio", () => {
    const args = transform().input("v.mp4").crop({ aspectRatio: "16:9" }).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("crop=");
    expect(args[vfIdx + 1]).toContain("16/9");
  });

  it("produces crop=W:H for explicit dimensions", () => {
    const args = transform()
      .input("v.mp4")
      .crop({ width: 320, height: 180 })
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("crop=320:180");
  });

  it("centers crop by default", () => {
    const args = transform()
      .input("v.mp4")
      .crop({ width: 320, height: 180 })
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("(iw-320)/2");
    expect(args[vfIdx + 1]).toContain("(ih-180)/2");
  });

  it("uses explicit x:y when provided", () => {
    const args = transform()
      .input("v.mp4")
      .crop({ width: 320, height: 180, x: 10, y: 20 })
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("crop=320:180:10:20");
  });

  // Speed

  it("produces setpts=PTS/2 for speed(2)", () => {
    const args = transform().input("v.mp4").speed(2).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("setpts=PTS/2");
  });

  it("produces setpts=PTS/0.5 for speed(0.5)", () => {
    const args = transform().input("v.mp4").speed(0.5).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("setpts=PTS/0.5");
  });

  it("produces atempo=2 for speed(2)", () => {
    const args = transform().input("v.mp4").speed(2).output("o.mp4").toArgs();
    const afIdx = args.indexOf("-af");
    expect(afIdx).toBeGreaterThanOrEqual(0);
    expect(args[afIdx + 1]).toContain("atempo=2");
  });

  it("chains atempo for speed(4): atempo=2,atempo=2", () => {
    const args = transform().input("v.mp4").speed(4).output("o.mp4").toArgs();
    const afIdx = args.indexOf("-af");
    expect(args[afIdx + 1]).toBe("atempo=2,atempo=2");
  });

  it("chains atempo for speed(0.25): atempo=0.5,atempo=0.5", () => {
    const args = transform().input("v.mp4").speed(0.25).output("o.mp4").toArgs();
    const afIdx = args.indexOf("-af");
    expect(args[afIdx + 1]).toBe("atempo=0.5,atempo=0.5");
  });

  // Trim

  it("places -ss before -i for trimStart", () => {
    const args = transform().input("v.mp4").trimStart(5).output("o.mp4").toArgs();
    const ssIdx = args.indexOf("-ss");
    const iIdx = args.indexOf("-i");
    expect(ssIdx).toBeGreaterThanOrEqual(0);
    expect(ssIdx).toBeLessThan(iIdx);
    expect(args[ssIdx + 1]).toBe("5");
  });

  it("includes -to for trimEnd", () => {
    const args = transform().input("v.mp4").trimEnd(10).output("o.mp4").toArgs();
    const toIdx = args.indexOf("-to");
    expect(toIdx).toBeGreaterThanOrEqual(0);
    expect(args[toIdx + 1]).toBe("10");
  });

  it("includes -t for duration", () => {
    const args = transform().input("v.mp4").duration(5).output("o.mp4").toArgs();
    const tIdx = args.indexOf("-t");
    expect(tIdx).toBeGreaterThanOrEqual(0);
    expect(args[tIdx + 1]).toBe("5");
  });

  it("duration takes precedence over trimEnd", () => {
    const args = transform()
      .input("v.mp4")
      .trimStart(5)
      .duration(3)
      .trimEnd(15)
      .output("o.mp4")
      .toArgs();
    // Should have -t 3 but not -to
    expect(args).toContain("-t");
    expect(args).not.toContain("-to");
  });

  // Filters

  it("produces -vf reverse and -af areverse for reverse()", () => {
    const args = transform().input("v.mp4").reverse().output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    const afIdx = args.indexOf("-af");
    expect(args[vfIdx + 1]).toContain("reverse");
    expect(args[afIdx + 1]).toContain("areverse");
  });

  it("produces -stream_loop N-1 for loop(N)", () => {
    const args = transform().input("v.mp4").loop(3).output("o.mp4").toArgs();
    const loopIdx = args.indexOf("-stream_loop");
    expect(loopIdx).toBeGreaterThanOrEqual(0);
    expect(args[loopIdx + 1]).toBe("2");
  });

  it("produces transpose=1 for rotate(90)", () => {
    const args = transform().input("v.mp4").rotate(90).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("transpose=1");
  });

  it("produces transpose=1,transpose=1 for rotate(180)", () => {
    const args = transform().input("v.mp4").rotate(180).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("transpose=1,transpose=1");
  });

  it("produces transpose=2 for rotate(270)", () => {
    const args = transform().input("v.mp4").rotate(270).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("transpose=2");
  });

  it("produces hflip filter for flipH()", () => {
    const args = transform().input("v.mp4").flipH().output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("hflip");
  });

  it("produces vflip filter for flipV()", () => {
    const args = transform().input("v.mp4").flipV().output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("vflip");
  });

  it("produces pad filter with centered position", () => {
    const args = transform()
      .input("v.mp4")
      .pad({ width: 1920, height: 1080 })
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("pad=1920:1080:(ow-iw)/2:(oh-ih)/2");
  });

  it("produces fps=N filter", () => {
    const args = transform().input("v.mp4").fps(24).output("o.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("fps=24");
  });

  it("produces minterpolate filter for interpolate()", () => {
    const args = transform()
      .input("v.mp4")
      .interpolate(60, "minterpolate")
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("minterpolate=fps=60");
  });

  // Ken Burns

  it("produces zoompan filter with correct frame count", () => {
    const args = transform()
      .input("img.jpg")
      .kenBurns({
        duration: 3,
        startZoom: 1,
        endZoom: 1.5,
        startPosition: "center",
        endPosition: "center",
      })
      .outputSize(1920, 1080)
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("zoompan=");
    expect(args[vfIdx + 1]).toContain("d=90"); // 3s * 30fps = 90
  });

  it("includes zoom expression from startZoom to endZoom", () => {
    const args = transform()
      .input("img.jpg")
      .kenBurns({
        duration: 3,
        startZoom: 1,
        endZoom: 1.5,
        startPosition: "center",
        endPosition: "center",
      })
      .outputSize(1920, 1080)
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    // zoom expression: startZoom+(delta)*(on/totalFrames)
    expect(args[vfIdx + 1]).toContain("z='");
    // startZoom=1, delta=0.5, totalFrames=90
    expect(args[vfIdx + 1]).toContain("z='1+(0.5)*(on/90)");
  });

  // Codec selection

  it("uses -c copy when only trimming (no filters)", () => {
    const args = transform().input("v.mp4").trimStart(5).output("o.mp4").toArgs();
    expect(args).toContain("-c");
    expect(args).toContain("copy");
  });

  it("uses -c:v libx264 when filters are applied", () => {
    const args = transform().input("v.mp4").scale({ width: 640 }).output("o.mp4").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
  });

  it("applies correct filter chain ordering: scale, crop, pad, flip, rotate, setpts, fps, reverse", () => {
    const args = transform()
      .input("v.mp4")
      .scale({ width: 640, height: 360 })
      .crop({ width: 320, height: 180 })
      .pad({ width: 640, height: 480 })
      .flipH()
      .rotate(90)
      .speed(2)
      .fps(30)
      .reverse()
      .output("o.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    const chain = args[vfIdx + 1] ?? "";
    const scalePos = chain.indexOf("scale=");
    const cropPos = chain.indexOf("crop=");
    const padPos = chain.indexOf("pad=");
    const hflipPos = chain.indexOf("hflip");
    const transposePos = chain.indexOf("transpose=");
    const setptsPos = chain.indexOf("setpts=");
    const fpsPos = chain.indexOf("fps=");
    const reversePos = chain.indexOf("reverse");
    expect(scalePos).toBeLessThan(cropPos);
    expect(cropPos).toBeLessThan(padPos);
    expect(padPos).toBeLessThan(hflipPos);
    expect(hflipPos).toBeLessThan(transposePos);
    expect(transposePos).toBeLessThan(setptsPos);
    expect(setptsPos).toBeLessThan(fpsPos);
    expect(fpsPos).toBeLessThan(reversePos);
  });

  // Validation

  it("throws when input is missing", () => {
    expect(() => transform().output("o.mp4").toArgs()).toThrow();
  });

  it("throws when output is missing", () => {
    expect(() => transform().input("v.mp4").toArgs()).toThrow();
  });

  it("throws for unsupported rotation angle", () => {
    expect(() => transform().input("v.mp4").rotate(45).output("o.mp4").toArgs()).toThrow();
  });
});

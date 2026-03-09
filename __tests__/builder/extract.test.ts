import { describe, expect, it } from "vitest";
import { extract } from "../../src/operations/extract.ts";

describe("ExtractBuilder", () => {
  // Arg construction

  it("places -ss before -i for fast seeking", () => {
    const args = extract().input("v.mp4").timestamp(5).output("f.png").toArgs();
    const ssIdx = args.indexOf("-ss");
    const iIdx = args.indexOf("-i");
    expect(ssIdx).toBeGreaterThanOrEqual(0);
    expect(iIdx).toBeGreaterThanOrEqual(0);
    expect(ssIdx).toBeLessThan(iIdx);
    expect(args[ssIdx + 1]).toBe("5");
  });

  it("resolves HH:MM:SS timecode to seconds", () => {
    const args = extract().input("v.mp4").timestamp("01:30:00").output("f.png").toArgs();
    expect(args).toContain("5400");
  });

  it("resolves MM:SS timecode to seconds", () => {
    const args = extract().input("v.mp4").timestamp("01:30").output("f.png").toArgs();
    expect(args).toContain("90");
  });

  it("defaults to 1 frame", () => {
    const args = extract().input("v.mp4").output("f.png").toArgs();
    const framesIdx = args.indexOf("-frames:v");
    expect(framesIdx).toBeGreaterThanOrEqual(0);
    expect(args[framesIdx + 1]).toBe("1");
  });

  it("includes -frames:v when frames > 1", () => {
    const args = extract().input("v.mp4").frames(5).output("f_%d.png").toArgs();
    const framesIdx = args.indexOf("-frames:v");
    expect(framesIdx).toBeGreaterThanOrEqual(0);
    expect(args[framesIdx + 1]).toBe("5");
  });

  it("includes -c:v mjpeg for jpg format", () => {
    const args = extract().input("v.mp4").format("jpg").output("f.jpg").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("mjpeg");
  });

  it("includes -c:v libwebp for webp format", () => {
    const args = extract().input("v.mp4").format("webp").output("f.webp").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libwebp");
  });

  it("includes -q:v for jpeg quality", () => {
    const args = extract().input("v.mp4").format("jpg").quality(2).output("f.jpg").toArgs();
    const qIdx = args.indexOf("-q:v");
    expect(qIdx).toBeGreaterThanOrEqual(0);
    expect(args[qIdx + 1]).toBe("2");
  });

  it("includes -quality for webp quality", () => {
    const args = extract().input("v.mp4").format("webp").quality(80).output("f.webp").toArgs();
    const qIdx = args.indexOf("-quality");
    expect(qIdx).toBeGreaterThanOrEqual(0);
    expect(args[qIdx + 1]).toBe("80");
  });

  it("includes scale filter for size with both dimensions", () => {
    const args = extract()
      .input("v.mp4")
      .size({ width: 320, height: 240 })
      .output("f.png")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=320:240");
  });

  it("uses -2 for auto-aspect on missing height", () => {
    const args = extract().input("v.mp4").size({ width: 320 }).output("f.png").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=320:-2");
  });

  it("uses -2 for auto-aspect on missing width", () => {
    const args = extract().input("v.mp4").size({ height: 240 }).output("f.png").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=-2:240");
  });

  it("includes thumbnail filter when thumbnail enabled", () => {
    const args = extract().input("v.mp4").thumbnail().output("f.png").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("thumbnail=300");
  });

  it("omits -ss when thumbnail is enabled", () => {
    const args = extract().input("v.mp4").timestamp(5).thumbnail().output("f.png").toArgs();
    expect(args).not.toContain("-ss");
  });

  it("throws when percentage timestamp used in toArgs() without duration context", () => {
    expect(() => extract().input("v.mp4").timestamp("50%").output("f.png").toArgs()).toThrow();
  });

  // Validation

  it("throws when input is missing", () => {
    expect(() => extract().output("f.png").toArgs()).toThrow();
  });

  it("throws when output is missing", () => {
    expect(() => extract().input("v.mp4").toArgs()).toThrow();
  });
});

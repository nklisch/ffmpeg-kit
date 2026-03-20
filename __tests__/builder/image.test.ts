import { describe, expect, it } from "vitest";
import { image } from "../../src/operations/image/image.ts";

describe("ImageBuilder", () => {
  // Image sequence

  it("produces -framerate before -i for image sequence", () => {
    const args = image().imageSequence("frame_%04d.png", { fps: 30 }).output("out.mp4").toArgs();
    const frIdx = args.indexOf("-framerate");
    const iIdx = args.indexOf("-i");
    expect(frIdx).toBeGreaterThanOrEqual(0);
    expect(frIdx).toBeLessThan(iIdx);
    expect(args[frIdx + 1]).toBe("30");
  });

  it("uses input pattern from imageSequence", () => {
    const args = image().imageSequence("frame_%04d.png").output("out.mp4").toArgs();
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toBe("frame_%04d.png");
  });

  it("includes -start_number when set", () => {
    const args = image()
      .imageSequence("frame_%04d.png", { startNumber: 10 })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-start_number");
    const snIdx = args.indexOf("-start_number");
    expect(args[snIdx + 1]).toBe("10");
  });

  it("includes -pix_fmt when set", () => {
    const args = image()
      .imageSequence("frame_%04d.png", { pixelFormat: "yuv420p" })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
  });

  // Format conversion

  it("produces -c:v mjpeg for jpg conversion", () => {
    const args = image().input("img.png").convert("jpg").output("out.jpg").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("mjpeg");
  });

  it("produces -c:v libwebp for webp conversion", () => {
    const args = image().input("img.png").convert("webp").output("out.webp").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libwebp");
  });

  it("produces -frames:v 1 for single image output", () => {
    const args = image().input("img.png").convert("jpg").output("out.jpg").toArgs();
    const fvIdx = args.indexOf("-frames:v");
    expect(fvIdx).toBeGreaterThanOrEqual(0);
    expect(args[fvIdx + 1]).toBe("1");
  });

  // Resize

  it("produces -vf scale=W:H for resize with both dimensions", () => {
    const args = image()
      .input("img.png")
      .resize({ width: 640, height: 480 })
      .output("out.png")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=640:480");
  });

  it("uses -2 for auto-aspect when only width set", () => {
    const args = image().input("img.png").resize({ width: 640 }).output("out.png").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("scale=640:-2");
  });

  it("uses -2 for auto-aspect when only height set", () => {
    const args = image().input("img.png").resize({ height: 480 }).output("out.png").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("scale=-2:480");
  });

  // To video

  it("produces -loop 1 before -i for toVideo", () => {
    const args = image().input("img.jpg").toVideo({ duration: 5 }).output("out.mp4").toArgs();
    const loopIdx = args.indexOf("-loop");
    const iIdx = args.indexOf("-i");
    expect(loopIdx).toBeGreaterThanOrEqual(0);
    expect(args[loopIdx + 1]).toBe("1");
    expect(loopIdx).toBeLessThan(iIdx);
  });

  it("produces -t {duration} for toVideo", () => {
    const args = image().input("img.jpg").toVideo({ duration: 5 }).output("out.mp4").toArgs();
    const tIdx = args.indexOf("-t");
    expect(tIdx).toBeGreaterThanOrEqual(0);
    expect(args[tIdx + 1]).toBe("5");
  });

  it("produces -r {fps} for toVideo when fps set", () => {
    const args = image()
      .input("img.jpg")
      .toVideo({ duration: 5, fps: 30 })
      .output("out.mp4")
      .toArgs();
    const rIdx = args.indexOf("-r");
    expect(rIdx).toBeGreaterThanOrEqual(0);
    expect(args[rIdx + 1]).toBe("30");
  });

  it("does not include -r when fps not set in toVideo", () => {
    const args = image().input("img.jpg").toVideo({ duration: 5 }).output("out.mp4").toArgs();
    expect(args).not.toContain("-r");
  });

  // Test pattern

  it("produces -f lavfi -i testsrc2=... for test pattern", () => {
    const args = image()
      .testPattern({ type: "testsrc2", width: 1920, height: 1080, duration: 5 })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-f");
    expect(args).toContain("lavfi");
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toContain("testsrc2=");
    expect(args[iIdx + 1]).toContain("1920x1080");
    expect(args[iIdx + 1]).toContain("duration=5");
  });

  it("produces -f lavfi -i smptebars=... for smptebars", () => {
    const args = image()
      .testPattern({ type: "smptebars", width: 640, height: 480, duration: 2 })
      .output("out.mp4")
      .toArgs();
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toContain("smptebars=");
  });

  it("includes size, rate, duration in lavfi source", () => {
    const args = image()
      .testPattern({ type: "testsrc", width: 640, height: 480, duration: 3, fps: 30 })
      .output("out.mp4")
      .toArgs();
    const iIdx = args.indexOf("-i");
    const src = args[iIdx + 1];
    expect(src).toContain("640x480");
    expect(src).toContain("rate=30");
    expect(src).toContain("duration=3");
  });

  // Solid color

  it("produces -f lavfi -i color=c={color}:... for solidColor", () => {
    const args = image()
      .solidColor({ color: "red", width: 640, height: 480, duration: 3 })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("lavfi");
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toContain("color=c=red");
    expect(args[iIdx + 1]).toContain("640x480");
    expect(args[iIdx + 1]).toContain("duration=3");
  });

  // Silent audio

  it("produces -f lavfi -i anullsrc=... for silentAudio", () => {
    const args = image().silentAudio({ duration: 5 }).output("out.aac").toArgs();
    expect(args).toContain("lavfi");
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toContain("anullsrc=");
  });

  it("produces -t {duration} for silent audio", () => {
    const args = image().silentAudio({ duration: 5 }).output("out.aac").toArgs();
    const tIdx = args.indexOf("-t");
    expect(tIdx).toBeGreaterThanOrEqual(0);
    expect(args[tIdx + 1]).toBe("5");
  });

  it("maps channels to channel layout string - mono", () => {
    const args = image().silentAudio({ duration: 2, channels: 1 }).output("out.aac").toArgs();
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toContain("mono");
  });

  it("maps channels to channel layout string - stereo (default)", () => {
    const args = image().silentAudio({ duration: 2 }).output("out.aac").toArgs();
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toContain("stereo");
  });

  it("uses custom sample rate for silentAudio", () => {
    const args = image().silentAudio({ duration: 2, sampleRate: 44100 }).output("out.aac").toArgs();
    const iIdx = args.indexOf("-i");
    expect(args[iIdx + 1]).toContain("r=44100");
  });

  // Composition

  it("combines resize with convert", () => {
    const args = image()
      .input("img.png")
      .resize({ width: 640 })
      .convert("jpg")
      .output("out.jpg")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=640:-2");
    expect(args).toContain("mjpeg");
  });

  it("combines resize with toVideo", () => {
    const args = image()
      .input("img.jpg")
      .toVideo({ duration: 5 })
      .resize({ width: 1280 })
      .output("out.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("scale=1280:-2");
  });

  // Validation

  it("throws when input is missing for standard operations", () => {
    expect(() => image().output("out.png").toArgs()).toThrow();
  });

  it("does not require input for testPattern", () => {
    expect(() =>
      image()
        .testPattern({ type: "testsrc2", width: 640, height: 480, duration: 2 })
        .output("out.mp4")
        .toArgs(),
    ).not.toThrow();
  });

  it("does not require input for solidColor", () => {
    expect(() =>
      image()
        .solidColor({ color: "blue", width: 320, height: 240, duration: 1 })
        .output("out.mp4")
        .toArgs(),
    ).not.toThrow();
  });

  it("does not require input for silentAudio", () => {
    expect(() => image().silentAudio({ duration: 2 }).output("out.aac").toArgs()).not.toThrow();
  });

  it("throws when output is missing", () => {
    expect(() => image().input("img.png").toArgs()).toThrow();
  });
});

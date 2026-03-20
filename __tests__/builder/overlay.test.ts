import { describe, expect, it } from "vitest";
import { overlay } from "../../src/operations/video/overlay.ts";

describe("overlay()", () => {
  // --- Validation ---

  it("throws when base is missing", () => {
    expect(() => overlay().addOverlay({ input: "img.png" }).output("out.mp4").toArgs()).toThrow(
      /base/,
    );
  });

  it("throws when no overlays added", () => {
    expect(() => overlay().base("vid.mp4").output("out.mp4").toArgs()).toThrow(/addOverlay/);
  });

  it("throws when output is missing", () => {
    expect(() => overlay().base("vid.mp4").addOverlay({ input: "img.png" }).toArgs()).toThrow(
      /output/,
    );
  });

  // --- Basic args structure ---

  it("produces -y as first arg", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png" })
      .output("out.mp4")
      .toArgs();
    expect(args[0]).toBe("-y");
  });

  it("produces -i for base and -i for overlay input", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png" })
      .output("out.mp4")
      .toArgs();
    const iIdxs = args.reduce<number[]>((acc, val, idx) => {
      if (val === "-i") acc.push(idx);
      return acc;
    }, []);
    expect(iIdxs).toHaveLength(2);
    expect(args[iIdxs[0]! + 1]).toBe("vid.mp4");
    expect(args[iIdxs[1]! + 1]).toBe("img.png");
  });

  it("produces -filter_complex with overlay filter", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png" })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    expect(args[fcIdx + 1]).toContain("overlay");
  });

  it("maps base audio via -map 0:a?", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png" })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-map");
    expect(args).toContain("0:a?");
  });

  it("maps video output via -map [vout]", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png" })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("[vout]");
  });

  // --- Position calculation ---

  it("maps top-left anchor to x=0:y=0", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", anchor: "top-left" })
      .output("out.mp4")
      .toArgs();
    const fcIdx = args.indexOf("-filter_complex");
    const fc = args[fcIdx + 1]!;
    expect(fc).toContain("x=0");
    expect(fc).toContain("y=0");
  });

  it("maps center anchor to x=(W-w)/2:y=(H-h)/2 expressions", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", anchor: "center" })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("x=(W-w)/2");
    expect(fc).toContain("y=(H-h)/2");
  });

  it("maps bottom-right anchor with margin", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", anchor: "bottom-right", margin: 20 })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("W-w-20");
    expect(fc).toContain("H-h-20");
  });

  it("uses explicit x/y position when provided", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", position: { x: 100, y: 50 } })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("x=100");
    expect(fc).toContain("y=50");
  });

  // --- Filter complex construction ---

  it("chains multiple overlays sequentially", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img1.png" })
      .addOverlay({ input: "img2.png" })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    // Should have stage0 (intermediate) and vout (final)
    expect(fc).toContain("stage0");
    expect(fc).toContain("vout");
    // Should have 3 -i flags (base + 2 overlays)
    const iCount = args.filter((a) => a === "-i").length;
    expect(iCount).toBe(3);
  });

  it("applies scale filter before overlay for numeric scale", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", scale: { width: 200, height: 100 } })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("scale=200:100");
  });

  it("applies opacity via colorchannelmixer", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", opacity: 0.5 })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("colorchannelmixer=aa=0.5");
    expect(fc).toContain("format=rgba");
  });

  it("applies chromakey filter", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({
        input: "green.mp4",
        chromaKey: { color: "0x00FF00", similarity: 0.3, blend: 0.1 },
      })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("chromakey=0x00FF00:0.3:0.1");
  });

  it("applies colorkey filter", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "blue.png", colorKey: { color: "blue", similarity: 0.2, blend: 0.0 } })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("colorkey=blue:0.2:0");
  });

  it("applies time-based enable expression for startTime/endTime", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", startTime: 2, endTime: 5 })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("enable='between(t,2,5)'");
  });

  it("computes endTime from startTime + duration", () => {
    const args = overlay()
      .base("vid.mp4")
      .addOverlay({ input: "img.png", startTime: 1, duration: 3 })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("enable='between(t,1,4)'");
  });

  it("throws for unsupported blend mode", () => {
    expect(() =>
      overlay()
        .base("vid.mp4")
        .addOverlay({ input: "img.png", blendMode: "multiply" })
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/blendMode/);
  });

  // --- Shorthands ---

  it("pip() produces scaled overlay with anchor position", () => {
    const args = overlay()
      .base("vid.mp4")
      .pip({ input: "cam.mp4", position: "bottom-right", scale: 0.3, margin: 10 })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("scale=iw*0.3:ih*0.3");
    expect(fc).toContain("W-w-10");
    expect(fc).toContain("H-h-10");
  });

  it("pip() with border produces pad filter", () => {
    const args = overlay()
      .base("vid.mp4")
      .pip({
        input: "cam.mp4",
        position: "top-left",
        scale: 0.25,
        borderWidth: 2,
        borderColor: "white",
      })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("pad=");
    expect(fc).toContain("white");
  });

  it("watermark() produces overlay with default opacity 0.5", () => {
    const args = overlay()
      .base("vid.mp4")
      .watermark({ input: "logo.png", position: "bottom-right" })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("colorchannelmixer=aa=0.5");
  });

  it("watermark() with scale produces expression-based scale", () => {
    const args = overlay()
      .base("vid.mp4")
      .watermark({ input: "logo.png", position: "top-right", scale: 0.2, opacity: 0.8 })
      .output("out.mp4")
      .toArgs();
    const fc = args[args.indexOf("-filter_complex") + 1]!;
    expect(fc).toContain("scale=iw*0.2:ih*0.2");
    expect(fc).toContain("colorchannelmixer=aa=0.8");
  });
});

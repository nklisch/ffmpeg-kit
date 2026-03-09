import { describe, expect, it } from "vitest";
import { text } from "../../src/operations/text.ts";

describe("text()", () => {
  // --- Validation ---

  it("throws when input is missing", () => {
    expect(() => text().addText({ text: "Hello", style: {} }).output("out.mp4").toArgs()).toThrow(
      /input/,
    );
  });

  it("throws when no text/scroll/counter added", () => {
    expect(() => text().input("in.mp4").output("out.mp4").toArgs()).toThrow(
      /addText|scroll|counter/,
    );
  });

  it("throws when output is missing", () => {
    expect(() => text().input("in.mp4").addText({ text: "Hello", style: {} }).toArgs()).toThrow(
      /output/,
    );
  });

  it("throws for toArgs() with counter (needs probing)", () => {
    expect(() =>
      text()
        .input("in.mp4")
        .counter({ start: 0, end: 100, style: {}, position: { x: 10, y: 10 } })
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });

  // --- Basic drawtext ---

  it("produces -y as first arg", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hello", style: {} })
      .output("out.mp4")
      .toArgs();
    expect(args[0]).toBe("-y");
  });

  it("produces -vf drawtext=... for basic text", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hello", style: {} })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-vf");
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("drawtext");
    expect(args[vfIdx + 1]).toContain("Hello");
  });

  it("stream-copies audio with -c:a copy", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hello", style: {} })
      .output("out.mp4")
      .toArgs();
    const idx = args.indexOf("-c:a");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("copy");
  });

  // --- Text escaping ---

  it("escapes colons in text content", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "10:30 PM", style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("\\:");
    expect(vf).not.toMatch(/text='[^']*10:[^\\]/); // unescaped colon not in text
  });

  it("escapes backslashes in text content", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "C:\\path", style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("\\\\");
  });

  // --- Positioning ---

  it("uses x/y directly when provided", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", x: 100, y: 50, style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("x=100");
    expect(vf).toContain("y=50");
  });

  it("maps center anchor to drawtext x/y expressions", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", anchor: "center", style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("x=(w-text_w)/2");
    expect(vf).toContain("y=(h-text_h)/2");
  });

  it("maps bottom-right anchor with default margin 10", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", anchor: "bottom-right", style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("x=w-text_w-10");
    expect(vf).toContain("y=h-text_h-10");
  });

  it("uses custom margin with anchor", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", anchor: "top-right", margin: 20, style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("x=w-text_w-20");
  });

  // --- Style mapping ---

  it("maps fontSize to fontsize parameter", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", style: { fontSize: 48 } })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("fontsize=48");
  });

  it("maps fontColor to fontcolor parameter", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", style: { fontColor: "white" } })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("fontcolor=white");
  });

  it("maps fontFile to fontfile parameter", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", style: { fontFile: "/fonts/arial.ttf" } })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("fontfile=/fonts/arial.ttf");
  });

  it("maps borderWidth/borderColor to borderw/bordercolor", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", style: { borderWidth: 2, borderColor: "black" } })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("borderw=2");
    expect(vf).toContain("bordercolor=black");
  });

  it("maps shadowX/shadowY/shadowColor to shadow params", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", style: { shadowX: 2, shadowY: 2, shadowColor: "gray" } })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("shadowx=2");
    expect(vf).toContain("shadowy=2");
    expect(vf).toContain("shadowcolor=gray");
  });

  it("maps box/boxColor/boxBorderWidth to box params", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", style: { box: true, boxColor: "black@0.5", boxBorderWidth: 5 } })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("box=1");
    expect(vf).toContain("boxcolor=black@0.5");
    expect(vf).toContain("boxborderw=5");
  });

  // --- Time range ---

  it("produces enable=between(t,...) for startTime/endTime", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "Hi", startTime: 2, endTime: 8, style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("enable='between(t,2,8)'");
  });

  // --- Multiple texts ---

  it("chains multiple drawtext filters with commas", () => {
    const args = text()
      .input("in.mp4")
      .addText({ text: "First", style: {} })
      .addText({ text: "Second", style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    // Should have two drawtext filters separated by comma
    const drawtextCount = (vf.match(/drawtext=/g) ?? []).length;
    expect(drawtextCount).toBe(2);
  });

  // --- Scroll ---

  it("produces animated y expression for scroll up", () => {
    const args = text()
      .input("in.mp4")
      .scroll({ text: "Scrolling text", style: {}, direction: "up", speed: 80 })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("drawtext=");
    expect(vf).toContain("y=h-t*80");
  });

  it("produces animated x expression for scroll left", () => {
    const args = text()
      .input("in.mp4")
      .scroll({ text: "Scrolling text", style: {}, direction: "left", speed: 100 })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("x=w-t*100");
  });

  it("scroll defaults to up direction at speed 100", () => {
    const args = text()
      .input("in.mp4")
      .scroll({ text: "Up scroll", style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("y=h-t*100");
  });

  // --- Timecode ---

  it("produces timecode and timecode_rate params", () => {
    const args = text()
      .input("in.mp4")
      .addText({ timecode: "00:00:00:00", timecodeRate: 30, style: {} })
      .output("out.mp4")
      .toArgs();
    const vf = args[args.indexOf("-vf") + 1]!;
    expect(vf).toContain("timecode='00:00:00:00'");
    expect(vf).toContain("timecode_rate=30");
  });
});

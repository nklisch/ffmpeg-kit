import { describe, expect, it } from "vitest";
import { concat } from "../../src/operations/concat.ts";

describe("concat()", () => {
  // --- Validation ---

  it("throws when fewer than 2 clips are added", () => {
    expect(() => concat().addClip("a.mp4").output("out.mp4").toArgs()).toThrow(/at least 2/);
  });

  it("throws when no clips are added", () => {
    expect(() => concat().output("out.mp4").toArgs()).toThrow(/at least 2/);
  });

  it("throws when output() is missing", () => {
    expect(() => concat().addClip("a.mp4").addClip("b.mp4").toArgs()).toThrow();
  });

  // --- Demuxer path ---

  it("produces concat demuxer args for simple concat (no transitions)", () => {
    const args = concat().addClip("a.mp4").addClip("b.mp4").output("out.mp4").toArgs();
    expect(args).toContain("-f");
    expect(args).toContain("concat");
    expect(args).toContain("-safe");
    expect(args).toContain("0");
    expect(args).toContain("-c");
    expect(args).toContain("copy");
    expect(args).toContain("out.mp4");
  });

  it("accepts ClipConfig objects", () => {
    const args = concat()
      .addClip({ path: "a.mp4" })
      .addClip({ path: "b.mp4" })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("concat");
  });

  // --- Filter complex path ---

  it("throws in toArgs() when transitions are used (needs probing)", () => {
    expect(() =>
      concat()
        .addClip("a.mp4")
        .transition({ type: "dissolve", duration: 1 })
        .addClip("b.mp4")
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });

  it("throws in toArgs() when fillSilence is set (needs probing)", () => {
    expect(() =>
      concat()
        .addClip("a.mp4")
        .addClip("b.mp4")
        .fillSilence()
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });

  it("throws in toArgs() when normalizeResolution is set", () => {
    expect(() =>
      concat()
        .addClip("a.mp4")
        .addClip("b.mp4")
        .normalizeResolution(640, 360)
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });

  it("throws in toArgs() when per-clip trimming is used", () => {
    expect(() =>
      concat()
        .addClip({ path: "a.mp4", trimStart: 0.5 })
        .addClip("b.mp4")
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });

  // --- Transition assignment ---

  it("transition() throws when called before addClip()", () => {
    expect(() =>
      concat().transition({ type: "fade" }),
    ).toThrow(/after addClip/);
  });

  it("transition() sets transitionAfter on the last added clip", () => {
    // If transition is set, toArgs() should throw for filter_complex
    // which proves the transition was recorded
    expect(() =>
      concat()
        .addClip("a.mp4")
        .transition({ type: "wipeleft", duration: 0.5 })
        .addClip("b.mp4")
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });

  // --- Normalization flags ---

  it("falls back to filter_complex when normalizeResolution is set", () => {
    expect(() =>
      concat()
        .addClip("a.mp4")
        .addClip("b.mp4")
        .normalizeResolution(640, 360)
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });

  it("falls back to filter_complex when normalizeFps is set", () => {
    expect(() =>
      concat()
        .addClip("a.mp4")
        .addClip("b.mp4")
        .normalizeFps(30)
        .output("out.mp4")
        .toArgs(),
    ).toThrow(/execute/);
  });
});

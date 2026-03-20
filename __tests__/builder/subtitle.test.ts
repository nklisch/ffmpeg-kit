import { describe, expect, it } from "vitest";
import { subtitle } from "../../src/operations/video/subtitle.ts";

describe("SubtitleBuilder", () => {
  // Soft sub

  it("produces -c:v copy -c:a copy -c:s mov_text for mp4 output", () => {
    const args = subtitle().input("v.mp4").softSub({ path: "sub.srt" }).output("out.mp4").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    expect(args).toContain("-c:a");
    expect(args).toContain("-c:s");
    expect(args).toContain("mov_text");
  });

  it("produces -c:s srt for mkv output", () => {
    const args = subtitle().input("v.mp4").softSub({ path: "sub.srt" }).output("out.mkv").toArgs();
    expect(args).toContain("-c:s");
    expect(args).toContain("srt");
  });

  it("produces -c:s ass for mkv output with ass subtitle", () => {
    const args = subtitle().input("v.mp4").softSub({ path: "sub.ass" }).output("out.mkv").toArgs();
    expect(args).toContain("-c:s");
    expect(args).toContain("ass");
  });

  it("produces -c:s webvtt for webm output", () => {
    const args = subtitle().input("v.mp4").softSub({ path: "sub.srt" }).output("out.webm").toArgs();
    expect(args).toContain("-c:s");
    expect(args).toContain("webvtt");
  });

  it("adds -i for the subtitle file", () => {
    const args = subtitle().input("v.mp4").softSub({ path: "sub.srt" }).output("out.mp4").toArgs();
    const inputs = args.filter((_, i) => i > 0 && args[i - 1] === "-i");
    expect(inputs).toContain("v.mp4");
    expect(inputs).toContain("sub.srt");
  });

  it("produces -map flags for video, audio, and subtitle", () => {
    const args = subtitle().input("v.mp4").softSub({ path: "sub.srt" }).output("out.mp4").toArgs();
    expect(args).toContain("-map");
    expect(args).toContain("0:v");
    expect(args).toContain("0:a");
    expect(args).toContain("1:s");
  });

  it("accumulates multiple softSub calls", () => {
    const args = subtitle()
      .input("v.mp4")
      .softSub({ path: "sub1.srt" })
      .softSub({ path: "sub2.srt" })
      .output("out.mp4")
      .toArgs();
    const inputs = args.filter((_, i) => i > 0 && args[i - 1] === "-i");
    expect(inputs).toContain("sub1.srt");
    expect(inputs).toContain("sub2.srt");
    expect(args).toContain("2:s");
  });

  it("produces -metadata:s:s:N language=... for language", () => {
    const args = subtitle()
      .input("v.mp4")
      .softSub({ path: "sub.srt", language: "eng" })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-metadata:s:s:0");
    const metaIdx = args.indexOf("-metadata:s:s:0");
    expect(args[metaIdx + 1]).toBe("language=eng");
  });

  it("produces -metadata:s:s:N title=... for title", () => {
    const args = subtitle()
      .input("v.mp4")
      .softSub({ path: "sub.srt", title: "English" })
      .output("out.mp4")
      .toArgs();
    const metaIdx = args.indexOf("-metadata:s:s:0");
    expect(metaIdx).toBeGreaterThanOrEqual(0);
    expect(args[metaIdx + 1]).toBe("title=English");
  });

  it("produces -disposition:s:N default for default flag", () => {
    const args = subtitle()
      .input("v.mp4")
      .softSub({ path: "sub.srt", default: true })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-disposition:s:0");
    const dispIdx = args.indexOf("-disposition:s:0");
    expect(args[dispIdx + 1]).toBe("default");
  });

  it("produces -disposition:s:N forced for forced flag", () => {
    const args = subtitle()
      .input("v.mp4")
      .softSub({ path: "sub.srt", forced: true })
      .output("out.mp4")
      .toArgs();
    const dispIdx = args.indexOf("-disposition:s:0");
    expect(args[dispIdx + 1]).toBe("forced");
  });

  // Hard burn

  it("produces -vf subtitles=path for hard burn", () => {
    const args = subtitle().input("v.mp4").hardBurn({ path: "sub.srt" }).output("out.mp4").toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(vfIdx).toBeGreaterThanOrEqual(0);
    expect(args[vfIdx + 1]).toContain("subtitles=sub.srt");
  });

  it("escapes colons in subtitle path", () => {
    const args = subtitle()
      .input("v.mp4")
      .hardBurn({ path: "C:/path/sub.srt" })
      .output("out.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("\\:");
  });

  it("includes force_style when set", () => {
    const args = subtitle()
      .input("v.mp4")
      .hardBurn({ path: "sub.srt", forceStyle: "FontSize=24" })
      .output("out.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("force_style='FontSize=24'");
  });

  it("includes charenc when set", () => {
    const args = subtitle()
      .input("v.mp4")
      .hardBurn({ path: "sub.srt", charEncoding: "UTF-8" })
      .output("out.mp4")
      .toArgs();
    const vfIdx = args.indexOf("-vf");
    expect(args[vfIdx + 1]).toContain("charenc=UTF-8");
  });

  it("uses DEFAULT_VIDEO_CODEC_ARGS for hard burn", () => {
    const args = subtitle().input("v.mp4").hardBurn({ path: "sub.srt" }).output("out.mp4").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-preset");
    expect(args).toContain("ultrafast");
  });

  it("stream-copies audio with -c:a copy for hard burn", () => {
    const args = subtitle().input("v.mp4").hardBurn({ path: "sub.srt" }).output("out.mp4").toArgs();
    // find -c:a after -vf section
    const caIdx = args.lastIndexOf("-c:a");
    expect(caIdx).toBeGreaterThanOrEqual(0);
    expect(args[caIdx + 1]).toBe("copy");
  });

  // Extract

  it("produces -map 0:{index} for extract", () => {
    const args = subtitle()
      .input("v.mp4")
      .extract({ streamIndex: 2, format: "srt" })
      .output("out.srt")
      .toArgs();
    expect(args).toContain("-map");
    expect(args).toContain("0:2");
  });

  it("produces -c:s {format} for extract output codec", () => {
    const args = subtitle()
      .input("v.mp4")
      .extract({ streamIndex: 2, format: "ass" })
      .output("out.ass")
      .toArgs();
    expect(args).toContain("-c:s");
    expect(args).toContain("ass");
  });

  // Convert

  it("does not require input() for convert mode", () => {
    expect(() =>
      subtitle().convert({ inputPath: "sub.ass", outputFormat: "srt" }).output("out.srt").toArgs(),
    ).not.toThrow();
  });

  it("uses config.inputPath as -i for convert", () => {
    const args = subtitle()
      .convert({ inputPath: "sub.ass", outputFormat: "srt" })
      .output("out.srt")
      .toArgs();
    const iIdx = args.indexOf("-i");
    expect(iIdx).toBeGreaterThanOrEqual(0);
    expect(args[iIdx + 1]).toBe("sub.ass");
  });

  it("produces correct -c:s for output format in convert", () => {
    const args = subtitle()
      .convert({ inputPath: "sub.ass", outputFormat: "webvtt" })
      .output("out.vtt")
      .toArgs();
    expect(args).toContain("-c:s");
    expect(args).toContain("webvtt");
  });

  // Validation

  it("throws when input is missing (non-convert mode)", () => {
    expect(() => subtitle().softSub({ path: "sub.srt" }).output("out.mp4").toArgs()).toThrow();
  });

  it("throws when no mode selected", () => {
    expect(() => subtitle().input("v.mp4").output("out.mp4").toArgs()).toThrow();
  });

  it("throws when output is missing", () => {
    expect(() => subtitle().input("v.mp4").softSub({ path: "sub.srt" }).toArgs()).toThrow();
  });
});

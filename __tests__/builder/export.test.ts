import { describe, expect, it } from "vitest";
import { exportVideo } from "../../src/operations/io/export.ts";

describe("exportVideo()", () => {
  // --- Validation ---

  it("throws when input is missing", () => {
    expect(() => exportVideo().output("out.mp4").toArgs()).toThrow(/input/);
  });

  it("throws when output is missing", () => {
    expect(() => exportVideo().input("in.mp4").toArgs()).toThrow(/output/);
  });

  it("throws for toArgs() with twoPass enabled", () => {
    expect(() => exportVideo().input("in.mp4").twoPass().output("out.mp4").toArgs()).toThrow(
      /execute/,
    );
  });

  // --- Default args ---

  it("produces -y as first arg", () => {
    const args = exportVideo().input("in.mp4").output("out.mp4").toArgs();
    expect(args[0]).toBe("-y");
  });

  it("produces output path as last arg", () => {
    const args = exportVideo().input("in.mp4").output("out.mp4").toArgs();
    expect(args[args.length - 1]).toBe("out.mp4");
  });

  it("produces -i flag with input path", () => {
    const args = exportVideo().input("in.mp4").output("out.mp4").toArgs();
    const iIdx = args.indexOf("-i");
    expect(iIdx).toBeGreaterThan(-1);
    expect(args[iIdx + 1]).toBe("in.mp4");
  });

  // --- Preset resolution ---

  it("applies youtube_hd preset defaults (libx264, aac, movflags)", () => {
    const args = exportVideo().input("in.mp4").preset("youtube_hd").output("out.mp4").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
  });

  it("allows overriding preset CRF with explicit crf()", () => {
    const args = exportVideo()
      .input("in.mp4")
      .preset("youtube_hd")
      .crf(30)
      .output("out.mp4")
      .toArgs();
    const crfIdx = args.indexOf("-crf");
    expect(crfIdx).toBeGreaterThan(-1);
    expect(args[crfIdx + 1]).toBe("30");
  });

  it("allows overriding preset audio codec with explicit audioCodec()", () => {
    const args = exportVideo()
      .input("in.mp4")
      .preset("youtube_hd")
      .audioCodec("libopus")
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("libopus");
    expect(args).not.toContain("aac");
  });

  // --- Video codec args ---

  it("produces -c:v for default", () => {
    const args = exportVideo().input("in.mp4").output("out.mp4").toArgs();
    expect(args).toContain("-c:v");
  });

  it("produces -crf flag from crf()", () => {
    const args = exportVideo().input("in.mp4").crf(18).output("out.mp4").toArgs();
    const idx = args.indexOf("-crf");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("18");
  });

  it("produces -b:v flag from videoBitrate()", () => {
    const args = exportVideo().input("in.mp4").videoBitrate("5M").output("out.mp4").toArgs();
    const idx = args.indexOf("-b:v");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("5M");
  });

  it("produces -maxrate flag from maxVideoBitrate()", () => {
    const args = exportVideo().input("in.mp4").maxVideoBitrate("8M").output("out.mp4").toArgs();
    expect(args).toContain("-maxrate");
    expect(args).toContain("8M");
  });

  it("produces -preset flag from encodingPreset()", () => {
    const args = exportVideo().input("in.mp4").encodingPreset("slow").output("out.mp4").toArgs();
    expect(args).toContain("-preset");
    expect(args).toContain("slow");
  });

  it("produces -pix_fmt flag from pixelFormat()", () => {
    const args = exportVideo().input("in.mp4").pixelFormat("yuv422p").output("out.mp4").toArgs();
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv422p");
  });

  it("produces -profile:v flag from profile()", () => {
    const args = exportVideo().input("in.mp4").profile("main").output("out.mp4").toArgs();
    expect(args).toContain("-profile:v");
    expect(args).toContain("main");
  });

  it("produces -level flag from level()", () => {
    const args = exportVideo().input("in.mp4").level("4.0").output("out.mp4").toArgs();
    expect(args).toContain("-level");
    expect(args).toContain("4.0");
  });

  it("produces -tune flag from tune()", () => {
    const args = exportVideo().input("in.mp4").tune("film").output("out.mp4").toArgs();
    expect(args).toContain("-tune");
    expect(args).toContain("film");
  });

  // --- Audio codec args ---

  it("produces -c:a for default", () => {
    const args = exportVideo().input("in.mp4").output("out.mp4").toArgs();
    expect(args).toContain("-c:a");
  });

  it("produces -b:a flag from audioBitrate()", () => {
    const args = exportVideo().input("in.mp4").audioBitrate("320k").output("out.mp4").toArgs();
    const idx = args.indexOf("-b:a");
    expect(idx).toBeGreaterThan(-1);
    expect(args[idx + 1]).toBe("320k");
  });

  it("produces -ar flag from audioSampleRate()", () => {
    const args = exportVideo().input("in.mp4").audioSampleRate(44100).output("out.mp4").toArgs();
    expect(args).toContain("-ar");
    expect(args).toContain("44100");
  });

  it("produces -ac flag from audioChannels()", () => {
    const args = exportVideo().input("in.mp4").audioChannels(1).output("out.mp4").toArgs();
    expect(args).toContain("-ac");
    expect(args).toContain("1");
  });

  // --- Container / format ---

  it("produces -movflags +faststart for mp4 output", () => {
    const args = exportVideo().input("in.mp4").output("out.mp4").toArgs();
    expect(args).toContain("-movflags");
    expect(args).toContain("+faststart");
  });

  it("does not produce faststart for mkv output", () => {
    const args = exportVideo().input("in.mp4").output("out.mkv").toArgs();
    expect(args).not.toContain("+faststart");
  });

  it("produces -f matroska for format('mkv')", () => {
    const args = exportVideo().input("in.mp4").format("mkv").output("out.mkv").toArgs();
    expect(args).toContain("-f");
    expect(args).toContain("matroska");
  });

  it("produces -f webm for format('webm')", () => {
    const args = exportVideo().input("in.mp4").format("webm").output("out.webm").toArgs();
    expect(args).toContain("-f");
    expect(args).toContain("webm");
  });

  it("produces -f mpegts for format('ts')", () => {
    const args = exportVideo().input("in.mp4").format("ts").output("out.ts").toArgs();
    expect(args).toContain("-f");
    expect(args).toContain("mpegts");
  });

  it("faststart(false) disables faststart even for mp4", () => {
    const args = exportVideo().input("in.mp4").faststart(false).output("out.mp4").toArgs();
    expect(args).not.toContain("+faststart");
  });

  it("faststart(true) enables faststart for non-mp4 container", () => {
    const args = exportVideo().input("in.mp4").faststart(true).output("out.mkv").toArgs();
    expect(args).toContain("+faststart");
  });

  // --- Inputs ---

  it("produces separate -i flags for videoInput + audioInput", () => {
    const args = exportVideo()
      .videoInput("vid.mp4")
      .audioInput("aud.wav")
      .output("out.mp4")
      .toArgs();
    const iFlags = args.reduce<number[]>((acc, val, idx) => {
      if (val === "-i") acc.push(idx);
      return acc;
    }, []);
    expect(iFlags).toHaveLength(2);
    expect(args[iFlags[0]! + 1]).toBe("vid.mp4");
    expect(args[iFlags[1]! + 1]).toBe("aud.wav");
  });

  it("produces -map 0:v:0 and -map 1:a:0 for separate inputs", () => {
    const args = exportVideo()
      .videoInput("vid.mp4")
      .audioInput("aud.wav")
      .output("out.mp4")
      .toArgs();
    const mapIdxs = args.reduce<number[]>((acc, val, idx) => {
      if (val === "-map") acc.push(idx);
      return acc;
    }, []);
    expect(mapIdxs).toHaveLength(2);
    expect(args[mapIdxs[0]! + 1]).toBe("0:v:0");
    expect(args[mapIdxs[1]! + 1]).toBe("1:a:0");
  });

  it("produces custom -map flags from map()", () => {
    const args = exportVideo().input("in.mp4").map(["0:v:0", "0:a:1"]).output("out.mp4").toArgs();
    expect(args).toContain("-map");
    expect(args).toContain("0:v:0");
    expect(args).toContain("0:a:1");
  });

  // --- Metadata ---

  it("produces -metadata flags from metadata()", () => {
    const args = exportVideo()
      .input("in.mp4")
      .metadata({ title: "Test Video", artist: "Tester" })
      .output("out.mp4")
      .toArgs();
    expect(args).toContain("-metadata");
    expect(args).toContain("title=Test Video");
    expect(args).toContain("artist=Tester");
  });

  // --- Extra args ---

  it("appends outputArgs before output path", () => {
    const args = exportVideo().input("in.mp4").outputArgs(["-shortest"]).output("out.mp4").toArgs();
    const shortestIdx = args.indexOf("-shortest");
    const outIdx = args.indexOf("out.mp4");
    expect(shortestIdx).toBeGreaterThan(-1);
    expect(shortestIdx).toBeLessThan(outIdx);
  });

  it("prepends inputArgs before -i", () => {
    const args = exportVideo().input("in.mp4").inputArgs(["-re"]).output("out.mp4").toArgs();
    const reIdx = args.indexOf("-re");
    const iIdx = args.indexOf("-i");
    expect(reIdx).toBeGreaterThan(-1);
    expect(reIdx).toBeLessThan(iIdx);
  });

  // --- videoCodec explicit ---

  it("produces correct codec from videoCodec()", () => {
    const args = exportVideo().input("in.mp4").videoCodec("libvpx-vp9").output("out.webm").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libvpx-vp9");
  });

  // --- Chapters (only available via execute, not toArgs) ---

  it("chapters() does not add chapter args in toArgs() (requires execute for temp file)", () => {
    const args = exportVideo()
      .input("in.mp4")
      .chapters([
        { start: 0, end: 60, title: "Intro" },
        { start: 60, end: 120, title: "Main" },
      ])
      .output("out.mp4")
      .toArgs();
    // Chapters require a temp file written during execute(), so toArgs() should not include them
    expect(args).not.toContain("-map_metadata");
  });

  // --- audioSampleRate as string in args ---

  it("produces -ar as string value from audioSampleRate()", () => {
    const args = exportVideo().input("in.mp4").audioSampleRate(48000).output("out.mp4").toArgs();
    const arIdx = args.indexOf("-ar");
    expect(arIdx).toBeGreaterThan(-1);
    expect(args[arIdx + 1]).toBe("48000");
  });
});

import { describe, expect, it } from "vitest";
import { dash, hls } from "../../src/operations/video/streaming.ts";

describe("HlsBuilder", () => {
  it("produces -f hls with default segment duration", () => {
    const args = hls().input("v.mp4").output("out.m3u8").toArgs();
    expect(args).toContain("-f");
    expect(args).toContain("hls");
    expect(args).toContain("-hls_time");
    expect(args).toContain("2");
  });

  it("produces -hls_time from segmentDuration()", () => {
    const args = hls().input("v.mp4").segmentDuration(4).output("out.m3u8").toArgs();
    const idx = args.indexOf("-hls_time");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("4");
  });

  it("produces -hls_list_size 0 by default", () => {
    const args = hls().input("v.mp4").output("out.m3u8").toArgs();
    const idx = args.indexOf("-hls_list_size");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("0");
  });

  it("produces -hls_list_size from listSize()", () => {
    const args = hls().input("v.mp4").listSize(5).output("out.m3u8").toArgs();
    const idx = args.indexOf("-hls_list_size");
    expect(args[idx + 1]).toBe("5");
  });

  it("produces -hls_segment_filename from segmentFilename()", () => {
    const args = hls().input("v.mp4").segmentFilename("seg_%03d.ts").output("out.m3u8").toArgs();
    expect(args).toContain("-hls_segment_filename");
    expect(args).toContain("seg_%03d.ts");
  });

  it("produces default segment filename for mpegts", () => {
    const args = hls().input("v.mp4").output("out.m3u8").toArgs();
    expect(args).toContain("-hls_segment_filename");
    expect(args).toContain("segment_%03d.ts");
  });

  it("produces -hls_segment_type fmp4 for fmp4", () => {
    const args = hls().input("v.mp4").segmentType("fmp4").output("out.m3u8").toArgs();
    expect(args).toContain("-hls_segment_type");
    expect(args).toContain("fmp4");
  });

  it("produces -hls_fmp4_init_filename for fmp4 init", () => {
    const args = hls().input("v.mp4").segmentType("fmp4").output("out.m3u8").toArgs();
    expect(args).toContain("-hls_fmp4_init_filename");
    expect(args).toContain("init.mp4");
  });

  it("uses custom init filename for fmp4", () => {
    const args = hls()
      .input("v.mp4")
      .segmentType("fmp4")
      .initFilename("custom_init.mp4")
      .output("out.m3u8")
      .toArgs();
    expect(args).toContain("custom_init.mp4");
  });

  it("produces default segment filename for fmp4", () => {
    const args = hls().input("v.mp4").segmentType("fmp4").output("out.m3u8").toArgs();
    expect(args).toContain("segment_%03d.m4s");
  });

  it("produces -hls_playlist_type from playlistType()", () => {
    const args = hls().input("v.mp4").playlistType("vod").output("out.m3u8").toArgs();
    expect(args).toContain("-hls_playlist_type");
    expect(args).toContain("vod");
  });

  it("produces -hls_base_url from baseUrl()", () => {
    const args = hls()
      .input("v.mp4")
      .baseUrl("https://cdn.example.com/")
      .output("out.m3u8")
      .toArgs();
    expect(args).toContain("-hls_base_url");
    expect(args).toContain("https://cdn.example.com/");
  });

  it("joins flags with + for -hls_flags", () => {
    const args = hls()
      .input("v.mp4")
      .flags(["independent_segments", "program_date_time"])
      .output("out.m3u8")
      .toArgs();
    expect(args).toContain("-hls_flags");
    const flagsIdx = args.indexOf("-hls_flags");
    expect(args[flagsIdx + 1]).toBe("independent_segments+program_date_time");
  });

  it("produces video codec args", () => {
    const args = hls().input("v.mp4").videoCodec("libx264").output("out.m3u8").toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
  });

  it("produces -crf from crf()", () => {
    const args = hls().input("v.mp4").crf(23).output("out.m3u8").toArgs();
    expect(args).toContain("-crf");
    expect(args).toContain("23");
  });

  it("produces audio codec args", () => {
    const args = hls()
      .input("v.mp4")
      .audioCodec("aac")
      .audioBitrate("192k")
      .output("out.m3u8")
      .toArgs();
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-b:a");
    expect(args).toContain("192k");
  });

  it("produces -hls_key_info_file from encrypt()", () => {
    const args = hls()
      .input("v.mp4")
      .encrypt({ keyInfoFile: "key.keyinfo" })
      .output("out.m3u8")
      .toArgs();
    expect(args).toContain("-hls_key_info_file");
    expect(args).toContain("key.keyinfo");
  });

  it("throws for variants() (not yet supported)", () => {
    expect(() =>
      hls()
        .input("v.mp4")
        .variants([
          { videoBitrate: "1M", audioBitrate: "128k", resolution: { width: 1280, height: 720 } },
        ]),
    ).toThrow();
  });

  it("throws when input is missing", () => {
    expect(() => hls().output("out.m3u8").toArgs()).toThrow();
  });

  it("throws when output is missing", () => {
    expect(() => hls().input("v.mp4").toArgs()).toThrow();
  });
});

describe("DashBuilder", () => {
  it("produces -f dash with default adaptation sets", () => {
    const args = dash().input("v.mp4").output("out.mpd").toArgs();
    expect(args).toContain("-f");
    expect(args).toContain("dash");
    expect(args).toContain("-adaptation_sets");
    expect(args).toContain("id=0,streams=v id=1,streams=a");
  });

  it("produces -seg_duration from segmentDuration()", () => {
    const args = dash().input("v.mp4").segmentDuration(4).output("out.mpd").toArgs();
    expect(args).toContain("-seg_duration");
    const idx = args.indexOf("-seg_duration");
    expect(args[idx + 1]).toBe("4");
  });

  it("produces -adaptation_sets from adaptationSets()", () => {
    const args = dash().input("v.mp4").adaptationSets("id=0,streams=v").output("out.mpd").toArgs();
    const idx = args.indexOf("-adaptation_sets");
    expect(args[idx + 1]).toBe("id=0,streams=v");
  });

  it("produces -init_seg_name from initSegName()", () => {
    const args = dash()
      .input("v.mp4")
      .initSegName("init_$RepresentationID$.mp4")
      .output("out.mpd")
      .toArgs();
    expect(args).toContain("-init_seg_name");
    expect(args).toContain("init_$RepresentationID$.mp4");
  });

  it("produces -media_seg_name from mediaSegName()", () => {
    const args = dash()
      .input("v.mp4")
      .mediaSegName("chunk_$RepresentationID$_$Number%05d$.m4s")
      .output("out.mpd")
      .toArgs();
    expect(args).toContain("-media_seg_name");
  });

  it("produces -use_template 1 by default", () => {
    const args = dash().input("v.mp4").output("out.mpd").toArgs();
    expect(args).toContain("-use_template");
    const idx = args.indexOf("-use_template");
    expect(args[idx + 1]).toBe("1");
  });

  it("produces -use_template 1 from useTemplate(true)", () => {
    const args = dash().input("v.mp4").useTemplate(true).output("out.mpd").toArgs();
    const idx = args.indexOf("-use_template");
    expect(args[idx + 1]).toBe("1");
  });

  it("produces -use_timeline 1 from useTimeline()", () => {
    const args = dash().input("v.mp4").useTimeline(true).output("out.mpd").toArgs();
    const idx = args.indexOf("-use_timeline");
    expect(args[idx + 1]).toBe("1");
  });

  it("produces -single_file 1 from singleFile()", () => {
    const args = dash().input("v.mp4").singleFile(true).output("out.mpd").toArgs();
    expect(args).toContain("-single_file");
    const idx = args.indexOf("-single_file");
    expect(args[idx + 1]).toBe("1");
  });

  it("does not include -single_file when not set", () => {
    const args = dash().input("v.mp4").output("out.mpd").toArgs();
    expect(args).not.toContain("-single_file");
  });

  it("produces video/audio codec args", () => {
    const args = dash()
      .input("v.mp4")
      .videoCodec("libx264")
      .audioCodec("aac")
      .output("out.mpd")
      .toArgs();
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
  });

  it("throws when input is missing", () => {
    expect(() => dash().output("out.mpd").toArgs()).toThrow();
  });

  it("throws when output is missing", () => {
    expect(() => dash().input("v.mp4").toArgs()).toThrow();
  });
});

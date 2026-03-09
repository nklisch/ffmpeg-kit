import { describe, expect, it } from "vitest";
import {
  CODEC_REGISTRY,
  classifyCodecFamily,
  getCodecFamily,
  getCpuEncoder,
  getDefaultAudioCodec,
  getEncoderForMode,
} from "../../src/encoding/codecs.ts";

describe("getEncoderForMode", () => {
  it("returns h264_nvenc for h264 + nvidia", () => {
    expect(getEncoderForMode("h264", "nvidia")).toBe("h264_nvenc");
  });

  it("returns libx264 for h264 + cpu", () => {
    expect(getEncoderForMode("h264", "cpu")).toBe("libx264");
  });

  it("returns h264_vaapi for h264 + vaapi", () => {
    expect(getEncoderForMode("h264", "vaapi")).toBe("h264_vaapi");
  });

  it("returns h264_qsv for h264 + qsv", () => {
    expect(getEncoderForMode("h264", "qsv")).toBe("h264_qsv");
  });

  it("returns hevc_nvenc for hevc + nvidia", () => {
    expect(getEncoderForMode("hevc", "nvidia")).toBe("hevc_nvenc");
  });

  it("returns av1_nvenc for av1 + nvidia", () => {
    expect(getEncoderForMode("av1", "nvidia")).toBe("av1_nvenc");
  });

  it("falls back to CPU encoder when no hw encoder exists for family+mode", () => {
    // prores has no nvidia encoder
    expect(getEncoderForMode("prores", "nvidia")).toBe("prores_ks");
  });

  it("falls back to CPU encoder for vp8 + nvidia", () => {
    expect(getEncoderForMode("vp8", "nvidia")).toBe("libvpx");
  });

  it("throws for auto mode", () => {
    expect(() => getEncoderForMode("h264", "auto")).toThrow();
  });

  it("returns correct encoders for all families on cpu", () => {
    expect(getEncoderForMode("h264", "cpu")).toBe("libx264");
    expect(getEncoderForMode("hevc", "cpu")).toBe("libx265");
    expect(getEncoderForMode("av1", "cpu")).toBe("libsvtav1");
    expect(getEncoderForMode("vp9", "cpu")).toBe("libvpx-vp9");
    expect(getEncoderForMode("vp8", "cpu")).toBe("libvpx");
    expect(getEncoderForMode("prores", "cpu")).toBe("prores_ks");
  });
});

describe("getCpuEncoder", () => {
  it("returns libx264 for h264", () => {
    expect(getCpuEncoder("h264")).toBe("libx264");
  });

  it("returns libx265 for hevc", () => {
    expect(getCpuEncoder("hevc")).toBe("libx265");
  });

  it("returns libsvtav1 for av1", () => {
    expect(getCpuEncoder("av1")).toBe("libsvtav1");
  });

  it("returns libvpx-vp9 for vp9", () => {
    expect(getCpuEncoder("vp9")).toBe("libvpx-vp9");
  });

  it("returns libvpx for vp8", () => {
    expect(getCpuEncoder("vp8")).toBe("libvpx");
  });

  it("returns prores_ks for prores", () => {
    expect(getCpuEncoder("prores")).toBe("prores_ks");
  });
});

describe("getCodecFamily", () => {
  it("returns h264 for h264_nvenc", () => {
    expect(getCodecFamily("h264_nvenc")).toBe("h264");
  });

  it("returns h264 for libx264", () => {
    expect(getCodecFamily("libx264")).toBe("h264");
  });

  it("returns hevc for libx265", () => {
    expect(getCodecFamily("libx265")).toBe("hevc");
  });

  it("returns hevc for hevc_nvenc", () => {
    expect(getCodecFamily("hevc_nvenc")).toBe("hevc");
  });

  it("returns av1 for libsvtav1", () => {
    expect(getCodecFamily("libsvtav1")).toBe("av1");
  });

  it("returns av1 for av1_nvenc", () => {
    expect(getCodecFamily("av1_nvenc")).toBe("av1");
  });

  it("returns vp9 for libvpx-vp9", () => {
    expect(getCodecFamily("libvpx-vp9")).toBe("vp9");
  });

  it("returns vp8 for libvpx", () => {
    expect(getCodecFamily("libvpx")).toBe("vp8");
  });

  it("returns null for unknown encoder", () => {
    expect(getCodecFamily("dnxhd")).toBeNull();
    expect(getCodecFamily("copy")).toBeNull();
  });
});

describe("getDefaultAudioCodec", () => {
  it("returns libopus for webm", () => {
    expect(getDefaultAudioCodec("webm")).toBe("libopus");
  });

  it("returns libmp3lame for avi", () => {
    expect(getDefaultAudioCodec("avi")).toBe("libmp3lame");
  });

  it("returns aac for mp4", () => {
    expect(getDefaultAudioCodec("mp4")).toBe("aac");
  });

  it("returns aac for mov", () => {
    expect(getDefaultAudioCodec("mov")).toBe("aac");
  });

  it("returns aac for mkv", () => {
    expect(getDefaultAudioCodec("mkv")).toBe("aac");
  });

  it("returns aac for ts", () => {
    expect(getDefaultAudioCodec("ts")).toBe("aac");
  });

  it("returns aac for flv", () => {
    expect(getDefaultAudioCodec("flv")).toBe("aac");
  });
});

describe("classifyCodecFamily", () => {
  it("classifies hw encoder names by family", () => {
    expect(classifyCodecFamily("h264_nvenc")).toBe("h264");
    expect(classifyCodecFamily("hevc_vaapi")).toBe("hevc");
    expect(classifyCodecFamily("av1_qsv")).toBe("av1");
    expect(classifyCodecFamily("vp9_vaapi")).toBe("vp9");
  });

  it("classifies hw decoder names by family", () => {
    expect(classifyCodecFamily("h264_cuvid")).toBe("h264");
    expect(classifyCodecFamily("hevc_cuvid")).toBe("hevc");
    expect(classifyCodecFamily("h264_qsv")).toBe("h264");
  });

  it("handles aliases", () => {
    expect(classifyCodecFamily("avc1")).toBe("h264");
    expect(classifyCodecFamily("h265_cuvid")).toBe("hevc");
  });

  it("returns null for unrecognized names", () => {
    expect(classifyCodecFamily("aac")).toBeNull();
    expect(classifyCodecFamily("dnxhd")).toBeNull();
    expect(classifyCodecFamily("copy")).toBeNull();
  });
});

describe("CODEC_REGISTRY", () => {
  it("contains all 6 codec families", () => {
    const families = CODEC_REGISTRY.map((m) => m.family);
    expect(families).toContain("h264");
    expect(families).toContain("hevc");
    expect(families).toContain("av1");
    expect(families).toContain("vp9");
    expect(families).toContain("vp8");
    expect(families).toContain("prores");
  });

  it("every entry has a cpu encoder", () => {
    for (const mapping of CODEC_REGISTRY) {
      expect(mapping.cpu).toBeTruthy();
    }
  });
});

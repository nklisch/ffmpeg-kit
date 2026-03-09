import { describe, expect, it } from "vitest";
import {
  audioEncoderConfigToArgs,
  buildEncoderConfig,
  encoderConfigToArgs,
} from "../../src/encoding/config.ts";
import type { EncoderConfig } from "../../src/types/codecs.ts";

describe("buildEncoderConfig", () => {
  it("returns libx264 config for premium cpu h264", () => {
    const config = buildEncoderConfig("premium", "cpu", "h264");
    expect(config.codec).toBe("libx264");
    expect(config.crf).toBe(18);
    expect(config.preset).toBe("slow");
    expect(config.profile).toBe("high");
    expect(config.pixelFormat).toBe("yuv420p");
  });

  it("returns standard cpu h264 config with crf 23", () => {
    const config = buildEncoderConfig("standard", "cpu", "h264");
    expect(config.codec).toBe("libx264");
    expect(config.crf).toBe(23);
    expect(config.preset).toBe("medium");
  });

  it("returns economy cpu h264 config with crf 28", () => {
    const config = buildEncoderConfig("economy", "cpu", "h264");
    expect(config.codec).toBe("libx264");
    expect(config.crf).toBe(28);
    expect(config.preset).toBe("veryfast");
    expect(config.profile).toBe("main");
  });

  it("returns h264_nvenc config for standard nvidia h264", () => {
    const config = buildEncoderConfig("standard", "nvidia", "h264");
    expect(config.codec).toBe("h264_nvenc");
    expect(config.cq).toBe(24);
    expect(config.preset).toBe("p4");
  });

  it("returns premium nvidia h264 config with cq 19", () => {
    const config = buildEncoderConfig("premium", "nvidia", "h264");
    expect(config.codec).toBe("h264_nvenc");
    expect(config.cq).toBe(19);
    expect(config.preset).toBe("p7");
    expect(config.profile).toBe("high");
  });

  it("returns libsvtav1 for economy cpu av1", () => {
    const config = buildEncoderConfig("economy", "cpu", "av1");
    expect(config.codec).toBe("libsvtav1");
    expect(config.crf).toBe(38);
    expect(config.preset).toBe("8");
  });

  it("returns libx265 for premium cpu hevc", () => {
    const config = buildEncoderConfig("premium", "cpu", "hevc");
    expect(config.codec).toBe("libx265");
    expect(config.crf).toBe(20);
  });

  it("returns hevc_nvenc for standard nvidia hevc", () => {
    const config = buildEncoderConfig("standard", "nvidia", "hevc");
    expect(config.codec).toBe("hevc_nvenc");
    expect(config.cq).toBe(27);
  });

  it("uses qp for vaapi mode", () => {
    const config = buildEncoderConfig("premium", "vaapi", "h264");
    expect(config.codec).toBe("h264_vaapi");
    expect(config.qp).toBe(19);
    expect(config.cq).toBeUndefined();
    expect(config.crf).toBeUndefined();
  });

  it("uses qp for qsv mode", () => {
    const config = buildEncoderConfig("standard", "qsv", "hevc");
    expect(config.codec).toBe("hevc_qsv");
    expect(config.qp).toBe(27);
  });

  it("all three quality tiers produce distinct configs for h264 cpu", () => {
    const premium = buildEncoderConfig("premium", "cpu", "h264");
    const standard = buildEncoderConfig("standard", "cpu", "h264");
    const economy = buildEncoderConfig("economy", "cpu", "h264");
    expect(premium.crf).not.toBe(standard.crf);
    expect(standard.crf).not.toBe(economy.crf);
  });

  it("defaults to h264 family when family not provided", () => {
    const config = buildEncoderConfig("standard", "cpu");
    expect(config.codec).toBe("libx264");
  });

  it("throws for auto mode", () => {
    expect(() => buildEncoderConfig("premium", "auto", "h264")).toThrow();
  });
});

describe("encoderConfigToArgs", () => {
  it("produces basic args for libx264", () => {
    const args = encoderConfigToArgs({ codec: "libx264", crf: 23, preset: "medium" });
    expect(args).toEqual(["-c:v", "libx264", "-crf", "23", "-preset", "medium"]);
  });

  it("adds -rc constqp before -cq for NVENC codecs", () => {
    const args = encoderConfigToArgs({ codec: "h264_nvenc", cq: 24, preset: "p4" });
    const rcIdx = args.indexOf("-rc");
    const cqIdx = args.indexOf("-cq");
    expect(rcIdx).toBeGreaterThanOrEqual(0);
    expect(args[rcIdx + 1]).toBe("constqp");
    expect(cqIdx).toBeGreaterThan(rcIdx);
  });

  it("does NOT add -rc for non-NVENC codecs", () => {
    const args = encoderConfigToArgs({ codec: "libx264", crf: 23 });
    expect(args).not.toContain("-rc");
  });

  it("includes profile and level when set", () => {
    const args = encoderConfigToArgs({
      codec: "libx264",
      crf: 18,
      profile: "high",
      level: "4.1",
    });
    expect(args).toContain("-profile:v");
    expect(args).toContain("high");
    expect(args).toContain("-level");
    expect(args).toContain("4.1");
  });

  it("includes pixelFormat when set", () => {
    const args = encoderConfigToArgs({ codec: "libx264", crf: 23, pixelFormat: "yuv420p" });
    expect(args).toContain("-pix_fmt");
    expect(args).toContain("yuv420p");
  });

  it("omits undefined optional fields", () => {
    const args = encoderConfigToArgs({ codec: "libx264" });
    expect(args).not.toContain("-crf");
    expect(args).not.toContain("-preset");
    expect(args).not.toContain("-profile:v");
    expect(args).not.toContain("-pix_fmt");
  });

  it("includes -pass and -passlogfile for two-pass config", () => {
    const config: EncoderConfig = {
      codec: "libx264",
      crf: 18,
      twoPass: true,
      pass: 1,
      passLogFile: "/tmp/pass",
    };
    const args = encoderConfigToArgs(config);
    expect(args).toContain("-pass");
    expect(args).toContain("1");
    expect(args).toContain("-passlogfile");
    expect(args).toContain("/tmp/pass");
  });

  it("includes -g for gopSize", () => {
    const args = encoderConfigToArgs({ codec: "libx264", gopSize: 60 });
    expect(args).toContain("-g");
    expect(args).toContain("60");
  });

  it("includes -bf for bFrames", () => {
    const args = encoderConfigToArgs({ codec: "libx264", bFrames: 2 });
    expect(args).toContain("-bf");
    expect(args).toContain("2");
  });

  it("includes -b:v and -maxrate for bitrate config", () => {
    const args = encoderConfigToArgs({
      codec: "libx264",
      videoBitrate: "5M",
      maxBitrate: "8M",
      bufSize: "10M",
    });
    expect(args).toContain("-b:v");
    expect(args).toContain("5M");
    expect(args).toContain("-maxrate");
    expect(args).toContain("8M");
    expect(args).toContain("-bufsize");
    expect(args).toContain("10M");
  });

  it("uses -x265-params for hevc codecs", () => {
    const args = encoderConfigToArgs({ codec: "libx265", codecParams: "keyint=60" });
    expect(args).toContain("-x265-params");
    expect(args).toContain("keyint=60");
    expect(args).not.toContain("-x264-params");
  });

  it("uses -x264-params for h264 codecs", () => {
    const args = encoderConfigToArgs({ codec: "libx264", codecParams: "keyint=60" });
    expect(args).toContain("-x264-params");
    expect(args).not.toContain("-x265-params");
  });

  it("includes -qp for qp-based configs", () => {
    const args = encoderConfigToArgs({ codec: "h264_vaapi", qp: 19 });
    expect(args).toContain("-qp");
    expect(args).toContain("19");
  });
});

describe("audioEncoderConfigToArgs", () => {
  it("returns basic aac args", () => {
    const args = audioEncoderConfigToArgs({ codec: "aac", bitrate: "192k" });
    expect(args).toEqual(["-c:a", "aac", "-b:a", "192k"]);
  });

  it("includes sampleRate, channels, and channelLayout when set", () => {
    const args = audioEncoderConfigToArgs({
      codec: "aac",
      bitrate: "128k",
      sampleRate: 48000,
      channels: 2,
      channelLayout: "stereo",
    });
    expect(args).toContain("-ar");
    expect(args).toContain("48000");
    expect(args).toContain("-ac");
    expect(args).toContain("2");
    expect(args).toContain("-channel_layout");
    expect(args).toContain("stereo");
  });

  it("omits undefined optional fields", () => {
    const args = audioEncoderConfigToArgs({ codec: "flac" });
    expect(args).toEqual(["-c:a", "flac"]);
    expect(args).not.toContain("-b:a");
    expect(args).not.toContain("-ar");
  });
});

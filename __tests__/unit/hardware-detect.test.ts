import { describe, expect, it } from "vitest";
import {
  categorizeEncoder,
  mapHwaccelMode,
  parseDecoders,
  parseEncoders,
  parseHwaccels,
} from "../../src/hardware/detect.ts";

const SAMPLE_HWACCELS = `
Hardware acceleration methods:
cuda
vaapi
qsv
vulkan
`;

const SAMPLE_ENCODERS = `Encoders:
 V..... = Video
 A..... = Audio
 ------
 V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
 V..... h264_nvenc           NVIDIA NVENC H.264 encoder
 V..... h264_vaapi           H.264/AVC (VAAPI)
 V..... h264_qsv             H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (Intel Quick Sync Video acceleration)
 V..... hevc_nvenc           NVIDIA NVENC hevc encoder
 V..... av1_nvenc            NVIDIA NVENC av1 encoder
 V..... vp9_vaapi            VP9 (VAAPI)
 A..... aac                  AAC (Advanced Audio Coding)
`;

const SAMPLE_DECODERS = `Decoders:
 V..... = Video
 ------
 V..... h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
 V..... h264_cuvid           Nvidia CUVID H264 decoder
 V..... h264_qsv             H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (Intel Quick Sync Video acceleration)
 V..... hevc_cuvid           Nvidia CUVID HEVC decoder
`;

describe("parseHwaccels", () => {
  it("extracts hwaccel methods from output", () => {
    const result = parseHwaccels(SAMPLE_HWACCELS);
    expect(result).toContain("cuda");
    expect(result).toContain("vaapi");
    expect(result).toContain("qsv");
    expect(result).toContain("vulkan");
  });

  it("returns empty array when no hwaccels header found", () => {
    expect(parseHwaccels("some unrelated output")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseHwaccels("")).toEqual([]);
  });
});

describe("parseEncoders", () => {
  it("extracts encoder names from output", () => {
    const result = parseEncoders(SAMPLE_ENCODERS);
    expect(result).toContain("libx264");
    expect(result).toContain("h264_nvenc");
    expect(result).toContain("h264_vaapi");
    expect(result).toContain("hevc_nvenc");
    expect(result).toContain("av1_nvenc");
    expect(result).toContain("vp9_vaapi");
  });

  it("does not include header lines", () => {
    const result = parseEncoders(SAMPLE_ENCODERS);
    expect(result).not.toContain("Encoders:");
    expect(result).not.toContain("V.....");
  });
});

describe("parseDecoders", () => {
  it("extracts decoder names from output", () => {
    const result = parseDecoders(SAMPLE_DECODERS);
    expect(result).toContain("h264");
    expect(result).toContain("h264_cuvid");
    expect(result).toContain("h264_qsv");
    expect(result).toContain("hevc_cuvid");
  });
});

describe("mapHwaccelMode", () => {
  it("maps cuda to nvidia", () => {
    expect(mapHwaccelMode("cuda")).toBe("nvidia");
  });

  it("maps vaapi to vaapi", () => {
    expect(mapHwaccelMode("vaapi")).toBe("vaapi");
  });

  it("maps qsv to qsv", () => {
    expect(mapHwaccelMode("qsv")).toBe("qsv");
  });

  it("maps vulkan to vulkan", () => {
    expect(mapHwaccelMode("vulkan")).toBe("vulkan");
  });

  it("returns null for unrecognized mode", () => {
    expect(mapHwaccelMode("opencl")).toBeNull();
    expect(mapHwaccelMode("d3d11va")).toBeNull();
    expect(mapHwaccelMode("")).toBeNull();
  });
});

describe("categorizeEncoder", () => {
  it("maps h264_nvenc to h264 family", () => {
    const result = categorizeEncoder("h264_nvenc");
    expect(result?.family).toBe("h264");
    expect(result?.codec).toBe("h264_nvenc");
  });

  it("maps hevc_vaapi to hevc family", () => {
    const result = categorizeEncoder("hevc_vaapi");
    expect(result?.family).toBe("hevc");
  });

  it("maps av1_qsv to av1 family", () => {
    const result = categorizeEncoder("av1_qsv");
    expect(result?.family).toBe("av1");
  });

  it("maps vp9_vaapi to vp9 family", () => {
    const result = categorizeEncoder("vp9_vaapi");
    expect(result?.family).toBe("vp9");
  });

  it("returns null for CPU encoders", () => {
    expect(categorizeEncoder("libx264")).toBeNull();
    expect(categorizeEncoder("libx265")).toBeNull();
    expect(categorizeEncoder("libsvtav1")).toBeNull();
  });

  it("returns null for audio encoders", () => {
    expect(categorizeEncoder("aac")).toBeNull();
  });
});

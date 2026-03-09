import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { AudioCodec, HwAccelMode, VideoCodec } from "../types/codecs.ts";

/** Codec family identifier */
export type CodecFamily = "h264" | "hevc" | "av1" | "vp9" | "vp8" | "prores";

/** Mapping from HwAccelMode to preferred encoder for each codec family */
export interface CodecMapping {
  family: CodecFamily;
  cpu: VideoCodec;
  nvidia?: VideoCodec;
  vaapi?: VideoCodec;
  qsv?: VideoCodec;
  vulkan?: VideoCodec;
}

/** Registry of codec families and their encoder mappings */
export const CODEC_REGISTRY: readonly CodecMapping[] = [
  {
    family: "h264",
    cpu: "libx264",
    nvidia: "h264_nvenc",
    vaapi: "h264_vaapi",
    qsv: "h264_qsv",
    vulkan: "h264_vulkan",
  },
  {
    family: "hevc",
    cpu: "libx265",
    nvidia: "hevc_nvenc",
    vaapi: "hevc_vaapi",
    qsv: "hevc_qsv",
    vulkan: "hevc_vulkan",
  },
  {
    family: "av1",
    cpu: "libsvtav1",
    nvidia: "av1_nvenc",
    vaapi: "av1_vaapi",
    qsv: "av1_qsv",
  },
  { family: "vp9", cpu: "libvpx-vp9", vaapi: "vp9_vaapi", qsv: "vp9_qsv" },
  { family: "vp8", cpu: "libvpx", vaapi: "vp8_vaapi" },
  { family: "prores", cpu: "prores_ks" },
];

/**
 * Get the appropriate encoder for a codec family + hw mode.
 * Returns the CPU fallback if no hw encoder exists for that family.
 * Throws if mode is "auto" — resolve to concrete mode via acquireSession() first.
 */
export function getEncoderForMode(family: CodecFamily, mode: HwAccelMode): VideoCodec {
  if (mode === "auto") {
    throw new FFmpegError({
      code: FFmpegErrorCode.INVALID_INPUT,
      message: `Cannot resolve "auto" mode in getEncoderForMode — call acquireSession() first`,
      stderr: "",
      command: [],
      exitCode: 0,
    });
  }
  const mapping = CODEC_REGISTRY.find((m) => m.family === family);
  if (mapping === undefined) {
    throw new FFmpegError({
      code: FFmpegErrorCode.INVALID_INPUT,
      message: `Unknown codec family: ${family}`,
      stderr: "",
      command: [],
      exitCode: 0,
    });
  }
  if (mode === "cpu") return mapping.cpu;
  const hwEncoder = mapping[mode];
  return hwEncoder ?? mapping.cpu;
}

/**
 * Get the CPU (software) encoder for a codec family.
 */
export function getCpuEncoder(family: CodecFamily): VideoCodec {
  const mapping = CODEC_REGISTRY.find((m) => m.family === family);
  if (mapping === undefined) {
    throw new FFmpegError({
      code: FFmpegErrorCode.INVALID_INPUT,
      message: `Unknown codec family: ${family}`,
      stderr: "",
      command: [],
      exitCode: 0,
    });
  }
  return mapping.cpu;
}

/** Known aliases per codec family for substring classification */
const FAMILY_ALIASES: Partial<Record<CodecFamily, string[]>> = {
  h264: ["avc"],
  hevc: ["h265"],
};

/**
 * Classify a codec name (encoder or decoder) into a CodecFamily using
 * CODEC_REGISTRY families and known aliases for substring matching.
 * Returns null if no family matches.
 * @internal
 */
export function classifyCodecFamily(name: string): CodecFamily | null {
  for (const mapping of CODEC_REGISTRY) {
    if (name.includes(mapping.family)) return mapping.family;
    const aliases = FAMILY_ALIASES[mapping.family];
    if (aliases?.some((alias) => name.includes(alias))) return mapping.family;
  }
  return null;
}

/**
 * Determine the codec family from an encoder name.
 * e.g., "h264_nvenc" → "h264", "libsvtav1" → "av1"
 */
export function getCodecFamily(encoder: VideoCodec): CodecFamily | null {
  for (const mapping of CODEC_REGISTRY) {
    if (
      mapping.cpu === encoder ||
      mapping.nvidia === encoder ||
      mapping.vaapi === encoder ||
      mapping.qsv === encoder ||
      mapping.vulkan === encoder
    ) {
      return mapping.family;
    }
  }
  return null;
}

/**
 * Default audio codec for a container format.
 * mp4/mov/mkv/ts/flv → "aac", webm → "libopus", avi → "libmp3lame"
 */
export function getDefaultAudioCodec(format: string): AudioCodec {
  switch (format) {
    case "webm":
      return "libopus";
    case "avi":
      return "libmp3lame";
    default:
      return "aac";
  }
}

import type {
  AudioEncoderConfig,
  EncoderConfig,
  HwAccelMode,
  QualityTier,
} from "../types/codecs.ts";
import type { CodecFamily } from "./codecs.ts";
import { getEncoderForMode } from "./codecs.ts";

/** Quality settings for a specific tier, keyed by tier name */
interface TierSettings {
  /** CRF value (CPU-style quality control) */
  crf?: number;
  /** CQ value (NVENC constant quality) */
  cq?: number;
  /** QP value (VAAPI/QSV quality control) */
  qp?: number;
  /** Encoding preset */
  preset?: EncoderConfig["preset"];
  /** Codec profile */
  profile?: string;
}

type TierMap = Record<QualityTier, TierSettings>;

/** CPU tier settings per codec family */
const CPU_TIERS: Record<"h264" | "hevc" | "av1", TierMap> = {
  h264: {
    premium: { crf: 18, preset: "slow", profile: "high" },
    standard: { crf: 23, preset: "medium", profile: "high" },
    economy: { crf: 28, preset: "veryfast", profile: "main" },
  },
  hevc: {
    premium: { crf: 20, preset: "slow", profile: "main" },
    standard: { crf: 26, preset: "medium", profile: "main" },
    economy: { crf: 32, preset: "veryfast", profile: "main" },
  },
  av1: {
    premium: { crf: 22, preset: "4" },
    standard: { crf: 30, preset: "6" },
    economy: { crf: 38, preset: "8" },
  },
};

/** NVENC tier settings per codec family */
const NVENC_TIERS: Record<"h264" | "hevc" | "av1", TierMap> = {
  h264: {
    premium: { cq: 19, preset: "p7", profile: "high" },
    standard: { cq: 24, preset: "p4", profile: "high" },
    economy: { cq: 30, preset: "p1", profile: "main" },
  },
  hevc: {
    premium: { cq: 21, preset: "p7", profile: "main" },
    standard: { cq: 27, preset: "p4", profile: "main" },
    economy: { cq: 33, preset: "p1", profile: "main" },
  },
  av1: {
    premium: { cq: 23, preset: "p7" },
    standard: { cq: 31, preset: "p4" },
    economy: { cq: 39, preset: "p1" },
  },
};

/** VAAPI/QSV tier settings per codec family (same values as NVENC but using qp) */
const HW_QP_TIERS: Record<"h264" | "hevc" | "av1", TierMap> = {
  h264: {
    premium: { qp: 19, profile: "high" },
    standard: { qp: 24, profile: "high" },
    economy: { qp: 30, profile: "main" },
  },
  hevc: {
    premium: { qp: 21, profile: "main" },
    standard: { qp: 27, profile: "main" },
    economy: { qp: 33, profile: "main" },
  },
  av1: {
    premium: { qp: 23 },
    standard: { qp: 31 },
    economy: { qp: 39 },
  },
};

/**
 * Build encoder configuration from a quality tier, hw mode, and codec family.
 *
 * Maps high-level intent (e.g., "premium h264 on nvidia") into concrete encoder
 * settings (codec, CRF/CQ, preset, profile, pixel format, etc.).
 *
 * mode "auto" is NOT supported — resolve to concrete mode first via acquireSession().
 */
export function buildEncoderConfig(
  tier: QualityTier,
  mode: HwAccelMode,
  family: CodecFamily = "h264",
): EncoderConfig {
  if (mode === "auto") {
    throw new Error(
      `Cannot use "auto" mode in buildEncoderConfig — resolve to concrete mode first`,
    );
  }

  const codec = getEncoderForMode(family, mode);

  // vp8, vp9, prores have no hw-specific tier tables — use cpu encoder and basic config
  if (family === "vp8" || family === "vp9" || family === "prores") {
    return { codec, pixelFormat: "yuv420p" };
  }

  const fam = family as "h264" | "hevc" | "av1";

  if (mode === "cpu") {
    const settings = CPU_TIERS[fam][tier];
    return {
      codec,
      ...settings,
      pixelFormat: "yuv420p",
    };
  }

  if (mode === "nvidia") {
    const settings = NVENC_TIERS[fam][tier];
    return {
      codec,
      ...settings,
      pixelFormat: "yuv420p",
    };
  }

  // vaapi or qsv
  const settings = HW_QP_TIERS[fam][tier];
  return {
    codec,
    ...settings,
    pixelFormat: "yuv420p",
  };
}

/** NVENC codec names that use -rc constqp when cq is set */
const NVENC_CODECS = new Set(["h264_nvenc", "hevc_nvenc", "av1_nvenc"]);

/** libx265 codec params flag */
const X265_CODECS = new Set(["libx265", "hevc_nvenc", "hevc_vaapi", "hevc_qsv", "hevc_vulkan"]);

/**
 * Build the ffmpeg argument array from an EncoderConfig.
 * Produces args like: ["-c:v", "libx264", "-crf", "18", "-preset", "medium", ...]
 */
export function encoderConfigToArgs(config: EncoderConfig): string[] {
  const args: string[] = [];

  args.push("-c:v", config.codec);

  if (NVENC_CODECS.has(config.codec) && config.cq !== undefined) {
    args.push("-rc", "constqp");
  }

  if (config.crf !== undefined) args.push("-crf", String(config.crf));
  if (config.cq !== undefined) args.push("-cq", String(config.cq));
  if (config.qp !== undefined) args.push("-qp", String(config.qp));
  if (config.videoBitrate !== undefined) args.push("-b:v", config.videoBitrate);
  if (config.maxBitrate !== undefined) args.push("-maxrate", config.maxBitrate);
  if (config.bufSize !== undefined) args.push("-bufsize", config.bufSize);
  if (config.preset !== undefined) args.push("-preset", config.preset);
  if (config.profile !== undefined) args.push("-profile:v", config.profile);
  if (config.level !== undefined) args.push("-level", config.level);
  if (config.pixelFormat !== undefined) args.push("-pix_fmt", config.pixelFormat);
  if (config.tune !== undefined) args.push("-tune", config.tune);
  if (config.codecParams !== undefined) {
    const flag = X265_CODECS.has(config.codec) ? "-x265-params" : "-x264-params";
    args.push(flag, config.codecParams);
  }
  if (config.gopSize !== undefined) args.push("-g", String(config.gopSize));
  if (config.bFrames !== undefined) args.push("-bf", String(config.bFrames));
  if (config.pass !== undefined) args.push("-pass", String(config.pass));
  if (config.passLogFile !== undefined) args.push("-passlogfile", config.passLogFile);

  return args;
}

/**
 * Build the ffmpeg argument array from an AudioEncoderConfig.
 * Produces args like: ["-c:a", "aac", "-b:a", "192k", ...]
 */
export function audioEncoderConfigToArgs(config: AudioEncoderConfig): string[] {
  const args: string[] = [];

  args.push("-c:a", config.codec);

  if (config.bitrate !== undefined) args.push("-b:a", config.bitrate);
  if (config.sampleRate !== undefined) args.push("-ar", String(config.sampleRate));
  if (config.channels !== undefined) args.push("-ac", String(config.channels));
  if (config.channelLayout !== undefined) args.push("-channel_layout", config.channelLayout);

  return args;
}

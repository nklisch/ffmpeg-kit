import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { HwAccelMode, VideoCodec } from "../types/codecs.ts";
import { classifyCodecFamily } from "../encoding/codecs.ts";
import { findExecutable } from "../util/platform.ts";

const execFileAsync = promisify(execFile);

/** Result of hardware capability detection */
export interface HardwareCapabilities {
  /** Available hardware acceleration methods (always includes "cpu") */
  available: HwAccelMode[];
  /** Detected GPU info (null if no GPU found) */
  gpu: {
    vendor: "nvidia" | "amd" | "intel" | "unknown";
    model: string;
    /** Max concurrent encoding sessions (2 for consumer NVIDIA, 8 for pro) */
    maxSessions: number;
  } | null;
  /** Available hardware encoders by codec family */
  encoders: {
    h264: VideoCodec[];
    hevc: VideoCodec[];
    av1: VideoCodec[];
    vp9: VideoCodec[];
  };
  /** Available hardware decoders by codec family */
  decoders: {
    h264: string[];
    hevc: string[];
    av1: string[];
    vp9: string[];
  };
}

/** Configuration for hardware detection */
export interface DetectConfig {
  ffmpegPath?: string;
}

/** Graceful default when detection fails */
const EMPTY_CAPABILITIES: HardwareCapabilities = {
  available: ["cpu"],
  gpu: null,
  encoders: { h264: [], hevc: [], av1: [], vp9: [] },
  decoders: { h264: [], hevc: [], av1: [], vp9: [] },
};

// Promise memoization is used here instead of the Cache class intentionally:
// a single module-level promise ensures concurrent calls to detectHardware()
// all await the same in-flight detection rather than triggering duplicate runs.
// probe.ts uses Cache<K,V> for per-file keyed caching — a different pattern for
// a different need.
let detectPromise: Promise<HardwareCapabilities> | null = null;

/**
 * Parse `ffmpeg -encoders` or `ffmpeg -decoders` output into a list of codec names.
 * @internal exported for testability
 */
export function parseCodecList(stdout: string): string[] {
  const lines = stdout.split("\n");
  const results: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Lines look like: " V..... libx264              libx264 H.264 ..."
    if (!/^[VASD.]{6}\s+/.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    const name = parts[1];
    if (name !== undefined && name.length > 0) results.push(name);
  }
  return results;
}

/**
 * Parse `ffmpeg -hwaccels` output into list of hwaccel method names.
 * @internal
 */
export function parseHwaccels(stdout: string): string[] {
  const lines = stdout.split("\n");
  const headerIdx = lines.findIndex((l) => l.trim().startsWith("Hardware acceleration methods:"));
  if (headerIdx === -1) return [];
  return lines
    .slice(headerIdx + 1)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Map raw hwaccel names to HwAccelMode values.
 * Returns null for unrecognized modes.
 * @internal
 */
export function mapHwaccelMode(name: string): HwAccelMode | null {
  switch (name) {
    case "cuda":
      return "nvidia";
    case "vaapi":
      return "vaapi";
    case "qsv":
      return "qsv";
    case "vulkan":
      return "vulkan";
    default:
      return null;
  }
}

/** Hardware encoder name suffixes used to identify hw encoders */
const HW_ENCODER_SUFFIXES = ["_nvenc", "_vaapi", "_qsv", "_amf", "_vulkan"] as const;

/**
 * Returns true if the encoder name is a hardware encoder.
 * @internal
 */
export function isHardwareEncoder(name: string): boolean {
  return HW_ENCODER_SUFFIXES.some((suffix) => name.includes(suffix));
}

/**
 * Categorize encoder name into codec family and VideoCodec.
 * Only handles hardware encoders (those matching isHardwareEncoder).
 * @internal
 */
export function categorizeEncoder(
  name: string,
): { family: "h264" | "hevc" | "av1" | "vp9"; codec: VideoCodec } | null {
  if (!isHardwareEncoder(name)) return null;

  const family = classifyCodecFamily(name);
  if (family === null || family === "vp8" || family === "prores") return null;

  return { family, codec: name as VideoCodec };
}

/** Query nvidia-smi for GPU info */
async function queryNvidiaSmi(): Promise<{ model: string; maxSessions: number } | null> {
  try {
    const nvidiaSmi = await findExecutable("nvidia-smi");
    if (nvidiaSmi === null) return null;

    const { stdout } = await execFileAsync(nvidiaSmi, [
      "--query-gpu=name",
      "--format=csv,noheader",
    ]);
    const model = stdout.trim().split("\n")[0]?.trim() ?? "";
    if (model.length === 0) return null;

    // Pro GPUs: Quadro, Tesla, A100, L40, RTX A-series → 8 sessions; consumer → 2
    const isProGpu = /quadro|tesla|a100|l40|rtx\s+a\d|a\d{4}|t[124]\d{3}/i.test(model);
    return { model, maxSessions: isProGpu ? 8 : 2 };
  } catch {
    return null;
  }
}

/** Detect GPU vendor from /sys/class/drm on Linux */
async function detectLinuxGpuVendor(): Promise<"intel" | "amd" | null> {
  try {
    const drmPath = "/sys/class/drm";
    const entries = await readdir(drmPath);
    for (const entry of entries) {
      if (!entry.startsWith("card") || entry.includes("-")) continue;
      try {
        const vendorPath = join(drmPath, entry, "device", "vendor");
        const vendor = (await readFile(vendorPath, "utf8")).trim();
        if (vendor === "0x8086") return "intel";
        if (vendor === "0x1002") return "amd";
      } catch {
        // ignore unreadable entries
      }
    }
  } catch {
    // /sys/class/drm not available
  }
  return null;
}

/**
 * Detect hardware acceleration capabilities.
 *
 * Cached for process lifetime after first call.
 * Never throws — gracefully degrades on detection failures.
 */
export function detectHardware(config?: DetectConfig): Promise<HardwareCapabilities> {
  if (detectPromise !== null) return detectPromise;

  detectPromise = runDetection(config);
  return detectPromise;
}

async function runDetection(config?: DetectConfig): Promise<HardwareCapabilities> {
  const ffmpeg = config?.ffmpegPath ?? "ffmpeg";

  try {
    // Run all queries in parallel
    const [hwaccelsResult, encodersResult, decodersResult, nvidiaSmiResult] = await Promise.all([
      execFileAsync(ffmpeg, ["-hwaccels"]).catch(() => ({ stdout: "", stderr: "" })),
      execFileAsync(ffmpeg, ["-encoders"]).catch(() => ({ stdout: "", stderr: "" })),
      execFileAsync(ffmpeg, ["-decoders"]).catch(() => ({ stdout: "", stderr: "" })),
      queryNvidiaSmi(),
    ]);

    // Parse hwaccels
    const rawHwaccels = parseHwaccels(hwaccelsResult.stdout + hwaccelsResult.stderr);
    const available: HwAccelMode[] = ["cpu"];
    for (const name of rawHwaccels) {
      const mode = mapHwaccelMode(name);
      if (mode !== null && !available.includes(mode)) {
        available.push(mode);
      }
    }

    // Check vaapi is actually working
    if (available.includes("vaapi")) {
      const vainfo = await findExecutable("vainfo");
      if (vainfo !== null) {
        const vaOk = await execFileAsync(vainfo, [])
          .then(() => true)
          .catch(() => false);
        if (!vaOk) {
          const idx = available.indexOf("vaapi");
          if (idx !== -1) available.splice(idx, 1);
        }
      }
    }

    // Parse hardware encoders
    const allEncoders = parseCodecList(encodersResult.stdout + encodersResult.stderr);
    const hwEncoders = allEncoders.filter(isHardwareEncoder);

    const encoders: HardwareCapabilities["encoders"] = {
      h264: [],
      hevc: [],
      av1: [],
      vp9: [],
    };
    for (const enc of hwEncoders) {
      const cat = categorizeEncoder(enc);
      if (cat !== null) {
        encoders[cat.family].push(cat.codec);
      }
    }

    // Parse hardware decoders
    const allDecoders = parseCodecList(decodersResult.stdout + decodersResult.stderr);
    const hwDecoders = allDecoders.filter(
      (name) => name.includes("_cuvid") || name.includes("_vaapi") || name.includes("_qsv"),
    );

    const decoders: HardwareCapabilities["decoders"] = {
      h264: [],
      hevc: [],
      av1: [],
      vp9: [],
    };
    for (const dec of hwDecoders) {
      const family = classifyCodecFamily(dec);
      if (family === "h264") decoders.h264.push(dec);
      else if (family === "hevc") decoders.hevc.push(dec);
      else if (family === "av1") decoders.av1.push(dec);
      else if (family === "vp9") decoders.vp9.push(dec);
    }

    // Determine GPU info
    let gpu: HardwareCapabilities["gpu"] = null;

    if (nvidiaSmiResult !== null) {
      gpu = {
        vendor: "nvidia",
        model: nvidiaSmiResult.model,
        maxSessions: nvidiaSmiResult.maxSessions,
      };
    } else if (available.includes("vaapi")) {
      const linuxVendor = await detectLinuxGpuVendor();
      if (linuxVendor !== null) {
        gpu = { vendor: linuxVendor, model: "", maxSessions: 0 };
      } else {
        gpu = { vendor: "unknown", model: "", maxSessions: 0 };
      }
    }

    return { available, gpu, encoders, decoders };
  } catch {
    return { ...EMPTY_CAPABILITIES };
  }
}

/**
 * Clear the cached hardware capabilities.
 * Useful for testing or after system changes.
 */
export function clearHardwareCache(): void {
  detectPromise = null;
}

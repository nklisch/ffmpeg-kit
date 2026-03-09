import { getCpuEncoder } from "../encoding/codecs.ts";
import type { HwAccelMode, VideoCodec } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import { detectHardware } from "./detect.ts";

/** An active hardware encoding session (reference counted) */
export interface HwSession {
  /** The acceleration mode for this session */
  mode: HwAccelMode;
  /** The selected hardware encoder name */
  encoder: VideoCodec;
  /** Input args for hardware-accelerated decoding */
  inputArgs: string[];
  /** Release this session back to the pool */
  release(): void;
}

/** Configuration for session management */
export interface SessionConfig {
  ffmpegPath?: string;
}

/** Module-level NVENC session counter */
let activeNvencSessions = 0;

/** Max NVENC sessions (updated after detect) */
let maxNvencSessions = 2;

/** Build inputArgs for a given hw mode */
function buildInputArgs(mode: HwAccelMode): string[] {
  switch (mode) {
    case "nvidia":
      return ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"];
    case "vaapi":
      return [
        "-hwaccel",
        "vaapi",
        "-hwaccel_device",
        "/dev/dri/renderD128",
        "-hwaccel_output_format",
        "vaapi",
      ];
    case "qsv":
      return ["-hwaccel", "qsv", "-hwaccel_output_format", "qsv"];
    case "vulkan":
      return ["-hwaccel", "vulkan"];
    default:
      return [];
  }
}

/** Select hardware encoder for the given mode and codec family */
async function selectEncoder(
  mode: HwAccelMode,
  family: "h264" | "hevc" | "av1",
  config?: SessionConfig,
): Promise<VideoCodec> {
  if (mode === "cpu") {
    return getCpuEncoder(family);
  }
  const caps = await detectHardware({ ffmpegPath: config?.ffmpegPath });
  const encoders = caps.encoders[family];
  if (encoders.length > 0) {
    return encoders[0] as VideoCodec;
  }
  // Fallback to CPU if no hw encoder found for this family+mode
  return getCpuEncoder(family);
}

/**
 * Acquire a hardware encoding session.
 *
 * For NVIDIA: tracks concurrent sessions against the GPU's max (2 consumer, 8 pro).
 * Throws FFmpegError with SESSION_LIMIT if at capacity.
 * For other modes: no session limit enforced.
 * For "cpu": returns a no-op session with the appropriate CPU encoder.
 * For "auto": detects best available mode and acquires that.
 */
export async function acquireSession(
  mode: HwAccelMode,
  codec: "h264" | "hevc" | "av1" = "h264",
  config?: SessionConfig,
): Promise<HwSession> {
  // Resolve "auto" to the best available mode
  let resolvedMode: HwAccelMode = mode;
  if (mode === "auto") {
    const caps = await detectHardware({ ffmpegPath: config?.ffmpegPath });
    // Preference: nvidia > qsv > vaapi > vulkan > cpu
    const preference: HwAccelMode[] = ["nvidia", "qsv", "vaapi", "vulkan"];
    resolvedMode = preference.find((m) => caps.available.includes(m)) ?? "cpu";
  }

  // Handle NVIDIA session limit
  if (resolvedMode === "nvidia") {
    const caps = await detectHardware({ ffmpegPath: config?.ffmpegPath });
    if (caps.gpu !== null && caps.gpu.vendor === "nvidia") {
      maxNvencSessions = caps.gpu.maxSessions;
    }
    if (activeNvencSessions >= maxNvencSessions) {
      throw new FFmpegError({
        code: FFmpegErrorCode.SESSION_LIMIT,
        message: `NVENC session limit reached (${maxNvencSessions} max)`,
        stderr: "",
        command: [],
        exitCode: -1,
      });
    }
    activeNvencSessions++;
  }

  const encoder = await selectEncoder(resolvedMode, codec, config);
  const inputArgs = buildInputArgs(resolvedMode);

  let released = false;

  return {
    mode: resolvedMode,
    encoder,
    inputArgs,
    release() {
      if (released) return;
      released = true;
      if (resolvedMode === "nvidia" && activeNvencSessions > 0) {
        activeNvencSessions--;
      }
    },
  };
}

/**
 * RAII-style session wrapper. Acquires a session, runs the operation,
 * and guarantees release in a finally block.
 */
export async function withHwSession<T>(
  mode: HwAccelMode,
  operation: (session: HwSession) => Promise<T>,
  codec: "h264" | "hevc" | "av1" = "h264",
  config?: SessionConfig,
): Promise<T> {
  const session = await acquireSession(mode, codec, config);
  try {
    return await operation(session);
  } finally {
    session.release();
  }
}

/** Reset NVENC session counter — exposed for testing */
export function _resetNvencSessions(): void {
  activeNvencSessions = 0;
  maxNvencSessions = 2;
}

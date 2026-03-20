import { exportVideo } from "../operations/io/export.ts";
import type { AudioCodec, HwAccelMode, PixelFormat, VideoCodec } from "../types/codecs.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, SmartTranscodeResult, TranscodeAction } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";
import { probeOutput } from "../util/builder-helpers.ts";
import { parseBitrate } from "./estimate.ts";

interface SmartTranscodeTarget {
  videoCodec?: VideoCodec;
  maxWidth?: number;
  maxHeight?: number;
  pixelFormat?: PixelFormat;
  audioCodec?: AudioCodec;
  audioSampleRate?: number;
  maxBitrate?: string;
}

export interface SmartTranscodeOptions {
  input: string;
  output: string;
  target: SmartTranscodeTarget;
  hwAccel?: HwAccelMode;
}

/** Normalize codec names for comparison (e.g., 'h264' === 'libx264', 'hevc' === 'libx265') */
function normalizeCodec(codec: string): string {
  const lower = codec.toLowerCase();
  const aliases: Record<string, string> = {
    h264: "libx264",
    avc: "libx264",
    h265: "libx265",
    hevc: "libx265",
    vp9: "libvpx-vp9",
    vp8: "libvpx",
    av1: "libaom-av1",
    mp3: "libmp3lame",
    mp3lame: "libmp3lame",
    opus: "libopus",
    vorbis: "libvorbis",
  };
  return aliases[lower] ?? lower;
}

function codecMatches(streamCodec: string, targetCodec: string): boolean {
  return normalizeCodec(streamCodec) === normalizeCodec(targetCodec);
}

export async function smartTranscode(
  deps: BuilderDeps,
  options: SmartTranscodeOptions,
  executeOptions?: ExecuteOptions,
): Promise<SmartTranscodeResult> {
  const { input, output, target, hwAccel } = options;

  const probeResult = await deps.probe(input);
  const videoStream = probeResult.streams.find((s) => s.type === "video");
  const audioStream = probeResult.streams.find((s) => s.type === "audio");

  const actions: TranscodeAction[] = [];

  // Determine video action
  let needsVideoTranscode = false;
  if (videoStream && videoStream.type === "video") {
    if (target.videoCodec !== undefined && !codecMatches(videoStream.codec, target.videoCodec)) {
      needsVideoTranscode = true;
    }
    if (target.maxWidth !== undefined && videoStream.width > target.maxWidth) {
      needsVideoTranscode = true;
    }
    if (target.maxHeight !== undefined && videoStream.height > target.maxHeight) {
      needsVideoTranscode = true;
    }
    if (target.pixelFormat !== undefined && videoStream.pixelFormat !== target.pixelFormat) {
      needsVideoTranscode = true;
    }
    if (target.maxBitrate !== undefined) {
      const maxBps = parseBitrate(target.maxBitrate);
      const currentBps = probeResult.format.bitrate;
      if (currentBps > maxBps) {
        needsVideoTranscode = true;
      }
    }
  }

  // Determine audio action
  let needsAudioTranscode = false;
  if (audioStream && audioStream.type === "audio") {
    if (target.audioCodec !== undefined && !codecMatches(audioStream.codec, target.audioCodec)) {
      needsAudioTranscode = true;
    }
    if (target.audioSampleRate !== undefined && audioStream.sampleRate !== target.audioSampleRate) {
      needsAudioTranscode = true;
    }
  } else if (audioStream === undefined && target.audioCodec !== undefined) {
    actions.push("add_audio");
  }

  // Build the export command
  const builder = exportVideo(deps).input(input);

  if (!needsVideoTranscode && !needsAudioTranscode) {
    builder.videoCodec("copy").audioCodec("copy");
    actions.push("copy_all");
  } else if (needsVideoTranscode && !needsAudioTranscode) {
    if (target.videoCodec !== undefined) {
      builder.videoCodec(target.videoCodec);
    }
    if (target.pixelFormat !== undefined) {
      builder.pixelFormat(target.pixelFormat);
    }
    builder.audioCodec("copy");
    actions.push("transcode_video");
    actions.push("copy_audio");
  } else if (!needsVideoTranscode && needsAudioTranscode) {
    builder.videoCodec("copy");
    if (target.audioCodec !== undefined) {
      builder.audioCodec(target.audioCodec);
    }
    if (target.audioSampleRate !== undefined) {
      builder.audioSampleRate(target.audioSampleRate);
    }
    actions.push("copy_video");
    actions.push("transcode_audio");
  } else {
    // Both need transcoding
    if (target.videoCodec !== undefined) {
      builder.videoCodec(target.videoCodec);
    }
    if (target.pixelFormat !== undefined) {
      builder.pixelFormat(target.pixelFormat);
    }
    if (target.audioCodec !== undefined) {
      builder.audioCodec(target.audioCodec);
    }
    if (target.audioSampleRate !== undefined) {
      builder.audioSampleRate(target.audioSampleRate);
    }
    actions.push("transcode_video");
    actions.push("transcode_audio");
  }

  if (hwAccel !== undefined) {
    builder.hwAccel(hwAccel);
  }

  await builder.output(output).execute(executeOptions);

  const info = await probeOutput(output, deps.probe);
  return {
    outputPath: info.outputPath,
    duration: info.duration,
    sizeBytes: info.sizeBytes,
    actions,
  };
}

export async function trySmartTranscode(
  deps: BuilderDeps,
  options: SmartTranscodeOptions,
  executeOptions?: ExecuteOptions,
): Promise<OperationResult<SmartTranscodeResult>> {
  try {
    const data = await smartTranscode(deps, options, executeOptions);
    return { success: true, data };
  } catch (err) {
    const { FFmpegError } = await import("../types/errors.ts");
    if (err instanceof FFmpegError) return { success: false, error: err };
    throw err;
  }
}

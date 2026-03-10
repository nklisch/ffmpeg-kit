import { tmpdir } from "node:os";
import { join } from "node:path";
import { execute } from "./core/execute.ts";
import { probe } from "./core/probe.ts";
import { validateInstallation } from "./core/validate.ts";
import { detectHardware } from "./hardware/detect.ts";
import { parseTimecode } from "./util/timecode.ts";
import { Cache } from "./util/cache.ts";
import { filter, chain, filterGraph } from "./filters/graph.ts";

import { extract } from "./operations/extract.ts";
import { transform } from "./operations/transform.ts";
import { audio } from "./operations/audio.ts";
import { concat } from "./operations/concat.ts";
import { exportVideo } from "./operations/export.ts";
import { overlay } from "./operations/overlay.ts";
import { text } from "./operations/text.ts";
import { subtitle } from "./operations/subtitle.ts";
import { image } from "./operations/image.ts";
import { hls, dash } from "./operations/streaming.ts";
import { gif } from "./operations/gif.ts";

import { pipeline } from "./convenience/pipeline.ts";
import { batch } from "./convenience/batch.ts";
import { smartTranscode } from "./convenience/smart.ts";
import { thumbnailSheet } from "./convenience/thumbnail-sheet.ts";
import { waveform } from "./convenience/waveform.ts";
import { detectSilence, trimSilence, splitOnSilence } from "./convenience/silence.ts";
import { estimateSize } from "./convenience/estimate.ts";
import { normalizeMedia } from "./convenience/normalize-media.ts";
import { remux, compress, extractAudio, imageToVideo, resize } from "./convenience/quick.ts";

import type { FFmpegConfig, FFmpegSDK, BuilderDeps } from "./types/sdk.ts";
import type { ProbeResult } from "./types/probe.ts";
import type { HardwareCapabilities } from "./hardware/detect.ts";

/**
 * Create an FFmpeg SDK instance with per-instance configuration.
 * Each instance has its own probe cache, hardware detection cache,
 * and binary path configuration.
 */
export function createFFmpeg(config?: FFmpegConfig): FFmpegSDK {
  const ffmpegPath = config?.ffmpegPath ?? "ffmpeg";
  const ffprobePath = config?.ffprobePath ?? "ffprobe";
  const defaultTimeout = config?.defaultTimeout ?? 600_000;
  const logLevel = config?.logLevel ?? "error";
  const tempDir = config?.tempDir ?? join(tmpdir(), "ffmpeg-kit");
  const defaultHwAccel = config?.defaultHwAccel ?? "auto";

  const probeCacheSize = config?.probeCacheSize ?? 100;
  const probeCacheTtl = config?.probeCacheTtl ?? 300_000;
  const probeCache = new Cache<string, ProbeResult>({
    maxSize: Math.max(probeCacheSize, 1),
    ttlMs: probeCacheSize > 0 ? probeCacheTtl : 0,
  });

  // Per-instance hardware detection cache
  const hwRef: { current: Promise<HardwareCapabilities> | null } = { current: null };

  const deps: BuilderDeps = {
    execute: (args, options) =>
      execute(args, { timeout: defaultTimeout, logLevel, ...options }, { ffmpegPath }),
    probe: (inputPath, options) =>
      probe(inputPath, options, { ffprobePath, cacheInstance: probeCache }),
    tempDir,
    defaultHwAccel,
  };

  const sdk: FFmpegSDK = {
    // ── Core ──
    execute: deps.execute,
    probe: deps.probe,
    getDuration: async (path) => {
      const result = await deps.probe(path);
      return result.format.duration ?? 0;
    },
    getVideoStream: async (path) => {
      const result = await deps.probe(path);
      const stream = result.streams.find((s) => s.type === "video");
      if (!stream || stream.type !== "video") return null;
      return stream;
    },
    getAudioStream: async (path) => {
      const result = await deps.probe(path);
      const stream = result.streams.find((s) => s.type === "audio");
      if (!stream || stream.type !== "audio") return null;
      return stream;
    },
    validateInstallation: () => validateInstallation({ ffmpegPath, ffprobePath }),
    clearProbeCache: () => {
      probeCache.clear();
      hwRef.current = null;
    },
    parseTimecode,

    // ── Operation Builders ──
    extract: () => extract(deps),
    transform: () => transform(deps),
    audio: () => audio(deps),
    concat: () => concat(deps),
    exportVideo: () => exportVideo(deps),
    overlay: () => overlay(deps),
    text: () => text(deps),
    subtitle: () => subtitle(deps),
    image: () => image(deps),
    hls: () => hls(deps),
    dash: () => dash(deps),
    gif: () => gif(deps),

    // ── Filter Graph ──
    filterGraph,
    filter,
    chain,

    // ── Hardware ──
    detectHardware: () => detectHardware({ ffmpegPath }, hwRef),

    // ── Convenience ──
    pipeline: () => pipeline(deps),
    batch: (options) => batch(options),

    smartTranscode: (options, executeOptions) => smartTranscode(deps, options, executeOptions),
    thumbnailSheet: (options, executeOptions) => thumbnailSheet(deps, options, executeOptions),
    waveform: (options, executeOptions) => waveform(deps, options, executeOptions),
    estimateSize: (options) => estimateSize(deps, options),
    detectSilence: (input, options, executeOptions) =>
      detectSilence(deps, input, options, executeOptions),
    trimSilence: (options, executeOptions) => trimSilence(deps, options, executeOptions),
    splitOnSilence: (options, executeOptions) => splitOnSilence(deps, options, executeOptions),
    normalizeMedia: (options, executeOptions) => normalizeMedia(deps, options, executeOptions),

    remux: (input, output, executeOptions) => remux(deps, input, output, executeOptions),
    compress: (input, output, options, executeOptions) =>
      compress(deps, input, output, options, executeOptions),
    extractAudio: (input, output, options, executeOptions) =>
      extractAudio(deps, input, output, options, executeOptions),
    imageToVideo: (input, output, options, executeOptions) =>
      imageToVideo(deps, input, output, options, executeOptions),
    resize: (input, output, options, executeOptions) =>
      resize(deps, input, output, options, executeOptions),
  };

  return sdk;
}

/** Default SDK instance with auto-detected paths and default config */
export const ffmpeg: FFmpegSDK = createFFmpeg();

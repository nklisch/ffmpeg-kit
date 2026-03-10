import { readdirSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { execute as runFFmpeg } from "../core/execute.ts";
import type { AudioCodec, VideoCodec } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, StreamResult } from "../types/results.ts";
import { missingFieldError, wrapTryExecute } from "../util/builder-helpers.ts";

// --- HLS Types ---

export type HlsFlag =
  | "single_file"
  | "temp_file"
  | "delete_segments"
  | "round_durations"
  | "discont_start"
  | "omit_endlist"
  | "split_by_time"
  | "append_list"
  | "program_date_time"
  | "independent_segments"
  | "iframes_only"
  | "periodic_rekey";

export type HlsSegmentType = "mpegts" | "fmp4";
export type HlsPlaylistType = "event" | "vod";

export interface HlsEncryptConfig {
  keyInfoFile?: string;
  key?: string;
  keyUrl?: string;
  iv?: string;
}

export interface HlsVariantConfig {
  videoBitrate: string;
  audioBitrate: string;
  resolution: { width: number; height: number };
  codec?: VideoCodec;
}

// --- HLS Internal State ---

interface HlsState {
  inputPath?: string;
  segmentDurationValue?: number;
  listSizeValue?: number;
  segmentFilenameValue?: string;
  segmentTypeValue?: HlsSegmentType;
  initFilenameValue?: string;
  playlistTypeValue?: HlsPlaylistType;
  encryptConfig?: HlsEncryptConfig;
  baseUrlValue?: string;
  hlsFlags?: HlsFlag[];
  videoCodecValue?: VideoCodec;
  crfValue?: number;
  audioCodecValue?: AudioCodec;
  audioBitrateValue?: string;
  outputPath?: string;
}

function validateStreamingState<T extends { inputPath?: string; outputPath?: string }>(
  state: T,
): asserts state is T & { inputPath: string; outputPath: string } {
  if (!state.inputPath) throw missingFieldError("input");
  if (!state.outputPath) throw missingFieldError("output");
}

function buildHlsArgs(state: HlsState): string[] {
  const args: string[] = ["-y"];

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push("-i", state.inputPath!);

  // Codec args
  const videoCodec = state.videoCodecValue ?? "libx264";
  args.push("-c:v", videoCodec);
  if (state.crfValue !== undefined) {
    args.push("-crf", String(state.crfValue));
  }
  const audioCodec = state.audioCodecValue ?? "aac";
  args.push("-c:a", audioCodec);
  if (state.audioBitrateValue !== undefined) {
    args.push("-b:a", state.audioBitrateValue);
  }

  // HLS format
  args.push("-f", "hls");

  const segmentDuration = state.segmentDurationValue ?? 2;
  args.push("-hls_time", String(segmentDuration));

  const listSize = state.listSizeValue ?? 0;
  args.push("-hls_list_size", String(listSize));

  const segmentType = state.segmentTypeValue;
  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  const outputDir = dirname(state.outputPath!);

  if (segmentType === "fmp4") {
    args.push("-hls_segment_type", "fmp4");
    // init filename is relative to the playlist file — do NOT use an absolute path
    const initFilename = state.initFilenameValue ?? "init.mp4";
    args.push("-hls_fmp4_init_filename", initFilename);
  }

  // Segment filename — use absolute path so segments land next to the playlist
  const defaultSegmentPattern = segmentType === "fmp4" ? "segment_%03d.m4s" : "segment_%03d.ts";
  const segmentFilename = state.segmentFilenameValue ?? join(outputDir, defaultSegmentPattern);
  args.push("-hls_segment_filename", segmentFilename);

  if (state.playlistTypeValue !== undefined) {
    args.push("-hls_playlist_type", state.playlistTypeValue);
  }

  if (state.baseUrlValue !== undefined) {
    args.push("-hls_base_url", state.baseUrlValue);
  }

  if (state.hlsFlags !== undefined && state.hlsFlags.length > 0) {
    args.push("-hls_flags", state.hlsFlags.join("+"));
  }

  if (state.encryptConfig !== undefined) {
    if (state.encryptConfig.keyInfoFile !== undefined) {
      args.push("-hls_key_info_file", state.encryptConfig.keyInfoFile);
    }
    if (
      (state.encryptConfig.key !== undefined || state.encryptConfig.iv !== undefined) &&
      state.encryptConfig.keyInfoFile === undefined
    ) {
      throw new FFmpegError({
        code: FFmpegErrorCode.ENCODING_FAILED,
        message: "HLS encryption with key/iv requires keyInfoFile. Please create a key info file.",
        stderr: "",
        command: [],
        exitCode: 0,
      });
    }
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push(state.outputPath!);
  return args;
}

function collectSegments(outputPath: string): string[] {
  const dir = dirname(outputPath);
  const outputBase = basename(outputPath);
  try {
    const files = readdirSync(dir);
    return files
      .filter((f) => /\.(ts|m4s|m4a|mp4)$/.test(f) && f !== outputBase)
      .map((f) => join(dir, f))
      .sort();
  } catch {
    return [];
  }
}

// --- HLS Builder Interface ---

export interface HlsBuilder {
  input(path: string): this;
  segmentDuration(seconds: number): this;
  listSize(count: number): this;
  segmentFilename(pattern: string): this;
  segmentType(type: HlsSegmentType): this;
  initFilename(name: string): this;
  playlistType(type: HlsPlaylistType): this;
  encrypt(config: HlsEncryptConfig): this;
  baseUrl(url: string): this;
  flags(flags: HlsFlag[]): this;
  variants(configs: HlsVariantConfig[]): this;
  videoCodec(codec: VideoCodec): this;
  crf(value: number): this;
  audioCodec(codec: AudioCodec): this;
  audioBitrate(bitrate: string): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<StreamResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<StreamResult>>;
}

export function hls(): HlsBuilder {
  const state: HlsState = {};

  const builder: HlsBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },
    segmentDuration(seconds) {
      state.segmentDurationValue = seconds;
      return this;
    },
    listSize(count) {
      state.listSizeValue = count;
      return this;
    },
    segmentFilename(pattern) {
      state.segmentFilenameValue = pattern;
      return this;
    },
    segmentType(type) {
      state.segmentTypeValue = type;
      return this;
    },
    initFilename(name) {
      state.initFilenameValue = name;
      return this;
    },
    playlistType(type) {
      state.playlistTypeValue = type;
      return this;
    },
    encrypt(config) {
      state.encryptConfig = config;
      return this;
    },
    baseUrl(url) {
      state.baseUrlValue = url;
      return this;
    },
    flags(flags) {
      state.hlsFlags = flags;
      return this;
    },
    variants(_configs) {
      throw new FFmpegError({
        code: FFmpegErrorCode.ENCODING_FAILED,
        message:
          "Multi-variant HLS is not yet supported. Create multiple HLS outputs manually instead.",
        stderr: "",
        command: [],
        exitCode: 0,
      });
    },
    videoCodec(codec) {
      state.videoCodecValue = codec;
      return this;
    },
    crf(value) {
      state.crfValue = value;
      return this;
    },
    audioCodec(codec) {
      state.audioCodecValue = codec;
      return this;
    },
    audioBitrate(bitrate) {
      state.audioBitrateValue = bitrate;
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateStreamingState(state);
      return buildHlsArgs(state);
    },

    async execute(options) {
      validateStreamingState(state);
      const args = buildHlsArgs(state);
      await runFFmpeg(args, options);
      const segments = collectSegments(state.outputPath);
      return {
        outputPath: state.outputPath,
        segments,
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

// --- DASH Types ---

interface DashState {
  inputPath?: string;
  segmentDurationValue?: number;
  adaptationSetsValue?: string;
  initSegNameValue?: string;
  mediaSegNameValue?: string;
  useTemplateValue?: boolean;
  useTimelineValue?: boolean;
  singleFileValue?: boolean;
  videoCodecValue?: VideoCodec;
  audioCodecValue?: AudioCodec;
  outputPath?: string;
}


function buildDashArgs(state: DashState): string[] {
  const args: string[] = ["-y"];

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push("-i", state.inputPath!);

  const videoCodec = state.videoCodecValue ?? "libx264";
  args.push("-c:v", videoCodec);

  const audioCodec = state.audioCodecValue ?? "aac";
  args.push("-c:a", audioCodec);

  args.push("-f", "dash");

  if (state.segmentDurationValue !== undefined) {
    args.push("-seg_duration", String(state.segmentDurationValue));
  }

  const adaptationSets = state.adaptationSetsValue ?? "id=0,streams=v id=1,streams=a";
  args.push("-adaptation_sets", adaptationSets);

  if (state.initSegNameValue !== undefined) {
    args.push("-init_seg_name", state.initSegNameValue);
  }

  if (state.mediaSegNameValue !== undefined) {
    args.push("-media_seg_name", state.mediaSegNameValue);
  }

  // Defaults: useTemplate=true, useTimeline=true
  const useTemplate = state.useTemplateValue ?? true;
  args.push("-use_template", useTemplate ? "1" : "0");

  const useTimeline = state.useTimelineValue ?? true;
  args.push("-use_timeline", useTimeline ? "1" : "0");

  if (state.singleFileValue === true) {
    args.push("-single_file", "1");
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers
  args.push(state.outputPath!);
  return args;
}

// --- DASH Builder Interface ---

export interface DashBuilder {
  input(path: string): this;
  segmentDuration(seconds: number): this;
  adaptationSets(sets: string): this;
  initSegName(name: string): this;
  mediaSegName(name: string): this;
  useTemplate(enabled?: boolean): this;
  useTimeline(enabled?: boolean): this;
  singleFile(enabled?: boolean): this;
  videoCodec(codec: VideoCodec): this;
  audioCodec(codec: AudioCodec): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<StreamResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<StreamResult>>;
}

export function dash(): DashBuilder {
  const state: DashState = {};

  const builder: DashBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },
    segmentDuration(seconds) {
      state.segmentDurationValue = seconds;
      return this;
    },
    adaptationSets(sets) {
      state.adaptationSetsValue = sets;
      return this;
    },
    initSegName(name) {
      state.initSegNameValue = name;
      return this;
    },
    mediaSegName(name) {
      state.mediaSegNameValue = name;
      return this;
    },
    useTemplate(enabled = true) {
      state.useTemplateValue = enabled;
      return this;
    },
    useTimeline(enabled = true) {
      state.useTimelineValue = enabled;
      return this;
    },
    singleFile(enabled = true) {
      state.singleFileValue = enabled;
      return this;
    },
    videoCodec(codec) {
      state.videoCodecValue = codec;
      return this;
    },
    audioCodec(codec) {
      state.audioCodecValue = codec;
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateStreamingState(state);
      return buildDashArgs(state);
    },

    async execute(options) {
      validateStreamingState(state);
      const args = buildDashArgs(state);
      await runFFmpeg(args, options);
      const segments = collectSegments(state.outputPath);
      return {
        outputPath: state.outputPath,
        segments,
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

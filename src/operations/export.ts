import { writeFileSync } from "node:fs";
import {
  audioEncoderConfigToArgs,
  buildEncoderConfig,
  encoderConfigToArgs,
} from "../encoding/config.ts";
import { getPreset } from "../encoding/presets.ts";
import type {
  AudioCodec,
  AudioEncoderConfig,
  ContainerFormat,
  EncoderConfig,
  EncodingPreset,
  ExportPreset,
  HwAccelMode,
  PixelFormat,
  QualityTier,
  VideoCodec,
} from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { ExportResult, OperationResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";
import { defaultDeps, missingFieldError, probeOutput, wrapTryExecute } from "../util/builder-helpers.ts";
import { createTempFile } from "../util/tempfile.ts";

// --- Internal State ---

interface ExportState {
  videoInputPath?: string;
  audioInputPath?: string;
  inputPath?: string;
  presetName?: ExportPreset;
  qualityTierValue?: QualityTier;
  videoCodecValue?: VideoCodec;
  crfValue?: number;
  videoBitrateValue?: string;
  maxVideoBitrateValue?: string;
  encodingPresetValue?: EncodingPreset;
  pixelFormatValue?: PixelFormat;
  profileValue?: string;
  levelValue?: string;
  tuneValue?: string;
  audioCodecValue?: AudioCodec;
  audioBitrateValue?: string;
  audioSampleRateValue?: number;
  audioChannelsValue?: number;
  faststartEnabled?: boolean;
  formatValue?: ContainerFormat;
  hwAccelMode?: HwAccelMode;
  twoPassEnabled?: boolean;
  mapStreams?: string[];
  outputArgsValue?: string[];
  inputArgsValue?: string[];
  metadataValue?: Record<string, string>;
  chaptersValue?: Array<{ start: number; end: number; title: string }>;
  outputPath?: string;
}

// --- Builder Interface ---

export interface ExportBuilder {
  videoInput(path: string): this;
  audioInput(path: string): this;
  input(path: string): this;
  preset(preset: ExportPreset): this;
  qualityTier(tier: QualityTier): this;
  videoCodec(codec: VideoCodec): this;
  crf(value: number): this;
  videoBitrate(bitrate: string): this;
  maxVideoBitrate(bitrate: string): this;
  encodingPreset(preset: EncodingPreset): this;
  pixelFormat(format: PixelFormat): this;
  profile(profile: string): this;
  level(level: string): this;
  tune(tune: string): this;
  audioCodec(codec: AudioCodec): this;
  audioBitrate(bitrate: string): this;
  audioSampleRate(rate: number): this;
  audioChannels(count: number): this;
  faststart(enabled?: boolean): this;
  format(fmt: ContainerFormat): this;
  hwAccel(mode: HwAccelMode): this;
  twoPass(enabled?: boolean): this;
  map(streams: string[]): this;
  outputArgs(args: string[]): this;
  inputArgs(args: string[]): this;
  metadata(meta: Record<string, string>): this;
  chapters(chapters: Array<{ start: number; end: number; title: string }>): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ExportResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ExportResult>>;
}

// --- Helpers ---

function validateExportState(
  state: ExportState,
): asserts state is ExportState & { outputPath: string } {
  if (!state.inputPath && !state.videoInputPath) throw missingFieldError("input or videoInput");
  if (!state.outputPath) throw missingFieldError("output");
}

/** Maps ContainerFormat to FFmpeg -f flag value */
const FORMAT_FLAG_MAP: Partial<Record<ContainerFormat, string>> = {
  mkv: "matroska",
  ts: "mpegts",
};

function resolveFormatFlag(fmt: ContainerFormat): string {
  return FORMAT_FLAG_MAP[fmt] ?? fmt;
}

function isMovContainerOutput(state: ExportState & { outputPath: string }): boolean {
  if (state.formatValue !== undefined) {
    return state.formatValue === "mp4" || state.formatValue === "mov";
  }
  if (state.presetName !== undefined) {
    const preset = getPreset(state.presetName);
    if (preset !== undefined) {
      return preset.format === "mp4" || preset.format === "mov";
    }
  }
  const ext = state.outputPath.split(".").pop()?.toLowerCase();
  return ext === "mp4" || ext === "mov";
}

function shouldAddFaststart(state: ExportState & { outputPath: string }): boolean {
  if (state.faststartEnabled !== undefined) {
    return state.faststartEnabled;
  }
  return isMovContainerOutput(state);
}

function buildVideoArgs(state: ExportState, passNumber?: 1 | 2, passLogFile?: string): string[] {
  // Determine base EncoderConfig: preset > default, then qualityTier overrides, then explicit codec
  let config: EncoderConfig;

  if (state.presetName !== undefined) {
    const preset = getPreset(state.presetName);
    config =
      preset !== undefined
        ? { ...preset.video }
        : { codec: "libx264", crf: 23, preset: "ultrafast", pixelFormat: "yuv420p" };
  } else {
    config = { codec: "libx264", crf: 23, preset: "ultrafast", pixelFormat: "yuv420p" };
  }

  // qualityTier overrides preset's video config entirely
  if (state.qualityTierValue !== undefined) {
    const hwMode =
      state.hwAccelMode !== undefined && state.hwAccelMode !== "auto" ? state.hwAccelMode : "cpu";
    config = buildEncoderConfig(state.qualityTierValue, hwMode);
  }

  // Explicit individual overrides (always win)
  if (state.videoCodecValue !== undefined) config.codec = state.videoCodecValue;
  if (state.crfValue !== undefined) config.crf = state.crfValue;
  if (state.videoBitrateValue !== undefined) config.videoBitrate = state.videoBitrateValue;
  if (state.maxVideoBitrateValue !== undefined) config.maxBitrate = state.maxVideoBitrateValue;
  if (state.encodingPresetValue !== undefined) config.preset = state.encodingPresetValue;
  if (state.pixelFormatValue !== undefined) config.pixelFormat = state.pixelFormatValue;
  if (state.profileValue !== undefined) config.profile = state.profileValue;
  if (state.levelValue !== undefined) config.level = state.levelValue;
  if (state.tuneValue !== undefined) config.tune = state.tuneValue;

  // Two-pass pass info
  if (passNumber !== undefined && passLogFile !== undefined) {
    config.pass = passNumber;
    config.passLogFile = passLogFile;
  }

  return encoderConfigToArgs(config);
}

function buildAudioArgs(state: ExportState): string[] {
  let config: AudioEncoderConfig;

  if (state.presetName !== undefined) {
    const preset = getPreset(state.presetName);
    config = preset !== undefined ? { ...preset.audio } : { codec: "aac", bitrate: "128k" };
  } else {
    config = { codec: "aac", bitrate: "128k" };
  }

  // Explicit individual overrides
  if (state.audioCodecValue !== undefined) config.codec = state.audioCodecValue;
  if (state.audioBitrateValue !== undefined) config.bitrate = state.audioBitrateValue;
  if (state.audioSampleRateValue !== undefined) config.sampleRate = state.audioSampleRateValue;
  if (state.audioChannelsValue !== undefined) config.channels = state.audioChannelsValue;

  return audioEncoderConfigToArgs(config);
}

function writeChapterFile(
  chapters: Array<{ start: number; end: number; title: string }>,
  filePath: string,
): void {
  const lines: string[] = [";FFMETADATA1"];
  for (const chapter of chapters) {
    lines.push("[CHAPTER]");
    lines.push("TIMEBASE=1/1");
    lines.push(`START=${chapter.start}`);
    lines.push(`END=${chapter.end}`);
    lines.push(`title=${chapter.title}`);
  }
  writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

function buildArgs(
  state: ExportState & { outputPath: string },
  passNumber?: 1 | 2,
  passLogFile?: string,
  chapterFilePath?: string,
): string[] {
  const args: string[] = ["-y"];

  // Input args
  if (state.inputArgsValue !== undefined && state.inputArgsValue.length > 0) {
    args.push(...state.inputArgsValue);
  }

  // Main video (or combined) input
  const mainInput = state.videoInputPath ?? state.inputPath;
  // biome-ignore lint/style/noNonNullAssertion: validated before calling
  args.push("-i", mainInput!);

  let inputCount = 1;

  if (state.audioInputPath !== undefined) {
    args.push("-i", state.audioInputPath);
    inputCount++;
  }

  if (chapterFilePath !== undefined) {
    args.push("-i", chapterFilePath);
    inputCount++;
  }

  // Video codec args
  args.push(...buildVideoArgs(state, passNumber, passLogFile));

  // Audio: skip for pass 1
  if (passNumber === 1) {
    args.push("-an");
  } else {
    args.push(...buildAudioArgs(state));
  }

  // Faststart (mp4/mov only)
  if (passNumber !== 1 && shouldAddFaststart(state)) {
    args.push("-movflags", "+faststart");
  }

  // Format
  if (state.formatValue !== undefined) {
    args.push("-f", resolveFormatFlag(state.formatValue));
  }

  // Stream mapping
  if (state.mapStreams !== undefined && state.mapStreams.length > 0) {
    for (const stream of state.mapStreams) {
      args.push("-map", stream);
    }
  } else if (state.videoInputPath !== undefined && state.audioInputPath !== undefined) {
    args.push("-map", "0:v:0", "-map", "1:a:0");
  }

  // Chapter metadata mapping
  if (chapterFilePath !== undefined) {
    const chapterIndex = inputCount - 1;
    args.push("-map_metadata", String(chapterIndex));
  }

  // Metadata tags
  if (state.metadataValue !== undefined) {
    for (const [key, value] of Object.entries(state.metadataValue)) {
      args.push("-metadata", `${key}=${value}`);
    }
  }

  // Extra output args
  if (state.outputArgsValue !== undefined && state.outputArgsValue.length > 0) {
    args.push(...state.outputArgsValue);
  }

  // Output path
  if (passNumber === 1) {
    args.push("-f", "null", "/dev/null");
  } else {
    args.push(state.outputPath);
  }

  return args;
}

// --- Factory ---

export function exportVideo(deps: BuilderDeps = defaultDeps): ExportBuilder {
  const state: ExportState = {};

  const builder: ExportBuilder = {
    videoInput(path) {
      state.videoInputPath = path;
      return this;
    },
    audioInput(path) {
      state.audioInputPath = path;
      return this;
    },
    input(path) {
      state.inputPath = path;
      return this;
    },
    preset(preset) {
      state.presetName = preset;
      return this;
    },
    qualityTier(tier) {
      state.qualityTierValue = tier;
      return this;
    },
    videoCodec(codec) {
      state.videoCodecValue = codec;
      return this;
    },
    crf(value) {
      state.crfValue = value;
      return this;
    },
    videoBitrate(bitrate) {
      state.videoBitrateValue = bitrate;
      return this;
    },
    maxVideoBitrate(bitrate) {
      state.maxVideoBitrateValue = bitrate;
      return this;
    },
    encodingPreset(preset) {
      state.encodingPresetValue = preset;
      return this;
    },
    pixelFormat(format) {
      state.pixelFormatValue = format;
      return this;
    },
    profile(profile) {
      state.profileValue = profile;
      return this;
    },
    level(level) {
      state.levelValue = level;
      return this;
    },
    tune(tune) {
      state.tuneValue = tune;
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
    audioSampleRate(rate) {
      state.audioSampleRateValue = rate;
      return this;
    },
    audioChannels(count) {
      state.audioChannelsValue = count;
      return this;
    },
    faststart(enabled = true) {
      state.faststartEnabled = enabled;
      return this;
    },
    format(fmt) {
      state.formatValue = fmt;
      return this;
    },
    hwAccel(mode) {
      state.hwAccelMode = mode;
      return this;
    },
    twoPass(enabled = true) {
      state.twoPassEnabled = enabled;
      return this;
    },
    map(streams) {
      state.mapStreams = streams;
      return this;
    },
    outputArgs(args) {
      state.outputArgsValue = args;
      return this;
    },
    inputArgs(args) {
      state.inputArgsValue = args;
      return this;
    },
    metadata(meta) {
      state.metadataValue = meta;
      return this;
    },
    chapters(chapters) {
      state.chaptersValue = chapters;
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateExportState(state);
      if (state.twoPassEnabled === true) {
        throw new FFmpegError({
          code: FFmpegErrorCode.ENCODING_FAILED,
          message: "Two-pass encoding requires execute() — toArgs() cannot run two passes",
          stderr: "",
          command: [],
          exitCode: 0,
        });
      }
      return buildArgs(state);
    },

    async execute(options) {
      validateExportState(state);

      const outPath = state.outputPath;

      // Prepare chapter file if needed
      let chapterTempFile: ReturnType<typeof createTempFile> | undefined;
      if (state.chaptersValue !== undefined && state.chaptersValue.length > 0) {
        chapterTempFile = createTempFile({ suffix: ".txt", subdir: "export-chapters" }, deps.tempDir);
        writeChapterFile(state.chaptersValue, chapterTempFile.path);
      }

      try {
        if (state.twoPassEnabled === true) {
          const passLog = createTempFile({ subdir: "export-passlog" }, deps.tempDir);
          try {
            await deps.execute(buildArgs(state, 1, passLog.path, chapterTempFile?.path), options);
            await deps.execute(buildArgs(state, 2, passLog.path, chapterTempFile?.path), options);
          } finally {
            // Clean up passlog files (FFmpeg creates .log and .log.mbtree)
            passLog.cleanup();
            try {
              const { unlinkSync } = await import("node:fs");
              for (const ext of [".log", ".log.mbtree"]) {
                try {
                  unlinkSync(`${passLog.path}${ext}`);
                } catch {
                  // ignore
                }
              }
            } catch {
              // ignore
            }
          }
        } else {
          await deps.execute(buildArgs(state, undefined, undefined, chapterTempFile?.path), options);
        }
      } finally {
        chapterTempFile?.cleanup();
      }

      const { outputPath, duration, sizeBytes, probeResult } = await probeOutput(outPath, deps.probe);
      const videoStream = probeResult.streams.find((s) => s.type === "video");
      const audioStream = probeResult.streams.find((s) => s.type === "audio");

      return {
        outputPath,
        duration,
        sizeBytes,
        videoCodec: videoStream?.codec ?? "unknown",
        audioCodec: audioStream?.codec ?? "unknown",
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

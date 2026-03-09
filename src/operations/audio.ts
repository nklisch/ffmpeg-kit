import { statSync } from "node:fs";
import { execute as runFFmpeg } from "../core/execute.ts";
import { getAudioStream, getDuration } from "../core/probe.ts";
import type { AudioCodec } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { AudioInputConfig, DuckConfig, FadeCurve, NormalizeConfig } from "../types/filters.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { AudioResult, OperationResult } from "../types/results.ts";
import { buildAtempoChain } from "../util/audio-filters.ts";

// --- Internal State ---

interface AudioState {
  inputPath?: string;
  additionalInputs: Array<{ path: string; config?: AudioInputConfig }>;
  extractAudioConfig?: {
    codec?: AudioCodec;
    bitrate?: string;
    sampleRate?: number;
    channels?: number;
  };
  duckConfig?: DuckConfig;
  normalizeConfig?: NormalizeConfig;
  fadeInConfig?: { duration: number; curve?: FadeCurve };
  fadeOutConfig?: { duration: number; startAt?: number; curve?: FadeCurve };
  compressConfig?: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
    makeupGain?: number;
    knee?: number;
  };
  limitConfig?: { limit?: number; attack?: number; release?: number };
  eqConfigs: Array<{
    frequency: number;
    width?: number;
    widthType?: "h" | "q" | "o" | "s";
    gain: number;
  }>;
  highpassFreq?: { frequency: number; order?: number };
  lowpassFreq?: { frequency: number; order?: number };
  bassConfig?: { gain: number; frequency?: number };
  trebleConfig?: { gain: number; frequency?: number };
  gateConfig?: { threshold?: number; attack?: number; release?: number };
  denoiseConfig?: { amount?: number; method?: "afftdn" | "anlmdn" };
  deessConfig?: { frequency?: number; intensity?: number };
  echoConfig?: { delay?: number; decay?: number };
  tempoFactor?: number;
  pitchSemitones?: number;
  resampleConfig?: { sampleRate: number; useSoxr?: boolean };
  codecValue?: AudioCodec;
  bitrateValue?: string;
  sampleRateValue?: number;
  channelsValue?: number;
  channelLayoutValue?: string;
  detectSilenceConfig?: { threshold?: number; duration?: number };
  extractAmplitudeConfig?: { fps: number; outputFormat?: "f32le" | "json" };
  outputPath?: string;
}

// --- Builder Interface ---

export interface AudioBuilder {
  input(path: string): this;
  addInput(path: string, config?: AudioInputConfig): this;
  extractAudio(options?: {
    codec?: AudioCodec;
    bitrate?: string;
    sampleRate?: number;
    channels?: number;
  }): this;
  duck(config: DuckConfig): this;
  normalize(config: NormalizeConfig): this;
  fadeIn(config: { duration: number; curve?: FadeCurve }): this;
  fadeOut(config: { duration: number; startAt?: number; curve?: FadeCurve }): this;
  compress(config?: {
    threshold?: number;
    ratio?: number;
    attack?: number;
    release?: number;
    makeupGain?: number;
    knee?: number;
  }): this;
  limit(config?: { limit?: number; attack?: number; release?: number }): this;
  eq(config: {
    frequency: number;
    width?: number;
    widthType?: "h" | "q" | "o" | "s";
    gain: number;
  }): this;
  highpass(frequency: number, order?: number): this;
  lowpass(frequency: number, order?: number): this;
  bass(gain: number, frequency?: number): this;
  treble(gain: number, frequency?: number): this;
  gate(config?: { threshold?: number; attack?: number; release?: number }): this;
  denoise(config?: { amount?: number; method?: "afftdn" | "anlmdn" }): this;
  deess(config?: { frequency?: number; intensity?: number }): this;
  echo(config?: { delay?: number; decay?: number }): this;
  tempo(factor: number): this;
  pitch(semitones: number): this;
  resample(sampleRate: number, useSoxr?: boolean): this;
  codec(codec: AudioCodec): this;
  bitrate(bitrate: string): this;
  sampleRate(rate: number): this;
  channels(count: number): this;
  channelLayout(layout: string): this;
  detectSilence(config?: { threshold?: number; duration?: number }): this;
  extractAmplitude(config: { fps: number; outputFormat?: "f32le" | "json" }): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<AudioResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<AudioResult>>;
}

// --- Helper ---

function missingFieldError(field: string): FFmpegError {
  return new FFmpegError({
    code: FFmpegErrorCode.ENCODING_FAILED,
    message: `${field}() is required`,
    stderr: "",
    command: [],
    exitCode: 0,
  });
}

// --- Filter Chain Construction ---

function buildAudioFilters(state: AudioState, fadeOutStart?: number): string[] {
  const filters: string[] = [];

  // 1. highpass
  if (state.highpassFreq !== undefined) {
    const order = state.highpassFreq.order ?? 2;
    filters.push(`highpass=f=${state.highpassFreq.frequency}:poles=${order}`);
  }

  // 2. lowpass
  if (state.lowpassFreq !== undefined) {
    const order = state.lowpassFreq.order ?? 2;
    filters.push(`lowpass=f=${state.lowpassFreq.frequency}:poles=${order}`);
  }

  // 3. gate
  if (state.gateConfig !== undefined) {
    const threshold = state.gateConfig.threshold ?? -30;
    const attack = state.gateConfig.attack ?? 20;
    const release = state.gateConfig.release ?? 250;
    filters.push(`agate=threshold=${threshold}dB:attack=${attack}:release=${release}`);
  }

  // 4. denoise
  if (state.denoiseConfig !== undefined) {
    const method = state.denoiseConfig.method ?? "afftdn";
    if (method === "afftdn") {
      const amount = state.denoiseConfig.amount ?? -25;
      filters.push(`afftdn=nf=${amount}`);
    } else {
      const amount = state.denoiseConfig.amount ?? 1;
      filters.push(`anlmdn=s=${amount}`);
    }
  }

  // 5. deess (implemented as parametric EQ targeting sibilance)
  if (state.deessConfig !== undefined) {
    const freq = state.deessConfig.frequency ?? 6000;
    const intensity = state.deessConfig.intensity ?? 6;
    filters.push(`equalizer=f=${freq}:t=q:w=2:g=-${intensity}`);
  }

  // 6. eq (multiple eq nodes)
  for (const eq of state.eqConfigs) {
    const widthType = eq.widthType ?? "q";
    const width = eq.width ?? 1;
    filters.push(`equalizer=f=${eq.frequency}:width_type=${widthType}:w=${width}:g=${eq.gain}`);
  }

  // 7. bass
  if (state.bassConfig !== undefined) {
    const freq = state.bassConfig.frequency ?? 100;
    filters.push(`bass=g=${state.bassConfig.gain}:f=${freq}`);
  }

  // 8. treble
  if (state.trebleConfig !== undefined) {
    const freq = state.trebleConfig.frequency ?? 3000;
    filters.push(`treble=g=${state.trebleConfig.gain}:f=${freq}`);
  }

  // 9. compress
  if (state.compressConfig !== undefined) {
    const threshold = state.compressConfig.threshold ?? -20;
    const ratio = state.compressConfig.ratio ?? 4;
    const attack = state.compressConfig.attack ?? 20;
    const release = state.compressConfig.release ?? 250;
    const makeup = state.compressConfig.makeupGain ?? 0;
    const knee = state.compressConfig.knee ?? 2.8;
    filters.push(
      `acompressor=threshold=${threshold}dB:ratio=${ratio}:attack=${attack}:release=${release}:makeup=${makeup}:knee=${knee}`,
    );
  }

  // 10. limit
  if (state.limitConfig !== undefined) {
    const limit = state.limitConfig.limit ?? 1;
    const attack = state.limitConfig.attack ?? 5;
    const release = state.limitConfig.release ?? 50;
    filters.push(`alimiter=limit=${limit}:attack=${attack}:release=${release}`);
  }

  // 11. normalize (single-pass loudnorm)
  if (state.normalizeConfig !== undefined && !state.normalizeConfig.twoPass) {
    const i = state.normalizeConfig.targetLufs;
    const tp = state.normalizeConfig.truePeak ?? -1.5;
    const lra = state.normalizeConfig.loudnessRange ?? 11;
    filters.push(`loudnorm=I=${i}:TP=${tp}:LRA=${lra}`);
  }

  // 12. tempo
  if (state.tempoFactor !== undefined) {
    filters.push(buildAtempoChain(state.tempoFactor));
  }

  // 13. pitch
  if (state.pitchSemitones !== undefined) {
    const scale = 2 ** (state.pitchSemitones / 12);
    filters.push(`rubberband=pitch=${scale}`);
  }

  // 14. fadeIn
  if (state.fadeInConfig !== undefined) {
    const curve = state.fadeInConfig.curve ?? "tri";
    filters.push(`afade=t=in:d=${state.fadeInConfig.duration}:curve=${curve}`);
  }

  // 15. fadeOut
  if (state.fadeOutConfig !== undefined) {
    const curve = state.fadeOutConfig.curve ?? "tri";
    if (fadeOutStart !== undefined) {
      filters.push(
        `afade=t=out:d=${state.fadeOutConfig.duration}:st=${fadeOutStart}:curve=${curve}`,
      );
    } else if (state.fadeOutConfig.startAt !== undefined) {
      filters.push(
        `afade=t=out:d=${state.fadeOutConfig.duration}:st=${state.fadeOutConfig.startAt}:curve=${curve}`,
      );
    } else {
      filters.push(`afade=t=out:d=${state.fadeOutConfig.duration}:curve=${curve}`);
    }
  }

  // 16. echo
  if (state.echoConfig !== undefined) {
    const delay = state.echoConfig.delay ?? 60;
    const decay = state.echoConfig.decay ?? 0.4;
    filters.push(`aecho=0.8:0.88:${delay}:${decay}`);
  }

  // 17. resample
  if (state.resampleConfig !== undefined) {
    const soxr = state.resampleConfig.useSoxr === true ? ":resampler=soxr" : "";
    filters.push(`aresample=${state.resampleConfig.sampleRate}${soxr}`);
  }

  return filters;
}

function buildVolumeFilter(vol: number | string): string {
  if (typeof vol === "string") {
    return `volume=${vol}`;
  }
  return `volume=${vol}`;
}

function buildMultiInputArgs(state: AudioState): string[] {
  const args: string[] = ["-y"];

  // biome-ignore lint/style/noNonNullAssertion: validated before calling
  args.push("-i", state.inputPath!);
  for (const input of state.additionalInputs) {
    args.push("-i", input.path);
  }

  // biome-ignore lint/style/noNonNullAssertion: validated by callers before calling buildMultiInputArgs
  const primaryInput = state.inputPath!;
  const allInputs = [
    { path: primaryInput, config: undefined as AudioInputConfig | undefined },
    ...state.additionalInputs,
  ];
  const filterParts: string[] = [];

  // When duck is configured, use sidechain compression
  if (state.duckConfig !== undefined) {
    const trigger = state.duckConfig.trigger;
    const threshold = state.duckConfig.threshold ?? -30;
    const attackMs = (state.duckConfig.attackMs ?? 20) / 1000;
    const releaseMs = (state.duckConfig.releaseMs ?? 250) / 1000;
    // amount dB -> ratio: ratio = 10^(abs(amount)/20)
    const amount = Math.abs(state.duckConfig.amount);
    const ratio = 10 ** (amount / 20);
    filterParts.push(
      `[0:a][${trigger}:a]sidechaincompress=threshold=${threshold}dB:ratio=${ratio.toFixed(2)}:attack=${attackMs}:release=${releaseMs}[out]`,
    );
    args.push("-filter_complex", filterParts.join(";"));
    args.push("-map", "[out]");
  } else {
    // Standard amix
    for (let i = 0; i < allInputs.length; i++) {
      // biome-ignore lint/style/noNonNullAssertion: index is within bounds
      const inp = allInputs[i]!;
      const parts: string[] = [];
      if (inp.config?.volume !== undefined) {
        parts.push(buildVolumeFilter(inp.config.volume));
      }
      if (inp.config?.delay !== undefined) {
        parts.push(`adelay=${inp.config.delay}|${inp.config.delay}`);
      }
      const inLabel = `${i}:a`;
      const outLabel = `a${i}`;
      if (parts.length > 0) {
        filterParts.push(`[${inLabel}]${parts.join(",")}[${outLabel}]`);
      } else {
        filterParts.push(`[${inLabel}]anull[${outLabel}]`);
      }
    }
    const inputLabels = allInputs.map((_, i) => `[a${i}]`).join("");
    filterParts.push(`${inputLabels}amix=inputs=${allInputs.length}:duration=longest[out]`);
    args.push("-filter_complex", filterParts.join(";"));
    args.push("-map", "[out]");
  }

  // Output codec settings
  if (state.codecValue !== undefined) {
    args.push("-c:a", state.codecValue);
  }
  if (state.bitrateValue !== undefined) {
    args.push("-b:a", state.bitrateValue);
  }
  if (state.sampleRateValue !== undefined) {
    args.push("-ar", String(state.sampleRateValue));
  }
  if (state.channelsValue !== undefined) {
    args.push("-ac", String(state.channelsValue));
  }
  if (state.channelLayoutValue !== undefined) {
    args.push("-channel_layout", state.channelLayoutValue);
  }

  // biome-ignore lint/style/noNonNullAssertion: validated before calling
  args.push(state.outputPath!);
  return args;
}

function buildSingleInputArgs(state: AudioState, fadeOutStart?: number): string[] {
  const args: string[] = ["-y"];

  // biome-ignore lint/style/noNonNullAssertion: validated before calling
  args.push("-i", state.inputPath!);

  // Extract audio mode
  if (state.extractAudioConfig !== undefined) {
    args.push("-vn");
    const cfg = state.extractAudioConfig;
    if (cfg.codec !== undefined) {
      args.push("-c:a", cfg.codec);
    }
    if (cfg.bitrate !== undefined) {
      args.push("-b:a", cfg.bitrate);
    }
    if (cfg.sampleRate !== undefined) {
      args.push("-ar", String(cfg.sampleRate));
    }
    if (cfg.channels !== undefined) {
      args.push("-ac", String(cfg.channels));
    }
    // biome-ignore lint/style/noNonNullAssertion: validated before calling
    args.push(state.outputPath!);
    return args;
  }

  // Silence detection mode — uses null output
  if (state.detectSilenceConfig !== undefined) {
    const threshold = state.detectSilenceConfig.threshold ?? -40;
    const duration = state.detectSilenceConfig.duration ?? 0.5;
    args.push("-af", `silencedetect=noise=${threshold}dB:d=${duration}`);
    args.push("-f", "null", "-");
    return args;
  }

  // Standard filter chain
  const filters = buildAudioFilters(state, fadeOutStart);
  if (filters.length > 0) {
    args.push("-af", filters.join(","));
  }

  // Output codec settings
  if (state.codecValue !== undefined) {
    args.push("-c:a", state.codecValue);
  }
  if (state.bitrateValue !== undefined) {
    args.push("-b:a", state.bitrateValue);
  }
  if (state.sampleRateValue !== undefined) {
    args.push("-ar", String(state.sampleRateValue));
  }
  if (state.channelsValue !== undefined) {
    args.push("-ac", String(state.channelsValue));
  }
  if (state.channelLayoutValue !== undefined) {
    args.push("-channel_layout", state.channelLayoutValue);
  }

  // biome-ignore lint/style/noNonNullAssertion: validated before calling
  args.push(state.outputPath!);
  return args;
}

// --- Silence Range Parser ---

interface SilenceRange {
  start: number;
  end: number;
  duration: number;
}

function parseSilenceRanges(stderr: string): SilenceRange[] {
  const ranges: SilenceRange[] = [];
  const _starts = new Map<number, number>();
  let currentStart: number | undefined;

  for (const line of stderr.split("\n")) {
    const startMatch = /silence_start: ([\d.]+)/.exec(line);
    if (startMatch?.[1] !== undefined) {
      currentStart = parseFloat(startMatch[1]);
    }
    const endMatch = /silence_end: ([\d.]+) \| silence_duration: ([\d.]+)/.exec(line);
    if (endMatch?.[1] !== undefined && endMatch[2] !== undefined && currentStart !== undefined) {
      ranges.push({
        start: currentStart,
        end: parseFloat(endMatch[1]),
        duration: parseFloat(endMatch[2]),
      });
      currentStart = undefined;
    }
  }

  return ranges;
}

// --- Two-Pass Loudnorm ---

interface LoudnormMeasurement {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
}

function parseLoudnormJson(stderr: string): LoudnormMeasurement {
  // FFmpeg loudnorm prints: "[Parsed_loudnorm_0 @ ...] " on one line,
  // then the JSON block starting with "{" on the next line(s).
  const lines = stderr.split("\n");
  let inBlock = false;
  let afterLoudnorm = false;
  const jsonLines: string[] = [];

  for (const line of lines) {
    if (line.includes("[Parsed_loudnorm")) {
      // The JSON may start on same line OR next line
      const braceIdx = line.indexOf("{");
      if (braceIdx !== -1) {
        inBlock = true;
        jsonLines.push(line.slice(braceIdx));
      } else {
        // JSON starts on the next line
        afterLoudnorm = true;
      }
      continue;
    }
    if (afterLoudnorm) {
      const trimmed = line.trim();
      if (trimmed.startsWith("{")) {
        inBlock = true;
        afterLoudnorm = false;
        jsonLines.push(trimmed);
        if (trimmed.endsWith("}")) break;
        continue;
      }
    }
    if (inBlock) {
      jsonLines.push(line);
      if (line.trim() === "}") {
        break;
      }
    }
  }

  if (jsonLines.length === 0) {
    throw new FFmpegError({
      code: FFmpegErrorCode.ENCODING_FAILED,
      message: "Two-pass normalization: failed to parse loudnorm measurement from ffmpeg stderr",
      stderr,
      command: [],
      exitCode: 0,
    });
  }

  const parsed = JSON.parse(jsonLines.join("\n")) as LoudnormMeasurement;
  return parsed;
}

// --- Factory ---

export function audio(): AudioBuilder {
  const state: AudioState = {
    additionalInputs: [],
    eqConfigs: [],
  };

  const builder: AudioBuilder = {
    input(path) {
      state.inputPath = path;
      return this;
    },

    addInput(path, config) {
      state.additionalInputs.push({ path, config });
      return this;
    },

    extractAudio(options) {
      state.extractAudioConfig = options ?? {};
      return this;
    },

    duck(config) {
      state.duckConfig = config;
      return this;
    },

    normalize(config) {
      state.normalizeConfig = config;
      return this;
    },

    fadeIn(config) {
      state.fadeInConfig = config;
      return this;
    },

    fadeOut(config) {
      state.fadeOutConfig = config;
      return this;
    },

    compress(config) {
      state.compressConfig = config ?? {};
      return this;
    },

    limit(config) {
      state.limitConfig = config ?? {};
      return this;
    },

    eq(config) {
      state.eqConfigs.push(config);
      return this;
    },

    highpass(frequency, order) {
      state.highpassFreq = { frequency, order };
      return this;
    },

    lowpass(frequency, order) {
      state.lowpassFreq = { frequency, order };
      return this;
    },

    bass(gain, frequency) {
      state.bassConfig = { gain, frequency };
      return this;
    },

    treble(gain, frequency) {
      state.trebleConfig = { gain, frequency };
      return this;
    },

    gate(config) {
      state.gateConfig = config ?? {};
      return this;
    },

    denoise(config) {
      state.denoiseConfig = config ?? {};
      return this;
    },

    deess(config) {
      state.deessConfig = config ?? {};
      return this;
    },

    echo(config) {
      state.echoConfig = config ?? {};
      return this;
    },

    tempo(factor) {
      state.tempoFactor = factor;
      return this;
    },

    pitch(semitones) {
      state.pitchSemitones = semitones;
      return this;
    },

    resample(sampleRate, useSoxr) {
      state.resampleConfig = { sampleRate, useSoxr };
      return this;
    },

    codec(codec) {
      state.codecValue = codec;
      return this;
    },

    bitrate(bitrate) {
      state.bitrateValue = bitrate;
      return this;
    },

    sampleRate(rate) {
      state.sampleRateValue = rate;
      return this;
    },

    channels(count) {
      state.channelsValue = count;
      return this;
    },

    channelLayout(layout) {
      state.channelLayoutValue = layout;
      return this;
    },

    detectSilence(config) {
      state.detectSilenceConfig = config ?? {};
      return this;
    },

    extractAmplitude(config) {
      state.extractAmplitudeConfig = config;
      return this;
    },

    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      if (state.inputPath === undefined) {
        throw missingFieldError("input");
      }
      if (state.detectSilenceConfig === undefined && state.outputPath === undefined) {
        throw missingFieldError("output");
      }
      if (state.normalizeConfig?.twoPass === true) {
        throw new FFmpegError({
          code: FFmpegErrorCode.ENCODING_FAILED,
          message:
            "Two-pass normalization requires two ffmpeg invocations — use execute() instead of toArgs()",
          stderr: "",
          command: [],
          exitCode: 0,
        });
      }

      const isMultiInput = state.additionalInputs.length > 0;
      if (isMultiInput) {
        return buildMultiInputArgs(state);
      }
      return buildSingleInputArgs(state);
    },

    async execute(options) {
      if (state.inputPath === undefined) {
        throw missingFieldError("input");
      }
      if (state.detectSilenceConfig === undefined && state.outputPath === undefined) {
        throw missingFieldError("output");
      }

      // Two-pass normalization
      if (state.normalizeConfig?.twoPass === true) {
        const norm = state.normalizeConfig;
        const i = norm.targetLufs;
        const tp = norm.truePeak ?? -1.5;
        const lra = norm.loudnessRange ?? 11;

        // Pass 1: measure
        const pass1Args = [
          "-y",
          "-i",
          state.inputPath,
          "-af",
          `loudnorm=I=${i}:TP=${tp}:LRA=${lra}:print_format=json`,
          "-f",
          "null",
          "-",
        ];
        // Use logLevel "info" so loudnorm JSON output reaches stderr
        const pass1Result = await runFFmpeg(pass1Args, { ...options, logLevel: "info" });
        const measurement = parseLoudnormJson(pass1Result.stderr);

        // Pass 2: linear correction
        const pass2Filter = `loudnorm=I=${i}:TP=${tp}:LRA=${lra}:measured_I=${measurement.input_i}:measured_TP=${measurement.input_tp}:measured_LRA=${measurement.input_lra}:measured_thresh=${measurement.input_thresh}:offset=${measurement.target_offset}:linear=true`;
        const pass2Args = ["-y", "-i", state.inputPath, "-af", pass2Filter];

        // Add output codec settings
        if (state.codecValue !== undefined) {
          pass2Args.push("-c:a", state.codecValue);
        }
        if (state.bitrateValue !== undefined) {
          pass2Args.push("-b:a", state.bitrateValue);
        }
        if (state.sampleRateValue !== undefined) {
          pass2Args.push("-ar", String(state.sampleRateValue));
        }
        if (state.channelsValue !== undefined) {
          pass2Args.push("-ac", String(state.channelsValue));
        }

        // biome-ignore lint/style/noNonNullAssertion: validated above
        pass2Args.push(state.outputPath!);
        const pass2Result = await runFFmpeg(pass2Args, options);

        // biome-ignore lint/style/noNonNullAssertion: validated above
        const outPath = state.outputPath!;
        const fileStat = statSync(outPath);
        const [duration, audioStream] = await Promise.all([
          getDuration(outPath),
          getAudioStream(outPath),
        ]);

        // Parse loudness from pass 2 stderr
        const loudness =
          parseLoudnessStats(pass2Result.stderr) ?? parseLoudnessStats(pass1Result.stderr);

        return {
          outputPath: outPath,
          duration,
          sizeBytes: fileStat.size,
          codec: audioStream?.codec,
          sampleRate: audioStream?.sampleRate,
          channels: audioStream?.channels,
          loudness: loudness ?? undefined,
        };
      }

      // Silence detection — no output file
      // Use logLevel "info" so silencedetect filter output reaches stderr
      if (state.detectSilenceConfig !== undefined) {
        const args = buildSingleInputArgs(state);
        const result = await runFFmpeg(args, { ...options, logLevel: "info" });
        const silenceRanges = parseSilenceRanges(result.stderr);
        return {
          outputPath: "",
          duration: 0,
          sizeBytes: 0,
          silenceRanges,
        };
      }

      // Resolve fadeOut startAt from input duration if not set
      let fadeOutStart: number | undefined;
      if (state.fadeOutConfig !== undefined && state.fadeOutConfig.startAt === undefined) {
        const duration = await getDuration(state.inputPath);
        fadeOutStart = Math.max(0, duration - state.fadeOutConfig.duration);
      }

      const isMultiInput = state.additionalInputs.length > 0;
      const args = isMultiInput
        ? buildMultiInputArgs(state)
        : buildSingleInputArgs(state, fadeOutStart);

      const result = await runFFmpeg(args, options);

      // biome-ignore lint/style/noNonNullAssertion: validated above
      const outPath = state.outputPath!;
      const fileStat = statSync(outPath);
      const [duration, audioStream] = await Promise.all([
        getDuration(outPath),
        getAudioStream(outPath),
      ]);

      const loudness =
        state.normalizeConfig !== undefined && !state.normalizeConfig.twoPass
          ? (parseLoudnessStats(result.stderr) ?? undefined)
          : undefined;

      return {
        outputPath: outPath,
        duration,
        sizeBytes: fileStat.size,
        codec: audioStream?.codec,
        sampleRate: audioStream?.sampleRate,
        channels: audioStream?.channels,
        loudness,
      };
    },

    async tryExecute(options) {
      try {
        const data = await this.execute(options);
        return { success: true, data };
      } catch (err) {
        if (err instanceof FFmpegError) {
          return { success: false, error: err };
        }
        throw err;
      }
    },
  };

  return builder;
}

function parseLoudnessStats(
  stderr: string,
): { integratedLufs: number; truePeakDbfs: number; loudnessRange: number } | null {
  // Try to parse from loudnorm JSON output
  // Format: "[Parsed_loudnorm_0 @ ...] " then JSON on next line(s)
  try {
    const lines = stderr.split("\n");
    let inBlock = false;
    let afterLoudnorm = false;
    const jsonLines: string[] = [];
    for (const line of lines) {
      if (line.includes("[Parsed_loudnorm")) {
        const braceIdx = line.indexOf("{");
        if (braceIdx !== -1) {
          inBlock = true;
          jsonLines.push(line.slice(braceIdx));
        } else {
          afterLoudnorm = true;
        }
        continue;
      }
      if (afterLoudnorm) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{")) {
          inBlock = true;
          afterLoudnorm = false;
          jsonLines.push(trimmed);
          if (trimmed.endsWith("}")) break;
          continue;
        }
      }
      if (inBlock) {
        jsonLines.push(line);
        if (line.trim() === "}") break;
      }
    }
    if (jsonLines.length > 0) {
      const parsed = JSON.parse(jsonLines.join("\n")) as Record<string, string>;
      const input_i = parseFloat(parsed.input_i ?? "NaN");
      const input_tp = parseFloat(parsed.input_tp ?? "NaN");
      const input_lra = parseFloat(parsed.input_lra ?? "NaN");
      if (!Number.isNaN(input_i) && !Number.isNaN(input_tp) && !Number.isNaN(input_lra)) {
        return {
          integratedLufs: input_i,
          truePeakDbfs: input_tp,
          loudnessRange: input_lra,
        };
      }
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

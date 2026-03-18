import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HwAccelMode } from "../types/codecs.ts";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ClipConfig, TransitionConfig } from "../types/filters.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { AudioStreamInfo } from "../types/probe.ts";
import type { ConcatResult, OperationResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";
import {
  DEFAULT_AUDIO_CODEC_ARGS,
  DEFAULT_VIDEO_CODEC_ARGS,
  defaultDeps,
  missingFieldError,
  probeOutput,
  wrapTryExecute,
} from "../util/builder-helpers.ts";

// --- Internal State ---

interface ClipEntry extends ClipConfig {
  transitionAfter?: TransitionConfig;
}

interface ConcatState {
  clips: ClipEntry[];
  defaultTransitionConfig?: TransitionConfig;
  audioCrossfadeDuration?: number;
  normalizeWidth?: number;
  normalizeHeight?: number;
  normalizeFpsValue?: number;
  fillSilenceEnabled?: boolean;
  hwAccelMode?: HwAccelMode;
  outputPath?: string;
}

// --- Builder Interface ---

export interface ConcatBuilder {
  addClip(clip: string | ClipConfig): this;
  transition(config: TransitionConfig): this;
  defaultTransition(config: TransitionConfig): this;
  audioCrossfade(duration: number): this;
  normalizeResolution(width: number, height: number): this;
  normalizeFps(fps: number): this;
  fillSilence(enabled?: boolean): this;
  hwAccel(mode: HwAccelMode): this;
  output(path: string): this;
  toArgs(): string[];
  execute(options?: ExecuteOptions): Promise<ConcatResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<ConcatResult>>;
}

// --- Helpers ---

function validateConcatState(
  state: ConcatState,
): asserts state is ConcatState & { outputPath: string } {
  if (state.clips.length < 2) {
    throw new FFmpegError({
      code: FFmpegErrorCode.ENCODING_FAILED,
      message: "concat() requires at least 2 clips",
      stderr: "",
      command: [],
      exitCode: 0,
    });
  }
  if (state.outputPath === undefined) throw missingFieldError("output");
}

function needsFilterComplex(state: ConcatState): boolean {
  if (state.normalizeWidth !== undefined) return true;
  if (state.normalizeHeight !== undefined) return true;
  if (state.normalizeFpsValue !== undefined) return true;
  if (state.fillSilenceEnabled === true) return true;
  if (state.defaultTransitionConfig !== undefined) return true;
  return state.clips.some(
    (c) =>
      c.trimStart !== undefined ||
      c.trimEnd !== undefined ||
      c.duration !== undefined ||
      c.transitionAfter !== undefined,
  );
}

function getEffectiveTransition(
  clip: ClipEntry,
  defaultTransition?: TransitionConfig,
): TransitionConfig | undefined {
  return clip.transitionAfter ?? defaultTransition;
}

// --- Demuxer Path ---

function buildDemuxerArgs(state: ConcatState, listFilePath: string): string[] {
  const args: string[] = ["-y", "-f", "concat", "-safe", "0", "-i", listFilePath, "-c", "copy"];
  // biome-ignore lint/style/noNonNullAssertion: validated before calling
  args.push(state.outputPath!);
  return args;
}

function writeConcatList(clips: ClipEntry[], listFilePath: string): void {
  const lines = clips.map((c) => `file '${c.path}'`).join("\n");
  writeFileSync(listFilePath, `${lines}\n`, "utf8");
}

// --- Filter Complex Path ---

interface ClipInfo {
  path: string;
  duration: number;
  hasAudio: boolean;
  trimStart?: number;
  trimEnd?: number;
  clipDuration?: number;
}

type ProbeFn = (
  path: string,
  opts?: { noCache?: boolean },
) => Promise<import("../types/probe.ts").ProbeResult>;

async function probeClips(clips: ClipEntry[], probeFn: ProbeFn): Promise<ClipInfo[]> {
  return Promise.all(
    clips.map(async (clip) => {
      const probeResult = await probeFn(clip.path);
      const duration = probeResult.format.duration ?? 0;
      const audioStream =
        probeResult.streams.find((s): s is AudioStreamInfo => s.type === "audio") ?? null;
      let effectiveDuration = duration;
      if (
        clip.trimStart !== undefined ||
        clip.trimEnd !== undefined ||
        clip.duration !== undefined
      ) {
        const start = clip.trimStart ?? 0;
        const end =
          clip.duration !== undefined
            ? start + clip.duration
            : clip.trimEnd !== undefined
              ? clip.trimEnd
              : duration;
        effectiveDuration = end - start;
      }
      return {
        path: clip.path,
        duration: effectiveDuration,
        hasAudio: audioStream !== null,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        clipDuration: clip.duration,
      };
    }),
  );
}

function buildFilterComplexArgs(state: ConcatState, clipInfos: ClipInfo[]): string[] {
  const args: string[] = ["-y"];

  for (const info of clipInfos) {
    args.push("-i", info.path);
  }

  const filterParts: string[] = [];
  const n = clipInfos.length;

  // Build per-clip video/audio labels (applying trim + normalization)
  const vLabels: string[] = [];
  const aLabels: string[] = [];

  for (let i = 0; i < n; i++) {
    // biome-ignore lint/style/noNonNullAssertion: index within bounds
    const info = clipInfos[i]!;
    const vFilters: string[] = [];
    const aFilters: string[] = [];

    // Trim filters
    if (
      info.trimStart !== undefined ||
      info.trimEnd !== undefined ||
      info.clipDuration !== undefined
    ) {
      const start = info.trimStart ?? 0;
      const end =
        info.clipDuration !== undefined
          ? start + info.clipDuration
          : info.trimEnd !== undefined
            ? info.trimEnd
            : info.duration + start;
      vFilters.push(`trim=start=${start}:end=${end},setpts=PTS-STARTPTS`);
      aFilters.push(`atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`);
    }

    // Normalization filters
    if (state.normalizeWidth !== undefined || state.normalizeHeight !== undefined) {
      const w = state.normalizeWidth ?? -2;
      const h = state.normalizeHeight ?? -2;
      const scaleFilter = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
      vFilters.push(scaleFilter);
    }
    if (state.normalizeFpsValue !== undefined) {
      vFilters.push(`fps=${state.normalizeFpsValue}`);
    }

    const vIn = `${i}:v`;
    const vOut = `v${i}`;
    const aIn = `${i}:a`;
    const aOut = `a${i}`;

    if (vFilters.length > 0) {
      filterParts.push(`[${vIn}]${vFilters.join(",")}[${vOut}]`);
    } else {
      filterParts.push(`[${vIn}]null[${vOut}]`);
    }

    if (!info.hasAudio && state.fillSilenceEnabled === true) {
      // Generate silent audio trimmed to clip duration
      filterParts.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${info.duration}[${aOut}]`);
    } else if (aFilters.length > 0) {
      filterParts.push(`[${aIn}]${aFilters.join(",")}[${aOut}]`);
    } else {
      filterParts.push(`[${aIn}]anull[${aOut}]`);
    }

    vLabels.push(`[${vOut}]`);
    aLabels.push(`[${aOut}]`);
  }

  // Check if any transitions are used
  const hasTransitions =
    state.clips.some((c) => c.transitionAfter !== undefined) ||
    state.defaultTransitionConfig !== undefined;

  if (!hasTransitions) {
    // Simple concat filter — interleave: [v0][a0][v1][a1]...concat
    const interleavedInputs = vLabels.map((v, i) => `${v}${aLabels[i] ?? ""}`).join("");
    filterParts.push(`${interleavedInputs}concat=n=${n}:v=1:a=1[vout][aout]`);
    args.push("-filter_complex", filterParts.join(";"));
    args.push("-map", "[vout]", "-map", "[aout]");
  } else {
    // xfade chain for video, acrossfade chain for audio
    // biome-ignore lint/style/noNonNullAssertion: n >= 2, so index 0 exists
    let currentVLabel = vLabels[0]!.slice(1, -1); // strip []
    // biome-ignore lint/style/noNonNullAssertion: n >= 2, so index 0 exists
    let currentALabel = aLabels[0]!.slice(1, -1);
    let cumulativeDuration = clipInfos[0]?.duration ?? 0;

    for (let i = 0; i < n - 1; i++) {
      const clip = state.clips[i];
      const transition = getEffectiveTransition(
        clip ?? { path: "" },
        state.defaultTransitionConfig,
      );
      const nextVLabel = vLabels[i + 1]?.slice(1, -1) ?? `v${i + 1}`;
      const nextALabel = aLabels[i + 1]?.slice(1, -1) ?? `a${i + 1}`;

      const transType = transition?.type ?? "fade";
      const transDur = transition?.duration ?? 1;
      const audioCrossDur = state.audioCrossfadeDuration ?? transDur;

      const vOutLabel = i < n - 2 ? `xfv${i}` : "vout";
      const aOutLabel = i < n - 2 ? `xfa${i}` : "aout";

      // xfade offset = cumulative duration of previous clips minus transition duration
      const offset = Math.max(0, cumulativeDuration - transDur);
      filterParts.push(
        `[${currentVLabel}][${nextVLabel}]xfade=transition=${transType}:duration=${transDur}:offset=${offset}[${vOutLabel}]`,
      );
      filterParts.push(
        `[${currentALabel}][${nextALabel}]acrossfade=d=${audioCrossDur}:c1=tri:c2=tri[${aOutLabel}]`,
      );

      currentVLabel = vOutLabel;
      currentALabel = aOutLabel;
      // Next cumulative duration = previous + next clip - transition overlap
      const nextDuration = clipInfos[i + 1]?.duration ?? 0;
      cumulativeDuration = offset + nextDuration;
    }

    args.push("-filter_complex", filterParts.join(";"));
    args.push("-map", "[vout]", "-map", "[aout]");
  }

  // Codec for filter_complex path
  args.push(...DEFAULT_VIDEO_CODEC_ARGS, ...DEFAULT_AUDIO_CODEC_ARGS);

  // biome-ignore lint/style/noNonNullAssertion: validated before calling
  args.push(state.outputPath!);
  return args;
}

// --- Factory ---

export function concat(deps: BuilderDeps = defaultDeps): ConcatBuilder {
  const state: ConcatState = {
    clips: [],
  };

  const builder: ConcatBuilder = {
    addClip(clip) {
      if (typeof clip === "string") {
        state.clips.push({ path: clip });
      } else {
        state.clips.push({ ...clip });
      }
      return this;
    },

    transition(config) {
      if (state.clips.length === 0) {
        throw new FFmpegError({
          code: FFmpegErrorCode.ENCODING_FAILED,
          message: "transition() must be called after addClip()",
          stderr: "",
          command: [],
          exitCode: 0,
        });
      }
      // biome-ignore lint/style/noNonNullAssertion: length check above
      state.clips[state.clips.length - 1]!.transitionAfter = config;
      return this;
    },

    defaultTransition(config) {
      state.defaultTransitionConfig = config;
      return this;
    },

    audioCrossfade(duration) {
      state.audioCrossfadeDuration = duration;
      return this;
    },

    normalizeResolution(width, height) {
      state.normalizeWidth = width;
      state.normalizeHeight = height;
      return this;
    },

    normalizeFps(fps) {
      state.normalizeFpsValue = fps;
      return this;
    },

    fillSilence(enabled = true) {
      state.fillSilenceEnabled = enabled;
      return this;
    },

    hwAccel(mode) {
      state.hwAccelMode = mode;
      return this;
    },

    output(path) {
      state.outputPath = path;
      return this;
    },

    toArgs() {
      validateConcatState(state);

      if (needsFilterComplex(state)) {
        throw new FFmpegError({
          code: FFmpegErrorCode.ENCODING_FAILED,
          message:
            "Transitions, normalization, trimming, and fillSilence require clip duration probing — use execute() instead of toArgs()",
          stderr: "",
          command: [],
          exitCode: 0,
        });
      }

      // Demuxer path — write temp concat list
      mkdirSync(deps.tempDir, { recursive: true });
      const listFilePath = join(deps.tempDir, `ffmpeg-concat-${Date.now()}.txt`);
      writeConcatList(state.clips, listFilePath);
      return buildDemuxerArgs(state, listFilePath);
    },

    async execute(options) {
      validateConcatState(state);

      const outPath = state.outputPath;

      if (!needsFilterComplex(state)) {
        // Demuxer path
        mkdirSync(deps.tempDir, { recursive: true });
        const listFilePath = join(deps.tempDir, `ffmpeg-concat-${Date.now()}.txt`);
        writeConcatList(state.clips, listFilePath);
        try {
          await deps.execute(buildDemuxerArgs(state, listFilePath), options);
        } finally {
          try {
            unlinkSync(listFilePath);
          } catch {
            // ignore
          }
        }

        const { outputPath, duration, sizeBytes } = await probeOutput(outPath, deps.probe);
        return {
          outputPath,
          duration,
          clipCount: state.clips.length,
          sizeBytes,
          method: "demuxer",
        };
      }

      // Filter complex path — probe all clips
      const clipInfos = await probeClips(state.clips, deps.probe);
      const args = buildFilterComplexArgs(state, clipInfos);
      await deps.execute(args, options);

      const { outputPath, duration, sizeBytes } = await probeOutput(outPath, deps.probe);
      return {
        outputPath,
        duration,
        clipCount: state.clips.length,
        sizeBytes,
        method: "filter_complex",
      };
    },

    tryExecute: wrapTryExecute((options) => builder.execute(options)),
  };

  return builder;
}

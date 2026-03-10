import { statSync } from "node:fs";
import { extname } from "node:path";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { OperationResult, PipelineResult } from "../types/results.ts";
import type { BuilderDeps } from "../types/sdk.ts";
import { createTempFiles } from "../util/tempfile.ts";

/** Any builder that has input(), output(), and execute() */
interface PipelineStep {
  input(path: string): PipelineStep;
  output(path: string): PipelineStep;
  execute(options?: ExecuteOptions): Promise<unknown>;
}

interface OnStepCompleteInfo {
  stepIndex: number;
  stepCount: number;
  durationMs: number;
}

export interface PipelineBuilder {
  /** Add an operation builder as a step. The builder should NOT have input/output set — pipeline manages those. */
  step(builder: PipelineStep): this;
  /** Set the initial input file */
  input(path: string): this;
  /** Set the final output file */
  output(path: string): this;
  /** Callback when each step completes */
  onStepComplete(callback: (info: OnStepCompleteInfo) => void): this;
  execute(options?: ExecuteOptions): Promise<PipelineResult>;
  tryExecute(options?: ExecuteOptions): Promise<OperationResult<PipelineResult>>;
}

export function pipeline(deps: BuilderDeps): PipelineBuilder {
  const state: {
    steps: PipelineStep[];
    inputPath?: string;
    outputPath?: string;
    onStepCompleteCallback?: (info: OnStepCompleteInfo) => void;
  } = { steps: [] };

  const executeImpl = async (options?: ExecuteOptions): Promise<PipelineResult> => {
    if (state.steps.length === 0) {
      throw new FFmpegError({
        code: FFmpegErrorCode.INVALID_INPUT,
        message: "pipeline() requires at least one step()",
        stderr: "",
        command: [],
        exitCode: 0,
      });
    }
    if (!state.inputPath) {
      throw missingFieldError("input");
    }
    if (!state.outputPath) {
      throw missingFieldError("output");
    }

    const outputExt = extname(state.outputPath) || ".mp4";
    const stepCount = state.steps.length;
    const stepDurations: number[] = [];

    if (stepCount === 1) {
      // Single step: no temp files needed
      const stepStart = Date.now();
      await state.steps[0]?.input(state.inputPath).output(state.outputPath).execute(options);
      const stepDurationMs = Date.now() - stepStart;
      stepDurations.push(stepDurationMs);
      state.onStepCompleteCallback?.({ stepIndex: 0, stepCount, durationMs: stepDurationMs });
    } else {
      const { files: tempFiles, cleanup } = createTempFiles(stepCount - 1, {
        suffix: outputExt,
      }, deps.tempDir);
      try {
        for (let i = 0; i < stepCount; i++) {
          // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee these are defined
          const inputPath = i === 0 ? state.inputPath : tempFiles[i - 1]!.path;
          // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee these are defined
          const outputPath = i === stepCount - 1 ? state.outputPath : tempFiles[i]!.path;
          const stepStart = Date.now();
          // biome-ignore lint/style/noNonNullAssertion: loop bounds guarantee step exists
          await state.steps[i]!.input(inputPath).output(outputPath).execute(options);
          const stepDurationMs = Date.now() - stepStart;
          stepDurations.push(stepDurationMs);
          state.onStepCompleteCallback?.({ stepIndex: i, stepCount, durationMs: stepDurationMs });
        }
      } finally {
        cleanup();
      }
    }

    const fileStat = statSync(state.outputPath);
    const probeResult = await deps.probe(state.outputPath, { noCache: true });
    return {
      outputPath: state.outputPath,
      duration: probeResult.format.duration ?? 0,
      sizeBytes: fileStat.size,
      stepCount,
      stepDurations,
    };
  };

  const builder: PipelineBuilder = {
    step(s) {
      state.steps.push(s);
      return this;
    },
    input(path) {
      state.inputPath = path;
      return this;
    },
    output(path) {
      state.outputPath = path;
      return this;
    },
    onStepComplete(callback) {
      state.onStepCompleteCallback = callback;
      return this;
    },
    execute: executeImpl,
    async tryExecute(options) {
      try {
        const data = await executeImpl(options);
        return { success: true, data };
      } catch (err) {
        if (err instanceof FFmpegError) return { success: false, error: err };
        throw err;
      }
    },
  };

  return builder;
}

function missingFieldError(field: string): FFmpegError {
  return new FFmpegError({
    code: FFmpegErrorCode.ENCODING_FAILED,
    message: `${field}() is required`,
    stderr: "",
    command: [],
    exitCode: 0,
  });
}

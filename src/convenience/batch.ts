import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import type { ExecuteOptions } from "../types/options.ts";
import type { BatchItemResult, BatchResult } from "../types/results.ts";

interface BatchOptions<T> {
  /** Input file paths */
  inputs: string[];
  /** Max concurrent ffmpeg processes (default: 3) */
  concurrency?: number;
  /** Factory that creates an operation builder for each input. The builder should have output set but NOT input. */
  operation: (input: string) => {
    input(path: string): unknown;
    execute(options?: ExecuteOptions): Promise<T>;
  };
  /** Called when a single item completes successfully */
  onItemComplete?: (input: string, result: T) => void;
  /** Called when a single item fails */
  onItemError?: (input: string, error: Error) => void;
}

export async function batch<T>(options: BatchOptions<T>): Promise<BatchResult<T>> {
  const { inputs, concurrency = 3, operation, onItemComplete, onItemError } = options;

  if (inputs.length === 0) {
    return { results: [], totalDurationMs: 0 };
  }

  const startTime = Date.now();
  const results: Array<BatchItemResult<T>> = new Array(inputs.length);
  let nextIndex = 0;

  async function processItem(index: number): Promise<void> {
    const input = inputs[index];
    if (input === undefined) return;
    try {
      const builder = operation(input);
      const data = await (
        builder.input(input) as { execute(opts?: ExecuteOptions): Promise<T> }
      ).execute();
      results[index] = { success: true, input, data };
      onItemComplete?.(input, data);
    } catch (err) {
      const error =
        err instanceof FFmpegError
          ? err
          : new FFmpegError({
              code: FFmpegErrorCode.UNKNOWN,
              message: err instanceof Error ? err.message : String(err),
              stderr: "",
              command: [],
              exitCode: 1,
            });
      results[index] = { success: false, input, error };
      onItemError?.(input, err instanceof Error ? err : new Error(String(err)));
    }
  }

  async function runWorker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const index = nextIndex++;
      await processItem(index);
    }
  }

  const workerCount = Math.min(concurrency, inputs.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(runWorker());
  }
  await Promise.all(workers);

  return {
    results,
    totalDurationMs: Date.now() - startTime,
  };
}

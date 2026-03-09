import { randomUUID } from "node:crypto";
import { mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Options for creating a temp file */
export interface TempFileOptions {
  /** File extension including dot (e.g. ".mp4") */
  suffix?: string;
  /** Subdirectory within the temp root */
  subdir?: string;
}

/** A managed temporary file that tracks its lifecycle */
export interface TempFile {
  /** Absolute path to the temp file */
  readonly path: string;
  /** Delete the temp file if it exists. Safe to call multiple times. */
  cleanup(): void;
}

/**
 * Create a temporary file path with auto-generated unique name.
 * The file is NOT created on disk — only the path is reserved.
 * The parent directory IS created if it doesn't exist.
 *
 * @param options - suffix and subdir options
 * @param tempRoot - override temp directory (default: os.tmpdir()/ffmpeg-kit)
 */
export function createTempFile(options?: TempFileOptions, tempRoot?: string): TempFile {
  const root = tempRoot ?? join(tmpdir(), "ffmpeg-kit");
  const dir = options?.subdir != null ? join(root, options.subdir) : root;
  mkdirSync(dir, { recursive: true });

  const suffix = options?.suffix ?? "";
  const filename = `${randomUUID()}${suffix}`;
  const path = join(dir, filename);

  return {
    path,
    cleanup() {
      try {
        unlinkSync(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          throw err;
        }
      }
    },
  };
}

/**
 * Create multiple temp files and ensure all are cleaned up via a single cleanup call.
 * Returns an object with a `files` array and a `cleanup()` that removes all.
 */
export function createTempFiles(
  count: number,
  options?: TempFileOptions,
  tempRoot?: string,
): { files: TempFile[]; cleanup: () => void } {
  const files = Array.from({ length: count }, () => createTempFile(options, tempRoot));
  return {
    files,
    cleanup() {
      for (const file of files) {
        file.cleanup();
      }
    },
  };
}

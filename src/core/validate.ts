import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FFmpegError, FFmpegErrorCode } from "../types/errors.ts";
import { findExecutable } from "../util/platform.ts";

const execFileAsync = promisify(execFile);

export interface InstallationInfo {
  ffmpeg: { path: string; version: string };
  ffprobe: { path: string; version: string };
}

/**
 * Parse the version string from `ffmpeg -version` output.
 * e.g. "ffmpeg version 7.1.1 Copyright ..." → "7.1.1"
 * e.g. "ffmpeg version N-123456-g..." → "N-123456-g..."
 */
export function parseVersionString(output: string): string {
  const match = /version\s+(\S+)/.exec(output);
  if (match === null || match[1] === undefined || match[1].length === 0) {
    throw new Error(`Could not parse version from: ${output}`);
  }
  return match[1];
}

async function getBinaryInfo(
  name: string,
  providedPath?: string,
): Promise<{ path: string; version: string }> {
  let binaryPath: string;

  if (providedPath !== undefined) {
    binaryPath = providedPath;
  } else {
    const found = await findExecutable(name);
    if (found === null) {
      throw new FFmpegError({
        code: FFmpegErrorCode.BINARY_NOT_FOUND,
        message: `${name} not found in PATH`,
        stderr: "",
        command: [name],
        exitCode: -1,
      });
    }
    binaryPath = found;
  }

  let stdout: string;
  try {
    const result = await execFileAsync(binaryPath, ["-version"]);
    stdout = result.stdout;
  } catch (err) {
    throw new FFmpegError({
      code: FFmpegErrorCode.BINARY_NOT_FOUND,
      message: `Failed to run ${name} -version: ${(err as Error).message}`,
      stderr: "",
      command: [binaryPath, "-version"],
      exitCode: (err as NodeJS.ErrnoException & { code?: number }).code ?? -1,
      cause: err instanceof Error ? err : undefined,
    });
  }

  const version = parseVersionString(stdout);
  return { path: binaryPath, version };
}

/**
 * Validate that ffmpeg and ffprobe are installed and available.
 *
 * - Finds binaries in PATH (or uses provided paths)
 * - Runs `ffmpeg -version` and `ffprobe -version` to get version strings
 * - Throws FFmpegError with BINARY_NOT_FOUND if either is missing
 */
export async function validateInstallation(config?: {
  ffmpegPath?: string;
  ffprobePath?: string;
}): Promise<InstallationInfo> {
  const [ffmpeg, ffprobe] = await Promise.all([
    getBinaryInfo("ffmpeg", config?.ffmpegPath),
    getBinaryInfo("ffprobe", config?.ffprobePath),
  ]);
  return { ffmpeg, ffprobe };
}

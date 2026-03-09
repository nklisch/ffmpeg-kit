import { execFile } from "node:child_process";
import { normalize } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Detected operating system */
export type Platform = "linux" | "darwin" | "win32";

/** Get the current platform */
export function getPlatform(): Platform {
  const p = process.platform;
  if (p !== "linux" && p !== "darwin" && p !== "win32") {
    throw new Error(`Unsupported platform: ${p}`);
  }
  return p;
}

/**
 * Normalize a file path for the current platform.
 * On Windows, converts forward slashes to backslashes.
 * On Unix, returns as-is.
 */
export function normalizePath(filePath: string): string {
  return normalize(filePath);
}

/**
 * Find an executable in PATH.
 * Returns the absolute path or null if not found.
 */
export async function findExecutable(name: string): Promise<string | null> {
  const command = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await execFileAsync(command, [name]);
    const path = stdout.trim().split("\n")[0]?.trim() ?? "";
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

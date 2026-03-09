/**
 * Escape a value for use in an FFmpeg filter expression.
 * Escapes special characters: \ ' ; [ ] = :
 */
export function escapeFilterValue(value: string): string {
  // Order matters: escape backslash first
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/;/g, "\\;")
    .replace(/\[/g, "\\[")
    .replace(/]/g, "\\]")
    .replace(/=/g, "\\=")
    .replace(/:/g, "\\:");
}

/**
 * Build a filter expression from name and options.
 * e.g. buildFilter("scale", { w: 1920, h: -2 }) → "scale=w=1920:h=-2"
 * e.g. buildFilter("volume", "0.5") → "volume=0.5"
 */
export function buildFilter(
  name: string,
  options?: Record<string, string | number | boolean> | string,
): string {
  if (options === undefined) return name;
  if (typeof options === "string") return `${name}=${options}`;

  const parts: string[] = [];
  for (const [key, val] of Object.entries(options)) {
    if (val === false) continue;
    if (val === true) {
      parts.push(key);
    } else {
      parts.push(`${key}=${val}`);
    }
  }
  return parts.length > 0 ? `${name}=${parts.join(":")}` : name;
}

/**
 * Build an array of FFmpeg CLI arguments from structured options.
 * Handles common patterns:
 * - Input files: ["-i", path]
 * - Seek: ["-ss", timestamp] (before -i for input seeking)
 * - Overwrite: ["-y"]
 * - Log level: ["-loglevel", level]
 * - Progress: ["-progress", "pipe:1", "-stats_period", "0.5"]
 */
export function buildBaseArgs(options: {
  inputs?: string[];
  seekBefore?: number;
  overwrite?: boolean;
  logLevel?: string;
  progress?: boolean;
}): string[] {
  const args: string[] = [];

  if (options.overwrite !== false) {
    args.push("-y");
  }

  if (options.logLevel !== undefined) {
    args.push("-loglevel", options.logLevel);
  }

  if (options.progress === true) {
    args.push("-progress", "pipe:1", "-stats_period", "0.5");
  }

  if (options.seekBefore !== undefined) {
    args.push("-ss", String(options.seekBefore));
  }

  for (const input of options.inputs ?? []) {
    args.push("-i", input);
  }

  return args;
}

/**
 * Flatten nested/conditional arg arrays into a flat string[].
 * Filters out undefined/null/false values.
 *
 * e.g. flattenArgs(["-y", condition && ["-ss", "10"], "-i", "file.mp4"])
 *   → ["-y", "-ss", "10", "-i", "file.mp4"]  (if condition is true)
 *   → ["-y", "-i", "file.mp4"]                (if condition is false)
 */
export function flattenArgs(args: Array<string | false | null | undefined | string[]>): string[] {
  return (args.flat(1) as Array<string | false | null | undefined>).filter(
    (a): a is string => typeof a === "string",
  );
}

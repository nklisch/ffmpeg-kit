import type { Timestamp } from "../types/base.ts";

/**
 * Parse a timecode string or number into seconds.
 *
 * Supported formats:
 * - number: returned as-is (seconds)
 * - "HH:MM:SS.ms" → seconds
 * - "MM:SS.ms" → seconds
 * - "SS.ms" → seconds (plain numeric string)
 * - "50%" → requires `durationSeconds` parameter, returns proportional value
 *
 * Throws on invalid format or negative result.
 */
export function parseTimecode(timecode: Timestamp, durationSeconds?: number): number {
  if (typeof timecode === "number") {
    if (timecode < 0) throw new Error(`Invalid timecode: ${timecode}`);
    return timecode;
  }

  const str = timecode.trim();

  if (str.length === 0) {
    throw new Error("Invalid timecode: empty string");
  }

  // Percentage format
  if (str.endsWith("%")) {
    if (durationSeconds === undefined) {
      throw new Error("durationSeconds is required for percentage timecodes");
    }
    const pct = Number(str.slice(0, -1));
    if (Number.isNaN(pct)) {
      throw new Error(`Invalid timecode percentage: ${str}`);
    }
    const result = (pct / 100) * durationSeconds;
    if (result < 0) throw new Error(`Invalid timecode: negative result`);
    return result;
  }

  // Colon-separated: HH:MM:SS.ms or MM:SS.ms
  const colonMatch = /^(?:(\d+):)?(\d+):([\d]+(?:\.\d+)?)$/.exec(str);
  if (colonMatch !== null) {
    const hours = colonMatch[1] !== undefined ? parseInt(colonMatch[1], 10) : 0;
    const minutes = parseInt(colonMatch[2] ?? "0", 10);
    const seconds = parseFloat(colonMatch[3] ?? "0");
    const result = hours * 3600 + minutes * 60 + seconds;
    if (result < 0) throw new Error(`Invalid timecode: negative result`);
    return result;
  }

  // Plain numeric string (e.g., "30", "30.5")
  const num = Number(str);
  if (!Number.isNaN(num)) {
    if (num < 0) throw new Error(`Invalid timecode: ${str}`);
    return num;
  }

  throw new Error(`Invalid timecode format: ${str}`);
}

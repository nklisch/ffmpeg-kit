import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe } from "vitest";
import { probe } from "../src/core/probe.ts";
import type { ProbeResult } from "../src/types/probe.ts";

/** Path to the fixtures directory */
export const FIXTURES_DIR: string = resolve(import.meta.dirname, "fixtures");

/** Pre-defined fixture paths */
export const FIXTURES = {
  videoH264: join(FIXTURES_DIR, "video-h264.mp4"),
  videoShort: join(FIXTURES_DIR, "video-short.mp4"),
  audioSpeech: join(FIXTURES_DIR, "audio-speech.wav"),
};

/**
 * Whether ffmpeg is available on this system.
 * Resolved once at module load time.
 */
export const ffmpegAvailable: boolean = (() => {
  const result: SpawnSyncReturns<Buffer> = spawnSync("ffmpeg", ["-version"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  return result.status === 0;
})();

/**
 * Use in place of `describe` to skip a suite if ffmpeg is not installed.
 */
export const describeWithFFmpeg: typeof describe = ffmpegAvailable ? describe : describe.skip;

// Module-level temp file registry for cleanup
const tmpPaths: string[] = [];

afterAll(() => {
  for (const p of tmpPaths) {
    try {
      unlinkSync(p);
    } catch {
      // ignore
    }
  }
  tmpPaths.length = 0;
});

/**
 * Create a temp file path that auto-cleans after the current test suite.
 * Uses vitest's afterAll hook for cleanup.
 */
export function tmp(filename: string): string {
  const dir = join(tmpdir(), "ffmpeg-kit-test");
  const path = join(dir, filename);
  tmpPaths.push(path);
  return path;
}

/**
 * Assert that a file exists and has at least `minBytes` of content.
 * Default minBytes: 100.
 */
export function expectFileExists(filePath: string, minBytes = 100): void {
  if (!existsSync(filePath)) {
    throw new Error(`Expected file to exist: ${filePath}`);
  }
  const stat = statSync(filePath);
  if (stat.size < minBytes) {
    throw new Error(
      `Expected file to be at least ${minBytes} bytes, got ${stat.size}: ${filePath}`,
    );
  }
}

/**
 * Probe an output file using the real ffprobe binary.
 * Convenience wrapper for tests.
 */
export async function probeOutput(filePath: string): Promise<ProbeResult> {
  return probe(filePath, { noCache: true });
}

/**
 * Assert two durations are close. Default tolerance: 0.5s.
 */
export function expectDurationClose(actual: number, expected: number, tolerance = 0.5): void {
  if (actual < expected - tolerance || actual > expected + tolerance) {
    throw new Error(`Expected duration ${actual} to be within ${tolerance}s of ${expected}`);
  }
}

/**
 * Assert video dimensions match exactly.
 */
export function expectDimensions(probeResult: ProbeResult, width: number, height: number): void {
  const stream = probeResult.streams.find((s) => s.type === "video");
  if (stream === undefined || stream.type !== "video") {
    throw new Error("No video stream found");
  }
  if (stream.width !== width || stream.height !== height) {
    throw new Error(`Expected dimensions ${width}x${height}, got ${stream.width}x${stream.height}`);
  }
}

/**
 * Assert a stream uses the expected codec.
 */
export function expectCodec(
  probeResult: ProbeResult,
  streamType: "video" | "audio",
  codec: string,
): void {
  const stream = probeResult.streams.find((s) => s.type === streamType);
  if (stream === undefined) {
    throw new Error(`No ${streamType} stream found`);
  }
  if (stream.codec !== codec) {
    throw new Error(`Expected codec "${codec}", got "${stream.codec}"`);
  }
}

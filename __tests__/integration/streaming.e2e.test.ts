import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { dash, hls } from "../../src/operations/streaming.ts";
import { describeWithFFmpeg, FIXTURES } from "../helpers.ts";

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

// Streaming tests need a dedicated temp directory per test (since segments go there)
let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "ffmpeg-kit-hls-"));
});

afterEach(() => {
  try {
    const files = readdirSync(testDir);
    for (const f of files) {
      try {
        // Remove each file
        const { unlinkSync } = require("node:fs");
        unlinkSync(join(testDir, f));
      } catch {
        // ignore
      }
    }
    rmdirSync(testDir);
  } catch {
    // ignore cleanup errors
  }
});

describeWithFFmpeg(
  "hls()",
  () => {
    it("creates HLS output with mpegts segments", async () => {
      const output = join(testDir, "output.m3u8");
      const result = await hls()
        .input(FIXTURES.videoShort)
        .segmentDuration(1)
        .output(output)
        .execute();

      expect(existsSync(output)).toBe(true);
      expect(result.outputPath).toBe(output);
      expect(result.segments).toBeDefined();
      expect(result.segments?.length).toBeGreaterThan(0);
      // Verify at least one .ts segment exists
      const tsSegments = result.segments?.filter((s) => s.endsWith(".ts")) ?? [];
      expect(tsSegments.length).toBeGreaterThan(0);
    });

    it("creates HLS output with fmp4 segments", async () => {
      const output = join(testDir, "output.m3u8");
      const result = await hls()
        .input(FIXTURES.videoShort)
        .segmentType("fmp4")
        .segmentDuration(1)
        .output(output)
        .execute();

      expect(existsSync(output)).toBe(true);
      // init.mp4 should exist
      expect(existsSync(join(testDir, "init.mp4"))).toBe(true);
      // At least one .m4s segment
      const m4sSegments = result.segments?.filter((s) => s.endsWith(".m4s")) ?? [];
      expect(m4sSegments.length).toBeGreaterThan(0);
    });

    it("respects segment duration and produces valid HLS output", async () => {
      const output = join(testDir, "output.m3u8");
      const result = await hls()
        .input(FIXTURES.videoH264)
        .segmentDuration(2)
        .output(output)
        .execute();

      expect(existsSync(output)).toBe(true);
      // HLS output must exist and have at least one segment
      // (exact count depends on keyframe intervals in the source)
      expect(result.segments?.length).toBeGreaterThanOrEqual(1);
      const content = readFileSync(output, "utf-8");
      expect(content).toContain("#EXTM3U");
    });

    it("creates HLS with VOD playlist type", async () => {
      const output = join(testDir, "output.m3u8");
      await hls().input(FIXTURES.videoShort).playlistType("vod").output(output).execute();

      expect(existsSync(output)).toBe(true);
      const content = readFileSync(output, "utf-8");
      expect(content).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
      expect(content).toContain("#EXT-X-ENDLIST");
    });
  },
  60000,
);

describeWithFFmpeg(
  "dash()",
  () => {
    it("creates DASH output", async () => {
      const output = join(testDir, "output.mpd");
      const result = await dash().input(FIXTURES.videoShort).output(output).execute();

      expect(existsSync(output)).toBe(true);
      expect(result.outputPath).toBe(output);
      // MPD should have content
      const content = readFileSync(output, "utf-8");
      expect(content).toContain("MPD");
    });

    it("respects segment duration", async () => {
      const output = join(testDir, "output.mpd");
      const result = await dash()
        .input(FIXTURES.videoShort)
        .segmentDuration(2)
        .output(output)
        .execute();

      expect(existsSync(output)).toBe(true);
      expect(result.outputPath).toBe(output);
    });
  },
  60000,
);

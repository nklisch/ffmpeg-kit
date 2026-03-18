import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createFFmpeg } from "../../src/sdk.ts";
import { FFmpegErrorCode } from "../../src/types/errors.ts";
import { describeWithFFmpeg, expectFileExists, FIXTURES, tmp } from "../helpers.ts";

// Binary not found tests don't need ffmpeg installed
describe("SDK config — binary not found", () => {
  it("throws BINARY_NOT_FOUND for invalid ffmpegPath", async () => {
    const sdk = createFFmpeg({ ffmpegPath: "/nonexistent/ffmpeg" });
    await expect(sdk.execute(["-version"])).rejects.toMatchObject({
      code: FFmpegErrorCode.BINARY_NOT_FOUND,
    });
  });

  it("throws BINARY_NOT_FOUND for invalid ffprobePath", async () => {
    const sdk = createFFmpeg({ ffprobePath: "/nonexistent/ffprobe" });
    await expect(sdk.probe(FIXTURES.videoShort)).rejects.toMatchObject({
      code: FFmpegErrorCode.BINARY_NOT_FOUND,
    });
  });
});

describeWithFFmpeg("SDK config — runtime", () => {
  it("uses custom temp directory for concat", async () => {
    const customTemp = join(tmpdir(), `ffmpeg-kit-custom-${Date.now()}`);
    mkdirSync(customTemp, { recursive: true });

    const sdk = createFFmpeg({ tempDir: customTemp });
    const output = tmp("sdk-temp.mp4");

    // Concat uses temp dir for the concat list file
    const result = await sdk
      .concat()
      .addClip(FIXTURES.videoShort)
      .addClip(FIXTURES.videoShort)
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.clipCount).toBe(2);
  });

  it("re-running export to same path overwrites safely", async () => {
    const output = tmp("sdk-overwrite.mp4");

    // First export with high CRF (smaller file)
    await createFFmpeg().exportVideo().input(FIXTURES.videoShort).crf(40).output(output).execute();

    const size1 = statSync(output).size;
    expect(size1).toBeGreaterThan(0);

    // Second export with low CRF (larger file) — should overwrite
    await createFFmpeg().exportVideo().input(FIXTURES.videoShort).crf(18).output(output).execute();

    const size2 = statSync(output).size;
    expect(size2).toBeGreaterThan(0);
    // Lower CRF = higher quality = larger file (or at minimum, the file was overwritten)
    expect(size2).not.toBe(size1);
  });
});

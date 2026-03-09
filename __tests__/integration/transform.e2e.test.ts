import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { transform } from "../../src/operations/transform.ts";
import {
  describeWithFFmpeg,
  expectDimensions,
  expectDurationClose,
  expectFileExists,
  FIXTURES,
  probeOutput,
  tmp,
} from "../helpers.ts";

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

describeWithFFmpeg("transform()", () => {
  // Scale

  it("scales to width only (auto height)", async () => {
    const output = tmp("transform-scale-w.mp4");
    await transform().input(FIXTURES.videoShort).scale({ width: 640 }).output(output).execute();

    expectFileExists(output);
    const probe = await probeOutput(output);
    expectDimensions(probe, 640, 360);
  });

  it("scales to exact dimensions", async () => {
    const output = tmp("transform-scale-exact.mp4");
    await transform()
      .input(FIXTURES.videoShort)
      .scale({ width: 320, height: 240 })
      .output(output)
      .execute();

    expectFileExists(output);
    const probe = await probeOutput(output);
    expectDimensions(probe, 320, 240);
  });

  it("scales with contain fit (letterbox)", async () => {
    const output = tmp("transform-contain.mp4");
    await transform()
      .input(FIXTURES.videoShort)
      .scale({ width: 640, height: 640 })
      // biome-ignore lint/suspicious/noFocusedTests: TransformBuilder.fit() is not a vitest focus
      .fit("contain")
      .output(output)
      .execute();

    expectFileExists(output);
    const probe = await probeOutput(output);
    expectDimensions(probe, 640, 640);
  });

  it("scales with cover fit (crop)", async () => {
    const output = tmp("transform-cover.mp4");
    await transform()
      .input(FIXTURES.videoShort)
      .scale({ width: 360, height: 360 })
      // biome-ignore lint/suspicious/noFocusedTests: TransformBuilder.fit() is not a vitest focus
      .fit("cover")
      .output(output)
      .execute();

    expectFileExists(output);
    const probe = await probeOutput(output);
    expectDimensions(probe, 360, 360);
  });

  // Crop

  it("crops to aspect ratio", async () => {
    const output = tmp("transform-crop-ar.mp4");
    await transform()
      .input(FIXTURES.videoShort) // 640x360
      .crop({ aspectRatio: "1:1" })
      .output(output)
      .execute();

    expectFileExists(output);
    const probe = await probeOutput(output);
    // 640x360 input → 1:1 → should be 360x360 (limited by height)
    expectDimensions(probe, 360, 360);
  });

  it("crops to explicit dimensions", async () => {
    const output = tmp("transform-crop-dim.mp4");
    await transform()
      .input(FIXTURES.videoShort)
      .crop({ width: 320, height: 180 })
      .output(output)
      .execute();

    expectFileExists(output);
    const probe = await probeOutput(output);
    expectDimensions(probe, 320, 180);
  });

  // Ken Burns

  it("creates Ken Burns video from image", async () => {
    const output = tmp("transform-kenburns.mp4");
    const result = await transform()
      .input(FIXTURES.image1080p) // 1920x1080
      .kenBurns({
        duration: 3,
        startZoom: 1,
        endZoom: 1.3,
        startPosition: "center",
        endPosition: "center",
        easing: "linear",
      })
      .output(output)
      .execute();

    expectFileExists(output);
    expectDurationClose(result.duration, 3, 0.5);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  }, 30000);

  // Speed

  it("doubles speed", async () => {
    const output = tmp("transform-speed-2x.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 2s
      .speed(2)
      .output(output)
      .execute();

    expectFileExists(output);
    expectDurationClose(result.duration, 1, 0.3);
  });

  it("halves speed", async () => {
    const output = tmp("transform-speed-half.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 2s
      .speed(0.5)
      .output(output)
      .execute();

    expectFileExists(output);
    expectDurationClose(result.duration, 4, 0.5);
  });

  it("quadruples speed (chained atempo)", async () => {
    const output = tmp("transform-speed-4x.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 2s
      .speed(4)
      .output(output)
      .execute();

    expectFileExists(output);
    expectDurationClose(result.duration, 0.5, 0.3);
  });

  // Trim

  it("trims start", async () => {
    const output = tmp("transform-trim-start.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 2s
      .trimStart(1)
      .output(output)
      .execute();

    expectFileExists(output);
    expectDurationClose(result.duration, 1, 0.3);
  });

  it("trims with duration", async () => {
    const output = tmp("transform-trim-duration.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 2s
      .trimStart(0.5)
      .duration(1)
      .output(output)
      .execute();

    expectFileExists(output);
    expectDurationClose(result.duration, 1, 0.3);
  });

  // Loop

  it("loops video", async () => {
    const output = tmp("transform-loop.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 2s
      .loop(3)
      .output(output)
      .execute();

    expectFileExists(output);
    // 3x loop of 2s video = ~6s
    expectDurationClose(result.duration, 6, 0.5);
  });

  // Rotate

  it("rotates 90 degrees", async () => {
    const output = tmp("transform-rotate90.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 640x360
      .rotate(90)
      .output(output)
      .execute();

    expectFileExists(output);
    // 90° rotation swaps width/height
    expect(result.width).toBe(360);
    expect(result.height).toBe(640);
  });

  // Flip

  it("flips horizontally", async () => {
    const output = tmp("transform-fliph.mp4");
    const result = await transform().input(FIXTURES.videoShort).flipH().output(output).execute();

    expectFileExists(output);
    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
  });

  it("flips vertically", async () => {
    const output = tmp("transform-flipv.mp4");
    const result = await transform().input(FIXTURES.videoShort).flipV().output(output).execute();

    expectFileExists(output);
    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
  });

  // Pad

  it("pads to larger dimensions", async () => {
    const output = tmp("transform-pad.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 640x360
      .pad({ width: 800, height: 600 })
      .output(output)
      .execute();

    expectFileExists(output);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  // FPS

  it("changes frame rate", async () => {
    const output = tmp("transform-fps.mp4");
    await transform().input(FIXTURES.videoShort).fps(15).output(output).execute();

    expectFileExists(output);
    const probe = await probeOutput(output);
    const videoStream = probe.streams.find((s) => s.type === "video");
    // Allow slight tolerance around 15fps
    expect(videoStream?.avgFrameRate).toBeCloseTo(15, 0);
  });

  // Reverse

  it("reverses video", async () => {
    const output = tmp("transform-reverse.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort) // 2s
      .reverse()
      .output(output)
      .execute();

    expectFileExists(output);
    expectDurationClose(result.duration, 2, 0.5);
    expect(result.width).toBe(640);
    expect(result.height).toBe(360);
  });

  // tryExecute

  it("tryExecute returns success result", async () => {
    const output = tmp("transform-try-success.mp4");
    const result = await transform()
      .input(FIXTURES.videoShort)
      .scale({ width: 320 })
      .output(output)
      .tryExecute();

    expect(result.success).toBe(true);
  });

  it("tryExecute returns failure on bad input", async () => {
    const output = tmp("transform-try-fail.mp4");
    const result = await transform().input("/nonexistent/path.mp4").output(output).tryExecute();

    expect(result.success).toBe(false);
  });
});

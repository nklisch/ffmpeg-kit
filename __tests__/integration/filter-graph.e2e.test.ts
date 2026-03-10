import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { execute } from "../../src/core/execute.ts";
import { afade, loudnorm } from "../../src/filters/audio.ts";
import { filterGraph } from "../../src/filters/graph.ts";
import { crop, fps, scale } from "../../src/filters/video.ts";
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

describeWithFFmpeg("FilterGraphBuilder E2E", () => {
  it("simple video filter chain: scale + fps", async () => {
    const output = tmp("fg-scale-fps.mp4");
    const args = filterGraph()
      .videoFilter(scale({ width: 640, height: 360 }))
      .videoFilter(fps(24))
      .toArgs();

    await execute(["-i", FIXTURES.videoShort, ...args, "-t", "2", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectDimensions(info, 640, 360);
  });

  it("simple audio filter chain: loudnorm + afade", async () => {
    const output = tmp("fg-audio-chain.wav");
    const args = filterGraph()
      .audioFilter(loudnorm({ i: -14 }))
      .audioFilter(afade("out", { duration: 1 }))
      .toArgs();

    await execute(["-i", FIXTURES.audioSpeech, ...args, "-t", "3", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    const audioStream = info.streams.find((s) => s.type === "audio");
    expect(audioStream).toBeDefined();
  });

  it("complex multi-input filter graph: overlay two videos", async () => {
    const output = tmp("fg-overlay.mp4");
    const complexStr = [
      "[0:v]scale=640:360[base]",
      "[1:v]scale=160:90[pip]",
      "[base][pip]overlay=x=10:y=10[out]",
    ].join(";");

    const args = filterGraph()
      .complex(complexStr)
      .output("out", "v")
      .toArgs();

    await execute([
      "-i",
      FIXTURES.videoShort,
      "-i",
      FIXTURES.videoNoAudio,
      ...args,
      "-map",
      "0:a",
      "-t",
      "2",
      output,
    ]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectDimensions(info, 640, 360);
  });

  it("combined audio + video complex graph", async () => {
    const output = tmp("fg-combined.mp4");
    const complexStr = [
      `[0:v]${scale({ width: 640, height: 360 })}[v0]`,
      `[0:a]${loudnorm({ i: -14 })}[a0]`,
    ].join(";");

    const args = filterGraph()
      .complex(complexStr)
      .output("v0", "v")
      .output("a0", "a")
      .toArgs();

    await execute(["-i", FIXTURES.videoShort, ...args, "-t", "2", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectDimensions(info, 640, 360);
    const audioStream = info.streams.find((s) => s.type === "audio");
    expect(audioStream).toBeDefined();
  });

  it("video filter helpers produce valid ffmpeg filters", async () => {
    const output = tmp("fg-video-helpers.mp4");
    const filterStr = filterGraph()
      .videoFilter(scale({ width: 320, height: 180 }))
      .videoFilter(crop({ width: 300, height: 160, x: 10, y: 10 }))
      .videoFilter(fps(15))
      .buildVideoFilter();

    await execute(["-i", FIXTURES.videoShort, "-vf", filterStr, "-t", "2", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectDimensions(info, 300, 160);
  });

  it("audio filter helpers produce valid ffmpeg filters", async () => {
    const output = tmp("fg-audio-helpers.wav");
    const filterStr = filterGraph()
      .audioFilter(loudnorm({ i: -14 }))
      .audioFilter(afade("in", { duration: 0.5 }))
      .buildAudioFilter();

    await execute(["-i", FIXTURES.audioSpeech, "-af", filterStr, "-t", "3", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectDurationClose(info.format.duration, 3);
  });
});

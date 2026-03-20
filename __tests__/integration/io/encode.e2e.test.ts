import { mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { execute } from "../../../src/core/execute.ts";
import {
  audioEncoderConfigToArgs,
  buildEncoderConfig,
  encoderConfigToArgs,
} from "../../../src/encoding/config.ts";
import { executeWithFallback } from "../../../src/hardware/fallback.ts";
import {
  describeWithFFmpeg,
  expectCodec,
  expectFileExists,
  FIXTURES,
  probeOutput,
  tmp,
} from "../../helpers.ts";

beforeAll(() => {
  mkdirSync(join(tmpdir(), "ffmpeg-kit-test"), { recursive: true });
});

describeWithFFmpeg("buildEncoderConfig → execute", () => {
  it("encodes video with premium CPU h264", async () => {
    const config = buildEncoderConfig("premium", "cpu", "h264");
    const args = encoderConfigToArgs(config);
    const output = tmp("premium-h264.mp4");

    await execute(["-i", FIXTURES.videoShort, ...args, "-t", "1", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectCodec(info, "video", "h264");
  });

  it("encodes video with economy CPU h264 (smaller than premium)", async () => {
    const configPremium = buildEncoderConfig("premium", "cpu", "h264");
    const configEconomy = buildEncoderConfig("economy", "cpu", "h264");
    const outputPremium = tmp("encode-premium.mp4");
    const outputEconomy = tmp("encode-economy.mp4");

    await execute([
      "-i",
      FIXTURES.videoShort,
      ...encoderConfigToArgs(configPremium),
      "-t",
      "1",
      outputPremium,
    ]);
    await execute([
      "-i",
      FIXTURES.videoShort,
      ...encoderConfigToArgs(configEconomy),
      "-t",
      "1",
      outputEconomy,
    ]);

    expectFileExists(outputPremium);
    expectFileExists(outputEconomy);

    const premiumSize = statSync(outputPremium).size;
    const economySize = statSync(outputEconomy).size;
    expect(economySize).toBeLessThan(premiumSize);
  });

  it("encodes with standard CPU hevc", async () => {
    const config = buildEncoderConfig("standard", "cpu", "hevc");
    const args = encoderConfigToArgs(config);
    const output = tmp("standard-hevc.mp4");

    await execute(["-i", FIXTURES.videoShort, ...args, "-t", "1", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectCodec(info, "video", "hevc");
  });

  it("encodes audio with audioEncoderConfigToArgs", async () => {
    const videoConfig = buildEncoderConfig("economy", "cpu", "h264");
    const audioArgs = audioEncoderConfigToArgs({
      codec: "aac",
      bitrate: "128k",
      sampleRate: 44100,
    });
    const output = tmp("audio-config.mp4");

    await execute([
      "-i",
      FIXTURES.videoShort,
      ...encoderConfigToArgs(videoConfig),
      ...audioArgs,
      "-t",
      "1",
      output,
    ]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectCodec(info, "audio", "aac");
  });
});

describeWithFFmpeg("executeWithFallback", () => {
  it("falls back to CPU when hw is unavailable (auto mode)", async () => {
    const output = tmp("fallback.mp4");

    const result = await executeWithFallback(
      (inputArgs, encoder) => [
        ...inputArgs,
        "-i",
        FIXTURES.videoShort,
        "-c:v",
        encoder,
        "-t",
        "1",
        output,
      ],
      { hwAccel: "auto", codec: "h264" },
    );

    expectFileExists(output);
    expect(["cpu", "nvidia", "vaapi", "qsv", "vulkan"]).toContain(result.usedMode);
  });

  it("cpu mode executes directly without session management", async () => {
    const output = tmp("fallback-cpu.mp4");

    const result = await executeWithFallback(
      (_inputArgs, encoder) => ["-i", FIXTURES.videoShort, "-c:v", encoder, "-t", "1", output],
      { hwAccel: "cpu", codec: "h264" },
    );

    expectFileExists(output);
    expect(result.usedMode).toBe("cpu");
  });
});

const describeWithNvenc = process.env.FFMPEG_HW_TESTS === "1" ? describe : describe.skip;

describeWithNvenc("NVENC encoding (gated by FFMPEG_HW_TESTS=1)", () => {
  it("encodes with h264_nvenc", async () => {
    const config = buildEncoderConfig("standard", "nvidia", "h264");
    const args = encoderConfigToArgs(config);
    const output = tmp("nvenc-h264.mp4");

    await execute(["-hwaccel", "cuda", "-i", FIXTURES.videoShort, ...args, "-t", "1", output]);

    expectFileExists(output);
    const info = await probeOutput(output);
    expectCodec(info, "video", "h264");
  });
});

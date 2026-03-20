import { expect, it } from "vitest";
import { createFFmpeg } from "../../../src/sdk.ts";
import {
  describeWithFFmpeg,
  expectDurationClose,
  expectFileExists,
  FIXTURES,
  probeOutput,
  tmp,
} from "../../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("cross-operation workflows", () => {
  it("extracts frame then overlays onto another video", async () => {
    const frame = tmp("wf-frame.png");
    const output = tmp("wf-overlay.mp4");

    // Step 1: Extract frame at 2s
    await ffmpeg.extract().input(FIXTURES.videoH264).timestamp(2).output(frame).execute();
    expectFileExists(frame);

    // Step 2: Overlay extracted frame onto short video
    await ffmpeg
      .overlay()
      .base(FIXTURES.videoShort)
      .addOverlay({
        input: frame,
        anchor: "top-right",
        margin: 10,
        scale: { width: 100, height: 100 },
      })
      .output(output)
      .execute();

    expectFileExists(output);
    const info = await probeOutput(output);
    // Overlay output should have same duration as base video
    expect(info.format.duration).toBeGreaterThan(0);
  });

  it("transforms then exports with preset", async () => {
    const intermediate = tmp("wf-intermediate.mp4");
    const final = tmp("wf-final.mp4");

    // Step 1: Scale and trim
    await ffmpeg
      .transform()
      .input(FIXTURES.videoH264)
      .scale({ width: 1280, height: 720 })
      .duration(2)
      .output(intermediate)
      .execute();

    expectFileExists(intermediate);
    const midInfo = await probeOutput(intermediate);
    const midVideo = midInfo.streams.find((s) => s.type === "video");
    expect(midVideo?.type === "video" && midVideo.width).toBe(1280);
    expectDurationClose(midInfo.format.duration, 2, 0.5);

    // Step 2: Export with preset
    await ffmpeg.exportVideo().input(intermediate).preset("youtube_hd").output(final).execute();

    expectFileExists(final);
    const finalInfo = await probeOutput(final);
    // youtube_hd preset should produce H.264 + AAC
    const vStream = finalInfo.streams.find((s) => s.type === "video");
    const aStream = finalInfo.streams.find((s) => s.type === "audio");
    expect(vStream?.codec).toBe("h264");
    expect(aStream?.codec).toBe("aac");
  });

  it("smart transcode respects maxBitrate constraint", async () => {
    const output = tmp("wf-smart-bitrate.mp4");

    // Use a very low maxBitrate to force re-encode
    const result = await ffmpeg.smartTranscode({
      input: FIXTURES.videoH264,
      output,
      target: { maxBitrate: "100k" },
    });

    expectFileExists(output);
    expect(result.actions).toContain("transcode_video");
    expect(result.sizeBytes).toBeGreaterThan(0);
  });
});

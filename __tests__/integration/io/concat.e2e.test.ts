import { expect, it } from "vitest";
import { probe } from "../../../src/core/probe.ts";
import { createFFmpeg } from "../../../src/sdk.ts";
import {
  describeWithFFmpeg,
  expectDimensions,
  expectDurationClose,
  expectFileExists,
  FIXTURES,
  tmp,
} from "../../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("concat()", () => {
  // --- Simple concat (demuxer) ---

  it("concatenates 2 clips without transitions (demuxer)", async () => {
    const out = tmp("concat-demuxer.mp4");
    const result = await ffmpeg
      .concat()
      .addClip(FIXTURES.videoShort)
      .addClip(FIXTURES.videoShort)
      .output(out)
      .execute();

    expect(result.method).toBe("demuxer");
    expect(result.clipCount).toBe(2);
    expectFileExists(out);
    // 2 x 2s clips = ~4s
    expectDurationClose(result.duration, 4, 0.5);
  });

  // --- Crossfade transition ---

  it("concatenates with crossfade transition", async () => {
    const out = tmp("concat-dissolve.mp4");
    const result = await ffmpeg
      .concat()
      .addClip(FIXTURES.videoShort)
      .transition({ type: "dissolve", duration: 0.5 })
      .addClip(FIXTURES.videoShort)
      .output(out)
      .execute();

    expect(result.method).toBe("filter_complex");
    expectFileExists(out);
    // 2 x 2s clips with 0.5s overlap = ~3.5s
    expectDurationClose(result.duration, 3.5, 0.5);
  });

  // --- Fadeblack transition ---

  it("concatenates with fadeblack transition", async () => {
    const out = tmp("concat-fadeblack.mp4");
    const result = await ffmpeg
      .concat()
      .addClip(FIXTURES.videoShort)
      .transition({ type: "fadeblack", duration: 0.5 })
      .addClip(FIXTURES.videoShort)
      .output(out)
      .execute();

    expectFileExists(out);
    expect(result.method).toBe("filter_complex");
  });

  // --- Mixed sources ---

  it("concatenates clips from different resolutions with normalizeResolution", async () => {
    const out = tmp("concat-normalize.mp4");
    const result = await ffmpeg
      .concat()
      .addClip(FIXTURES.videoH264)
      .addClip(FIXTURES.videoShort)
      .normalizeResolution(640, 360)
      .output(out)
      .execute();

    expectFileExists(out);
    expect(result.method).toBe("filter_complex");
    const probeResult = await probe(out);
    expectDimensions(probeResult, 640, 360);
  });

  // --- 5+ clips ---

  it("concatenates 5 clips", async () => {
    const out = tmp("concat-5clips.mp4");
    const result = await ffmpeg
      .concat()
      .addClip(FIXTURES.videoShort)
      .addClip(FIXTURES.videoShort)
      .addClip(FIXTURES.videoShort)
      .addClip(FIXTURES.videoShort)
      .addClip(FIXTURES.videoShort)
      .output(out)
      .execute();

    expect(result.clipCount).toBe(5);
    expectFileExists(out);
    expectDurationClose(result.duration, 10, 1);
  }, 60_000);

  // --- Per-clip trim ---

  it("concatenates with per-clip trimming", async () => {
    const out = tmp("concat-trim.mp4");
    const result = await ffmpeg
      .concat()
      .addClip({ path: FIXTURES.videoShort, trimStart: 0.5, duration: 1 })
      .addClip({ path: FIXTURES.videoShort, trimStart: 0, duration: 1 })
      .output(out)
      .execute();

    expectFileExists(out);
    expectDurationClose(result.duration, 2, 0.5);
  });

  // --- Missing audio fill ---

  it("fills silence for clips without audio", async () => {
    const out = tmp("concat-fill-silence.mp4");
    const _result = await ffmpeg
      .concat()
      .addClip(FIXTURES.videoNoAudio)
      .addClip(FIXTURES.videoShort)
      .fillSilence()
      .output(out)
      .execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expect(probeResult.streams.some((s) => s.type === "audio")).toBe(true);
  });

  // --- defaultTransition ---

  it("applies defaultTransition to all junctions", async () => {
    const out = tmp("concat-default-trans.mp4");
    const result = await ffmpeg
      .concat()
      .addClip(FIXTURES.videoShort)
      .addClip(FIXTURES.videoShort)
      .defaultTransition({ type: "fade", duration: 0.5 })
      .output(out)
      .execute();

    expect(result.method).toBe("filter_complex");
    expectFileExists(out);
  });

  // --- tryExecute ---

  it("tryExecute returns failure for nonexistent clip", async () => {
    const result = await ffmpeg
      .concat()
      .addClip("nonexistent-a.mp4")
      .addClip("nonexistent-b.mp4")
      .output(tmp("concat-fail.mp4"))
      .tryExecute();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

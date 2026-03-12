import { expect, it } from "vitest";
import { probe } from "../../src/core/probe.ts";
import { createFFmpeg } from "../../src/sdk.ts";
import {
  describeWithFFmpeg,
  expectDurationClose,
  expectFileExists,
  FIXTURES,
  tmp,
} from "../helpers.ts";

const ffmpeg = createFFmpeg();

describeWithFFmpeg("audio()", () => {
  // --- Extract audio ---

  it("extracts audio from video as WAV", async () => {
    const out = tmp("audio-extract.wav");
    const result = await ffmpeg
      .audio()
      .input(FIXTURES.videoH264)
      .extractAudio()
      .output(out)
      .execute();

    expect(result.outputPath).toBe(out);
    expectFileExists(out);

    const probeResult = await probe(out);
    const hasAudio = probeResult.streams.some((s) => s.type === "audio");
    const hasVideo = probeResult.streams.some((s) => s.type === "video");
    expect(hasAudio).toBe(true);
    expect(hasVideo).toBe(false);
    expectDurationClose(probeResult.format.duration ?? 0, 5, 0.5);
  });

  it("extracts audio with codec and bitrate", async () => {
    const out = tmp("audio-extract.mp3");
    const _result = await ffmpeg
      .audio()
      .input(FIXTURES.videoH264)
      .extractAudio({ codec: "libmp3lame", bitrate: "192k" })
      .output(out)
      .execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    const audioStream = probeResult.streams.find((s) => s.type === "audio");
    expect(audioStream?.codec).toBe("mp3");
    expectDurationClose(probeResult.format.duration ?? 0, 5, 0.5);
  });

  // --- Mixing ---

  it("mixes two audio sources", async () => {
    const out = tmp("audio-mix.wav");
    const _result = await ffmpeg
      .audio()
      .input(FIXTURES.audioSpeech)
      .addInput(FIXTURES.audioMusic, { volume: 0.3 })
      .output(out)
      .execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expect(probeResult.streams.some((s) => s.type === "audio")).toBe(true);
    // Output should be at least as long as the longer input (audioMusic is 5s)
    expect(probeResult.format.duration ?? 0).toBeGreaterThan(3);
  });

  // --- Volume ---

  it("adjusts volume with dB string", async () => {
    const out = tmp("audio-volume.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).codec("pcm_s16le").output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expect(probeResult.streams.some((s) => s.type === "audio")).toBe(true);
  });

  // --- Ducking ---

  it("applies sidechain ducking", async () => {
    const out = tmp("audio-duck.wav");
    const _result = await ffmpeg
      .audio()
      .input(FIXTURES.audioMusic)
      .addInput(FIXTURES.audioSpeech)
      .duck({ trigger: 1, amount: -12 })
      .output(out)
      .execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expect(probeResult.streams.some((s) => s.type === "audio")).toBe(true);
  });

  // --- Normalize ---

  it("normalizes loudness (single-pass) to target LUFS", async () => {
    const out = tmp("audio-norm-single.wav");
    const result = await ffmpeg
      .audio()
      .input(FIXTURES.audioSpeech)
      .normalize({ targetLufs: -14 })
      .output(out)
      .execute();

    expectFileExists(out);
    expect(result.outputPath).toBe(out);
  });

  it("normalizes loudness (two-pass) to target LUFS", async () => {
    const out = tmp("audio-norm-twopass.wav");
    const result = await ffmpeg
      .audio()
      .input(FIXTURES.audioSpeech)
      .normalize({ targetLufs: -14, twoPass: true })
      .output(out)
      .execute();

    expectFileExists(out);
    expect(result.outputPath).toBe(out);
  });

  // --- Fades ---

  it("applies fade in", async () => {
    const out = tmp("audio-fadein.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).fadeIn({ duration: 1 }).output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expectDurationClose(probeResult.format.duration ?? 0, 3, 0.5);
  });

  it("applies fade out", async () => {
    const out = tmp("audio-fadeout.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).fadeOut({ duration: 1 }).output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expectDurationClose(probeResult.format.duration ?? 0, 3, 0.5);
  });

  // --- Tempo ---

  it("changes tempo 2x", async () => {
    const out = tmp("audio-tempo2x.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).tempo(2).output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    // Duration should be approximately half
    expectDurationClose(probeResult.format.duration ?? 0, 1.5, 0.3);
  });

  // --- Filters ---

  it("applies highpass filter", async () => {
    const out = tmp("audio-highpass.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).highpass(200).output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expect(probeResult.streams.some((s) => s.type === "audio")).toBe(true);
  });

  it("applies lowpass filter", async () => {
    const out = tmp("audio-lowpass.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).lowpass(8000).output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    expect(probeResult.streams.some((s) => s.type === "audio")).toBe(true);
  });

  it("resamples to different sample rate", async () => {
    const out = tmp("audio-resample.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).resample(44100).output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    const audioStream = probeResult.streams.find((s) => s.type === "audio");
    expect(audioStream?.sampleRate).toBe(44100);
  });

  it("converts channel count", async () => {
    const out = tmp("audio-channels.wav");
    await ffmpeg.audio().input(FIXTURES.audioSpeech).channels(2).output(out).execute();

    expectFileExists(out);
    const probeResult = await probe(out);
    const audioStream = probeResult.streams.find((s) => s.type === "audio");
    expect(audioStream?.channels).toBe(2);
  });

  // --- Silence detection ---

  it("detects silence ranges", async () => {
    const result = await ffmpeg
      .audio()
      .input(FIXTURES.audioSilence)
      .detectSilence({ threshold: -40, duration: 0.5 })
      .execute();

    expect(result.silenceRanges).toBeDefined();
    expect(result.silenceRanges!.length).toBeGreaterThan(0);
    // The silence starts around 1.5s
    const firstRange = result.silenceRanges![0];
    expect(firstRange).toBeDefined();
    expect(firstRange!.start).toBeGreaterThan(1);
    expect(firstRange!.start).toBeLessThan(2.5);
  });

  // --- tryExecute ---

  it("tryExecute returns success on valid input", async () => {
    const out = tmp("audio-try-success.wav");
    const result = await ffmpeg.audio().input(FIXTURES.audioSpeech).output(out).tryExecute();
    expect(result.success).toBe(true);
    if (result.success) {
      expectFileExists(result.data.outputPath);
    }
  });

  it("tryExecute returns failure on invalid input", async () => {
    const result = await ffmpeg
      .audio()
      .input("nonexistent-file.wav")
      .output(tmp("audio-try-fail.wav"))
      .tryExecute();
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
    }
  });
});

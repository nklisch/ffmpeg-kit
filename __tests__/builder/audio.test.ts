import { describe, expect, it } from "vitest";
import { audio } from "../../src/operations/audio/audio.ts";

describe("audio()", () => {
  // --- Required field validation ---

  it("throws when input() is missing", () => {
    expect(() => audio().output("out.wav").toArgs()).toThrow();
  });

  it("throws when output() is missing", () => {
    expect(() => audio().input("in.wav").toArgs()).toThrow();
  });

  // --- Extract audio ---

  it("produces -vn for extractAudio()", () => {
    const args = audio().input("v.mp4").extractAudio().output("out.wav").toArgs();
    expect(args).toContain("-vn");
    expect(args).not.toContain("-af");
  });

  it("produces codec args for extractAudio({ codec, bitrate, sampleRate, channels })", () => {
    const args = audio()
      .input("v.mp4")
      .extractAudio({ codec: "libmp3lame", bitrate: "192k", sampleRate: 44100, channels: 1 })
      .output("out.mp3")
      .toArgs();
    expect(args).toContain("-vn");
    expect(args).toContain("-c:a");
    expect(args).toContain("libmp3lame");
    expect(args).toContain("-b:a");
    expect(args).toContain("192k");
    expect(args).toContain("-ar");
    expect(args).toContain("44100");
    expect(args).toContain("-ac");
    expect(args).toContain("1");
  });

  // --- Single-input filters ---

  it("produces highpass filter", () => {
    const args = audio().input("a.wav").highpass(200).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("highpass=f=200:poles=2");
  });

  it("produces lowpass filter", () => {
    const args = audio().input("a.wav").lowpass(8000).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("lowpass=f=8000:poles=2");
  });

  it("produces equalizer filter", () => {
    const args = audio().input("a.wav").eq({ frequency: 1000, gain: 6 }).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("equalizer=f=1000:width_type=q:w=1:g=6");
  });

  it("produces bass filter", () => {
    const args = audio().input("a.wav").bass(6).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("bass=g=6:f=100");
  });

  it("produces treble filter", () => {
    const args = audio().input("a.wav").treble(-3).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("treble=g=-3:f=3000");
  });

  it("produces acompressor filter", () => {
    const args = audio().input("a.wav").compress().output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("acompressor");
    expect(af).toContain("threshold=");
    expect(af).toContain("ratio=");
    expect(af).toContain("attack=");
    expect(af).toContain("release=");
  });

  it("produces alimiter filter", () => {
    const args = audio()
      .input("a.wav")
      .limit({ limit: 0.9, attack: 5, release: 50 })
      .output("out.wav")
      .toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("alimiter=limit=0.9:attack=5:release=50");
  });

  it("produces loudnorm filter", () => {
    const args = audio().input("a.wav").normalize({ targetLufs: -14 }).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("loudnorm=I=-14:TP=-1.5:LRA=11");
  });

  it("throws in toArgs() for normalize({ twoPass: true })", () => {
    expect(() =>
      audio()
        .input("a.wav")
        .normalize({ targetLufs: -14, twoPass: true })
        .output("out.wav")
        .toArgs(),
    ).toThrow(/two-pass/i);
  });

  it("produces afade in filter", () => {
    const args = audio().input("a.wav").fadeIn({ duration: 2 }).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("afade=t=in:d=2:curve=tri");
  });

  it("produces afade out filter with explicit startAt", () => {
    const args = audio()
      .input("a.wav")
      .fadeOut({ duration: 3, startAt: 7 })
      .output("out.wav")
      .toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("afade=t=out:d=3:st=7:curve=tri");
  });

  it("produces agate filter", () => {
    const args = audio().input("a.wav").gate().output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("agate=threshold=");
  });

  it("produces afftdn filter for denoise", () => {
    const args = audio().input("a.wav").denoise().output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("afftdn=nf=");
  });

  it("produces echo filter", () => {
    const args = audio().input("a.wav").echo().output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("aecho=");
  });

  it("produces tempo filter with chaining for > 2x", () => {
    const args = audio().input("a.wav").tempo(4).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("atempo=2,atempo=2");
  });

  it("produces rubberband filter for pitch", () => {
    const args = audio().input("a.wav").pitch(12).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("rubberband=pitch=2");
  });

  it("produces resample filter", () => {
    const args = audio().input("a.wav").resample(44100).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("aresample=44100");
    expect(af).not.toContain("resampler=soxr");
  });

  it("produces resample with soxr", () => {
    const args = audio().input("a.wav").resample(44100, true).output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("aresample=44100:resampler=soxr");
  });

  // --- Filter chain ordering ---

  it("applies filters in correct signal-flow order", () => {
    const args = audio()
      .input("a.wav")
      .highpass(200)
      .normalize({ targetLufs: -14 })
      .compress()
      .fadeIn({ duration: 1 })
      .output("out.wav")
      .toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toBeDefined();
    // Order: highpass → compress → loudnorm → afade
    expect(af!.indexOf("highpass")).toBeLessThan(af!.indexOf("acompressor"));
    expect(af!.indexOf("acompressor")).toBeLessThan(af!.indexOf("loudnorm"));
    expect(af!.indexOf("loudnorm")).toBeLessThan(af!.indexOf("afade"));
  });

  // --- Output codec/format ---

  it("produces codec and bitrate args", () => {
    const args = audio()
      .input("a.wav")
      .codec("libopus")
      .bitrate("128k")
      .output("out.opus")
      .toArgs();
    expect(args).toContain("-c:a");
    expect(args).toContain("libopus");
    expect(args).toContain("-b:a");
    expect(args).toContain("128k");
  });

  it("produces sample rate and channels args", () => {
    const args = audio().input("a.wav").sampleRate(44100).channels(1).output("out.wav").toArgs();
    expect(args).toContain("-ar");
    expect(args).toContain("44100");
    expect(args).toContain("-ac");
    expect(args).toContain("1");
  });

  it("produces channel layout arg", () => {
    const args = audio().input("a.wav").channelLayout("mono").output("out.wav").toArgs();
    expect(args).toContain("-channel_layout");
    expect(args).toContain("mono");
  });

  // --- Deess ---

  it("produces equalizer-based deess filter", () => {
    const args = audio().input("a.wav").deess().output("out.wav").toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("equalizer=f=6000");
    expect(af).toContain("g=-6");
  });

  it("produces deess filter with custom frequency and intensity", () => {
    const args = audio()
      .input("a.wav")
      .deess({ frequency: 8000, intensity: 10 })
      .output("out.wav")
      .toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("equalizer=f=8000");
    expect(af).toContain("g=-10");
  });

  // --- Multi-input (addInput / duck) ---

  it("produces filter_complex with amix for addInput()", () => {
    const args = audio().input("a.wav").addInput("b.wav").output("out.wav").toArgs();
    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    const fc = args[fcIdx + 1];
    expect(fc).toContain("amix=inputs=2");
    expect(fc).toContain("duration=longest");
    expect(args).toContain("-map");
    expect(args).toContain("[out]");
  });

  it("produces filter_complex with volume and delay for addInput config", () => {
    const args = audio()
      .input("a.wav")
      .addInput("b.wav", { volume: 0.5, delay: 1000 })
      .output("out.wav")
      .toArgs();
    const fcIdx = args.indexOf("-filter_complex");
    const fc = args[fcIdx + 1];
    expect(fc).toContain("volume=0.5");
    expect(fc).toContain("adelay=1000|1000");
  });

  it("produces sidechaincompress for duck()", () => {
    const args = audio()
      .input("music.wav")
      .addInput("voice.wav")
      .duck({ trigger: 1, amount: 12 })
      .output("out.wav")
      .toArgs();
    expect(args).toContain("-filter_complex");
    const fcIdx = args.indexOf("-filter_complex");
    const fc = args[fcIdx + 1];
    expect(fc).toContain("sidechaincompress");
    expect(fc).toContain("[0:a][1:a]");
  });

  // --- Denoise with anlmdn method ---

  it("produces anlmdn filter for denoise with anlmdn method", () => {
    const args = audio()
      .input("a.wav")
      .denoise({ method: "anlmdn", amount: 2 })
      .output("out.wav")
      .toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("anlmdn=s=2");
  });

  // --- Silence detection mode ---

  it("produces silencedetect filter with -f null output for detectSilence", () => {
    const args = audio().input("a.wav").detectSilence({ threshold: -40, duration: 0.5 }).toArgs();
    const af = args[args.indexOf("-af") + 1];
    expect(af).toContain("silencedetect=noise=-40dB:d=0.5");
    expect(args).toContain("-f");
    expect(args).toContain("null");
    expect(args).toContain("-");
  });
});

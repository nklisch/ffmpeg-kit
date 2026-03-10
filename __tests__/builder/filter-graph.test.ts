import { describe, expect, it } from "vitest";
import {
  between,
  clamp,
  easing,
  enable,
  ifExpr,
  lerp,
  timeRange,
} from "../../src/filters/helpers.ts";
import {
  acrossfade,
  adelay,
  afade,
  afftdn,
  agate,
  alimiter,
  amix,
  acompressor,
  areverse,
  aresample,
  atempo,
  bass,
  equalizer,
  highpass,
  loudnorm,
  lowpass,
  silencedetect,
  treble,
  volume,
} from "../../src/filters/audio.ts";
import {
  chain,
  filter,
  filterGraph,
} from "../../src/filters/graph.ts";
import {
  chromakey,
  colorkey,
  crop,
  drawtext,
  format,
  fps,
  hflip,
  overlayFilter,
  pad,
  reverse,
  scale,
  setpts,
  transpose,
  vflip,
  xfade,
} from "../../src/filters/video.ts";

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

describe("filter helpers", () => {
  it("builds between expression for start+end", () => {
    expect(timeRange({ start: 5, end: 10 })).toBe("between(t,5,10)");
  });

  it("builds gte expression for start-only", () => {
    expect(timeRange({ start: 5 })).toBe("gte(t,5)");
  });

  it("builds lte expression for end-only", () => {
    expect(timeRange({ end: 10 })).toBe("lte(t,10)");
  });

  it("returns empty string for empty timeRange", () => {
    expect(timeRange({})).toBe("");
  });

  it("builds between expression", () => {
    expect(between(5, 10)).toBe("between(t,5,10)");
  });

  it("wraps expression in enable syntax", () => {
    expect(enable("between(t,5,10)")).toBe("enable='between(t,5,10)'");
  });

  it("builds lerp expression", () => {
    expect(lerp(1, 2, "t", 5)).toBe("1+(2-1)*t/5");
  });

  it("builds easing expressions for linear", () => {
    expect(easing("linear", "t", 5)).toBe("t/5");
  });

  it("builds easing expressions for ease-in", () => {
    expect(easing("ease-in", "t", 5)).toBe("pow(t/5,2)");
  });

  it("builds easing expressions for ease-out", () => {
    expect(easing("ease-out", "t", 5)).toBe("1-pow(1-t/5,2)");
  });

  it("builds easing expressions for ease-in-out", () => {
    expect(easing("ease-in-out", "t", 5)).toBe("3*pow(t/5,2)-2*pow(t/5,3)");
  });

  it("builds clamp expression", () => {
    expect(clamp("x", 0, 100)).toBe("min(max(x,0),100)");
  });

  it("builds conditional if expression", () => {
    expect(ifExpr("gt(t,5)", "1", "0")).toBe("if(gt(t,5),1,0)");
  });
});

// ---------------------------------------------------------------------------
// Video filters
// ---------------------------------------------------------------------------

describe("video filters", () => {
  it("scale with width only → -2 height", () => {
    expect(scale({ width: 1920 })).toBe("scale=1920:-2");
  });

  it("scale with height only → -2 width", () => {
    expect(scale({ height: 720 })).toBe("scale=-2:720");
  });

  it("scale with both dimensions", () => {
    expect(scale({ width: 1920, height: 1080 })).toBe("scale=1920:1080");
  });

  it("scale with algorithm flag", () => {
    const result = scale({ width: 1920 }, { algorithm: "lanczos" });
    expect(result).toContain("flags=lanczos");
    expect(result).toContain("scale=1920:-2");
  });

  it("scale with fit:contain → scale+pad chain", () => {
    const result = scale({ width: 1920 }, { fit: "contain" });
    expect(result).toContain("scale=1920:-2:force_original_aspect_ratio=decrease");
    expect(result).toContain("pad=1920:ih:(ow-iw)/2:(oh-ih)/2");
  });

  it("scale with fit:cover → scale+crop chain", () => {
    const result = scale({ width: 1920, height: 1080 }, { fit: "cover" });
    expect(result).toContain("scale=1920:1080:force_original_aspect_ratio=increase");
    expect(result).toContain("crop=1920:1080");
  });

  it("crop with explicit dimensions", () => {
    expect(crop({ width: 640, height: 480 })).toBe("crop=640:480");
  });

  it("crop with aspect ratio", () => {
    const result = crop({ aspectRatio: "16:9" });
    expect(result).toContain("16");
    expect(result).toContain("9");
    expect(result).toContain("ih");
  });

  it("crop with x,y position", () => {
    expect(crop({ width: 640, height: 480, x: 100, y: 50 })).toBe("crop=640:480:100:50");
  });

  it("overlay with x,y position", () => {
    expect(overlayFilter({ x: "W-w-10", y: "H-h-10" })).toBe("overlay=x=W-w-10:y=H-h-10");
  });

  it("overlay with enable expression", () => {
    const result = overlayFilter({ x: 0, y: 0, enable: "between(t,5,10)" });
    expect(result).toContain("enable=");
    expect(result).toContain("between(t,5,10)");
  });

  it("pad with centered position", () => {
    expect(pad({ width: 1920, height: 1080 })).toBe("pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black");
  });

  it("pad with custom color", () => {
    const result = pad({ width: 1920, height: 1080, color: "white" });
    expect(result).toContain("white");
  });

  it("drawtext with text content, escapes special chars", () => {
    const result = drawtext({ text: "Hello: World" });
    expect(result).toContain("drawtext=");
    expect(result).toContain("text=");
    // colon should be escaped
    expect(result).not.toContain("Hello: World");
    expect(result).toContain("\\:");
  });

  it("drawtext with fontFile, fontSize, fontColor", () => {
    const result = drawtext({ fontFile: "/path/to/font.ttf", fontSize: 24, fontColor: "white" });
    expect(result).toContain("fontfile=");
    expect(result).toContain("fontsize=24");
    expect(result).toContain("fontcolor=white");
  });

  it("setpts for speed factor", () => {
    expect(setpts(2)).toBe("setpts=PTS/2");
    expect(setpts(0.5)).toBe("setpts=PTS/0.5");
  });

  it("transpose for 90 degrees", () => {
    expect(transpose(90)).toBe("transpose=1");
  });

  it("transpose for 180 degrees", () => {
    expect(transpose(180)).toBe("transpose=1,transpose=1");
  });

  it("transpose for 270 degrees", () => {
    expect(transpose(270)).toBe("transpose=2");
  });

  it("hflip, vflip, reverse return correct strings", () => {
    expect(hflip()).toBe("hflip");
    expect(vflip()).toBe("vflip");
    expect(reverse()).toBe("reverse");
  });

  it("fps returns fps=N", () => {
    expect(fps(30)).toBe("fps=30");
  });

  it("xfade with transition type, duration, offset", () => {
    expect(xfade({ transition: "fade", duration: 1, offset: 4 })).toBe(
      "xfade=transition=fade:duration=1:offset=4",
    );
  });

  it("format returns format=pix_fmts=...", () => {
    expect(format("yuv420p")).toBe("format=pix_fmts=yuv420p");
  });

  it("chromakey with color and options", () => {
    const result = chromakey({ color: "green", similarity: 0.1, blend: 0.05 });
    expect(result).toContain("chromakey=");
    expect(result).toContain("color=green");
    expect(result).toContain("similarity=0.1");
    expect(result).toContain("blend=0.05");
  });

  it("colorkey with color", () => {
    const result = colorkey({ color: "blue" });
    expect(result).toContain("colorkey=");
    expect(result).toContain("color=blue");
  });
});

// ---------------------------------------------------------------------------
// Audio filters
// ---------------------------------------------------------------------------

describe("audio filters", () => {
  it("volume with number", () => {
    expect(volume(0.5)).toBe("volume=0.5");
  });

  it("volume with dB string", () => {
    expect(volume("-6dB")).toBe("volume=-6dB");
  });

  it("loudnorm with basic params", () => {
    const result = loudnorm({ i: -14, tp: -1.5 });
    expect(result).toBe("loudnorm=I=-14:TP=-1.5");
  });

  it("loudnorm with measured values (2nd pass)", () => {
    const result = loudnorm({
      i: -14,
      measuredI: -15.3,
      measuredTp: -2.0,
      measuredLra: 8.5,
      measuredThresh: -25.3,
    });
    expect(result).toContain("measured_I=-15.3");
    expect(result).toContain("measured_TP=-2");
    expect(result).toContain("measured_LRA=8.5");
    expect(result).toContain("measured_thresh=-25.3");
  });

  it("afade in with duration", () => {
    expect(afade("in", { duration: 2 })).toBe("afade=t=in:d=2");
  });

  it("afade out with startAt and curve", () => {
    const result = afade("out", { duration: 2, startAt: 8, curve: "exp" });
    expect(result).toContain("st=8");
    expect(result).toContain("curve=exp");
  });

  it("amix with inputs and duration", () => {
    expect(amix({ inputs: 2, duration: "longest" })).toBe("amix=inputs=2:duration=longest");
  });

  it("acompressor with all params", () => {
    const result = acompressor({ threshold: 0.125, ratio: 4, attack: 5, release: 50 });
    expect(result).toContain("acompressor=");
    expect(result).toContain("threshold=0.125");
    expect(result).toContain("ratio=4");
  });

  it("alimiter with limit", () => {
    const result = alimiter({ limit: 0.9 });
    expect(result).toContain("alimiter=");
    expect(result).toContain("limit=0.9");
  });

  it("equalizer with frequency and gain", () => {
    expect(equalizer({ frequency: 1000, gain: 6 })).toBe("equalizer=f=1000:g=6");
  });

  it("highpass with frequency", () => {
    expect(highpass(200)).toBe("highpass=f=200");
  });

  it("lowpass with frequency", () => {
    expect(lowpass(8000)).toBe("lowpass=f=8000");
  });

  it("bass and treble with gain", () => {
    const b = bass(6);
    expect(b).toContain("bass=");
    expect(b).toContain("g=6");
    const t = treble(3);
    expect(t).toContain("treble=");
    expect(t).toContain("g=3");
  });

  it("atempo single (in range)", () => {
    expect(atempo(1.5)).toBe("atempo=1.5");
  });

  it("atempo chained (factor > 2)", () => {
    expect(atempo(4)).toBe("atempo=2.0,atempo=2.0");
  });

  it("atempo chained (factor < 0.5)", () => {
    expect(atempo(0.25)).toBe("atempo=0.5,atempo=0.5");
  });

  it("silencedetect with noise and duration", () => {
    const result = silencedetect({ noise: -40, duration: 0.5 });
    expect(result).toContain("silencedetect=");
    expect(result).toContain("noise=-40dB");
    expect(result).toContain("d=0.5");
  });

  it("acrossfade with duration", () => {
    expect(acrossfade({ duration: 1 })).toBe("acrossfade=d=1");
  });

  it("adelay with ms and channel count", () => {
    expect(adelay(500)).toBe("adelay=500|500");
    expect(adelay(500, 3)).toBe("adelay=500|500|500");
  });

  it("aresample with sampleRate", () => {
    expect(aresample(44100)).toBe("aresample=44100");
  });

  it("aresample with soxr flag", () => {
    expect(aresample(44100, true)).toBe("aresample=44100:resampler=soxr");
  });

  it("areverse returns 'areverse'", () => {
    expect(areverse()).toBe("areverse");
  });

  it("agate returns filter string", () => {
    expect(agate()).toBe("agate");
    const result = agate({ threshold: 0.01 });
    expect(result).toContain("agate=");
    expect(result).toContain("threshold=0.01");
  });

  it("afftdn returns filter string", () => {
    expect(afftdn()).toBe("afftdn");
    const result = afftdn({ nr: 10 });
    expect(result).toContain("afftdn=");
    expect(result).toContain("nr=10");
  });
});

// ---------------------------------------------------------------------------
// FilterGraphBuilder
// ---------------------------------------------------------------------------

describe("FilterGraphBuilder", () => {
  it("empty builder produces empty args", () => {
    expect(filterGraph().toArgs()).toEqual([]);
  });

  it("single video filter → -vf args", () => {
    const args = filterGraph().videoFilter("scale=1920:-2").toArgs();
    expect(args).toEqual(["-vf", "scale=1920:-2"]);
  });

  it("multiple video filters → comma-joined -vf", () => {
    const args = filterGraph().videoFilter("scale=1920:-2").videoFilter("fps=30").toArgs();
    expect(args).toEqual(["-vf", "scale=1920:-2,fps=30"]);
  });

  it("single audio filter → -af args", () => {
    const args = filterGraph().audioFilter("loudnorm").toArgs();
    expect(args).toEqual(["-af", "loudnorm"]);
  });

  it("multiple audio filters → comma-joined -af", () => {
    const args = filterGraph()
      .audioFilter("loudnorm")
      .audioFilter("afade=t=out:d=2")
      .toArgs();
    expect(args).toEqual(["-af", "loudnorm,afade=t=out:d=2"]);
  });

  it("both video and audio → -vf and -af args", () => {
    const args = filterGraph().videoFilter("scale=1920:-2").audioFilter("loudnorm").toArgs();
    expect(args).toContain("-vf");
    expect(args).toContain("-af");
    expect(args).toContain("scale=1920:-2");
    expect(args).toContain("loudnorm");
  });

  it("FilterNode objects converted to strings", () => {
    const result = filterGraph()
      .videoFilter({ name: "scale", options: { w: 1920, h: -2 } })
      .buildVideoFilter();
    expect(result).toBe("scale=w=1920:h=-2");
  });

  it("complex string passthrough", () => {
    const args = filterGraph().complex("[0:v]scale=1920:-2[v0]").toArgs();
    expect(args).toEqual(["-filter_complex", "[0:v]scale=1920:-2[v0]"]);
  });

  it("complex nodes serialized with pad labels", () => {
    const result = filterGraph()
      .complex([
        {
          name: "scale",
          options: { w: 1920, h: -2 },
          inputs: ["0:v"],
          outputs: ["scaled"],
        },
      ])
      .buildComplex();
    expect(result).toBe("[0:v]scale=w=1920:h=-2[scaled]");
  });

  it("multi-node complex joined with semicolons", () => {
    const result = filterGraph()
      .complex([
        { name: "scale", options: { w: 1920, h: -2 }, inputs: ["0:v"], outputs: ["v0"] },
        { name: "loudnorm", inputs: ["0:a"], outputs: ["a0"] },
      ])
      .buildComplex();
    expect(result).toContain(";");
    expect(result).toContain("[0:v]scale=w=1920:h=-2[v0]");
    expect(result).toContain("[0:a]loudnorm[a0]");
  });

  it("output mappings produce -map args", () => {
    const args = filterGraph()
      .complex("[0:v]scale=1920:-2[vout]")
      .output("vout", "v")
      .output("aout", "a")
      .toArgs();
    expect(args).toContain("-map");
    expect(args).toContain("[vout]");
    expect(args).toContain("[aout]");
  });

  it("complex mode ignores simple video/audio filters in toArgs", () => {
    const args = filterGraph()
      .videoFilter("scale=1920:-2")
      .complex("[0:v]hflip[v0]")
      .toArgs();
    // complex mode: should not include -vf
    expect(args).not.toContain("-vf");
    expect(args).toContain("-filter_complex");
  });

  it("filter() convenience function", () => {
    expect(filter("scale", { w: 1920, h: -2 })).toBe("scale=w=1920:h=-2");
  });

  it("chain() joins with commas", () => {
    expect(chain("scale=1920:-2", "fps=30")).toBe("scale=1920:-2,fps=30");
  });

  it("chain() with empty args returns empty string", () => {
    expect(chain()).toBe("");
  });

  it("toString() returns filter string in simple mode", () => {
    const result = filterGraph().videoFilter("scale=1920:-2").toString();
    expect(result).toContain("scale=1920:-2");
  });

  it("toString() returns complex string in complex mode", () => {
    const graph = "[0:v]scale=1920:-2[v0]";
    expect(filterGraph().complex(graph).toString()).toBe(graph);
  });

  it("buildVideoFilter() returns empty string when no video filters", () => {
    expect(filterGraph().buildVideoFilter()).toBe("");
  });

  it("buildAudioFilter() returns empty string when no audio filters", () => {
    expect(filterGraph().buildAudioFilter()).toBe("");
  });

  it("buildComplex() returns empty string when not in complex mode", () => {
    expect(filterGraph().buildComplex()).toBe("");
  });
});

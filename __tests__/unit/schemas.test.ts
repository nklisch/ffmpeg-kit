import { describe, expect, it } from "vitest";
import {
  audioStreamInfoSchema,
  chapterInfoSchema,
  formatInfoSchema,
  probeResultSchema,
  rawProbeOutputSchema,
  streamDispositionSchema,
  streamInfoSchema,
  subtitleStreamInfoSchema,
  videoStreamInfoSchema,
} from "../../src/schemas/probe.ts";

// Shared test fixtures

const baseDisposition = {
  default: 1,
  dub: 0,
  original: 0,
  comment: 0,
  lyrics: 0,
  karaoke: 0,
  forced: 0,
  hearing_impaired: 0,
  visual_impaired: 0,
  attached_pic: 0,
};

const videoStream = {
  index: 0,
  codec_type: "video" as const,
  codec_name: "h264",
  codec_long_name: "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
  profile: "High",
  width: 1920,
  height: 1080,
  pix_fmt: "yuv420p",
  r_frame_rate: "30/1",
  avg_frame_rate: "30/1",
  disposition: baseDisposition,
  tags: {},
};

const audioStream = {
  index: 1,
  codec_type: "audio" as const,
  codec_name: "aac",
  codec_long_name: "AAC (Advanced Audio Coding)",
  sample_rate: "48000",
  channels: 2,
  channel_layout: "stereo",
  sample_fmt: "fltp",
  disposition: baseDisposition,
  tags: {},
};

const rawFormat = {
  filename: "video.mp4",
  format_name: "mov,mp4,m4a,3gp,3g2,mj2",
  format_long_name: "QuickTime / MOV",
  duration: "5.000000",
  size: "1234567",
  bit_rate: "1975307",
  start_time: "0.000000",
  nb_streams: 2,
  tags: { major_brand: "isom" },
};

const fullRawInput = {
  format: rawFormat,
  streams: [videoStream, audioStream],
  chapters: [],
};

// --- probeResultSchema ---

describe("probeResultSchema", () => {
  it("parses a complete ffprobe video+audio output", () => {
    const result = probeResultSchema.parse(fullRawInput);

    expect(result.format.duration).toBe(5);
    expect(result.format.formatName).toBe("mov,mp4,m4a,3gp,3g2,mj2");
    expect(result.format.formatLongName).toBe("QuickTime / MOV");
    expect(result.format.size).toBe(1234567);
    expect(result.format.bitrate).toBe(1975307);
    expect(result.format.startTime).toBe(0);
    expect(result.format.nbStreams).toBe(2);
    expect(result.format.tags).toEqual({ major_brand: "isom" });

    expect(result.streams).toHaveLength(2);
    expect(result.streams[0]!.type).toBe("video");
    expect(result.streams[1]!.type).toBe("audio");
    expect(result.chapters).toHaveLength(0);
  });

  it("defaults missing streams to empty array", () => {
    const result = probeResultSchema.parse({ format: rawFormat });
    expect(result.streams).toEqual([]);
    expect(result.chapters).toEqual([]);
  });
});

// --- rawProbeOutputSchema ---

describe("rawProbeOutputSchema", () => {
  it("rejects missing format field", () => {
    expect(() => rawProbeOutputSchema.parse({})).toThrow();
  });

  it("rejects unknown codec_type", () => {
    const input = {
      format: rawFormat,
      streams: [{ ...videoStream, codec_type: "data" }],
      chapters: [],
    };
    expect(() => rawProbeOutputSchema.parse(input)).toThrow();
  });
});

// --- formatInfoSchema ---

describe("formatInfoSchema", () => {
  it("transforms snake_case to camelCase", () => {
    const result = formatInfoSchema.parse(rawFormat);
    expect(result.formatName).toBe("mov,mp4,m4a,3gp,3g2,mj2");
    expect(result.formatLongName).toBe("QuickTime / MOV");
    expect(result.nbStreams).toBe(2);
    expect(result.startTime).toBe(0);
  });

  it("parses duration/size/bitrate strings to numbers", () => {
    const result = formatInfoSchema.parse(rawFormat);
    expect(result.duration).toBe(5);
    expect(result.size).toBe(1234567);
    expect(result.bitrate).toBe(1975307);
  });

  it("defaults missing tags to empty object", () => {
    const input = { ...rawFormat, tags: undefined };
    const result = formatInfoSchema.parse(input);
    expect(result.tags).toEqual({});
  });
});

// --- videoStreamInfoSchema ---

describe("videoStreamInfoSchema", () => {
  it("transforms a video stream correctly", () => {
    const result = videoStreamInfoSchema.parse(videoStream);
    expect(result.type).toBe("video");
    expect(result.codec).toBe("h264");
    expect(result.codecLongName).toBe("H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10");
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.pixelFormat).toBe("yuv420p");
    expect(result.frameRate).toBe(30);
    expect(result.avgFrameRate).toBe(30);
  });

  it("transforms disposition snake_case to camelCase", () => {
    const result = videoStreamInfoSchema.parse(videoStream);
    expect(result.disposition.hearingImpaired).toBe(false);
    expect(result.disposition.visualImpaired).toBe(false);
    expect(result.disposition.attachedPic).toBe(false);
    expect(result.disposition.default).toBe(true);
  });

  it("extracts rotation from tags (older ffmpeg)", () => {
    const stream = { ...videoStream, tags: { rotate: "90" } };
    const result = videoStreamInfoSchema.parse(stream);
    expect(result.rotation).toBe(90);
  });

  it("extracts rotation from side_data_list (newer ffmpeg)", () => {
    const stream = {
      ...videoStream,
      side_data_list: [{ side_data_type: "Display Matrix", rotation: -90 }],
    };
    const result = videoStreamInfoSchema.parse(stream);
    expect(result.rotation).toBe(-90);
  });

  it("returns undefined rotation when none present", () => {
    const result = videoStreamInfoSchema.parse(videoStream);
    expect(result.rotation).toBeUndefined();
  });
});

// --- audioStreamInfoSchema ---

describe("audioStreamInfoSchema", () => {
  it("transforms an audio stream correctly", () => {
    const result = audioStreamInfoSchema.parse(audioStream);
    expect(result.type).toBe("audio");
    expect(result.codec).toBe("aac");
    expect(result.sampleRate).toBe(48000);
    expect(result.channels).toBe(2);
    expect(result.channelLayout).toBe("stereo");
    expect(result.sampleFormat).toBe("fltp");
  });

  it("defaults missing profile to empty string", () => {
    const stream = { ...audioStream, profile: undefined };
    const result = audioStreamInfoSchema.parse(stream);
    expect(result.profile).toBe("");
  });
});

// --- subtitleStreamInfoSchema ---

describe("subtitleStreamInfoSchema", () => {
  it("transforms a subtitle stream correctly", () => {
    const stream = {
      index: 2,
      codec_type: "subtitle" as const,
      codec_name: "subrip",
      codec_long_name: "SubRip subtitle",
      disposition: baseDisposition,
      tags: { language: "eng" },
    };
    const result = subtitleStreamInfoSchema.parse(stream);
    expect(result.type).toBe("subtitle");
    expect(result.codec).toBe("subrip");
    expect(result.tags).toEqual({ language: "eng" });
  });
});

// --- streamInfoSchema ---

describe("streamInfoSchema", () => {
  it("discriminates video streams", () => {
    const result = streamInfoSchema.parse(videoStream);
    expect(result.type).toBe("video");
  });

  it("discriminates audio streams", () => {
    const result = streamInfoSchema.parse(audioStream);
    expect(result.type).toBe("audio");
  });

  it("discriminates subtitle streams", () => {
    const stream = {
      index: 2,
      codec_type: "subtitle" as const,
      codec_name: "subrip",
      codec_long_name: "SubRip subtitle",
      disposition: baseDisposition,
      tags: {},
    };
    const result = streamInfoSchema.parse(stream);
    expect(result.type).toBe("subtitle");
  });
});

// --- streamDispositionSchema ---

describe("streamDispositionSchema", () => {
  it("coerces 0/1 integers to booleans", () => {
    const result = streamDispositionSchema.parse(baseDisposition);
    expect(result.default).toBe(true);
    expect(result.dub).toBe(false);
    expect(result.hearing_impaired).toBe(false);
  });
});

// --- chapterInfoSchema ---

describe("chapterInfoSchema", () => {
  it("transforms chapter fields", () => {
    const raw = {
      id: 1,
      start_time: "0.000000",
      end_time: "30.500000",
      tags: { title: "Intro" },
    };
    const result = chapterInfoSchema.parse(raw);
    expect(result.id).toBe(1);
    expect(result.startTime).toBe(0);
    expect(result.endTime).toBe(30.5);
    expect(result.tags).toEqual({ title: "Intro" });
  });
});

// --- Frame rate parsing ---

describe("frame rate parsing via videoStreamInfoSchema", () => {
  it("parses fractional frame rates (NTSC 29.97)", () => {
    const stream = { ...videoStream, r_frame_rate: "30000/1001", avg_frame_rate: "30000/1001" };
    const result = videoStreamInfoSchema.parse(stream);
    expect(result.frameRate).toBeCloseTo(29.97, 2);
  });

  it("handles zero denominator", () => {
    const stream = { ...videoStream, r_frame_rate: "0/0" };
    const result = videoStreamInfoSchema.parse(stream);
    expect(result.frameRate).toBe(0);
  });

  it("handles integer-only frame rate string", () => {
    const stream = { ...videoStream, r_frame_rate: "24" };
    const result = videoStreamInfoSchema.parse(stream);
    expect(result.frameRate).toBe(24);
  });

  it("handles 0/1 (no frame rate)", () => {
    const stream = { ...videoStream, r_frame_rate: "0/1" };
    const result = videoStreamInfoSchema.parse(stream);
    expect(result.frameRate).toBe(0);
  });
});

// --- Missing optional field defaults ---

describe("missing optional field defaults", () => {
  it("defaults missing format tags to empty object", () => {
    const input = { ...rawFormat };
    delete (input as Record<string, unknown>).tags;
    const result = formatInfoSchema.parse(input);
    expect(result.tags).toEqual({});
  });

  it("defaults missing video stream profile to empty string", () => {
    const stream = { ...videoStream };
    delete (stream as Record<string, unknown>).profile;
    const result = videoStreamInfoSchema.parse(stream);
    expect(result.profile).toBe("");
  });

  it("defaults missing audio channel_layout to empty string", () => {
    const stream = { ...audioStream };
    delete (stream as Record<string, unknown>).channel_layout;
    const result = audioStreamInfoSchema.parse(stream);
    expect(result.channelLayout).toBe("");
  });
});

// --- Invalid input rejection ---

describe("invalid input rejection", () => {
  it("rejects missing format field", () => {
    expect(() => rawProbeOutputSchema.parse({ streams: [], chapters: [] })).toThrow();
  });

  it("rejects unknown codec_type in stream", () => {
    expect(() =>
      rawProbeOutputSchema.parse({
        format: rawFormat,
        streams: [{ ...videoStream, codec_type: "attachment" }],
        chapters: [],
      }),
    ).toThrow();
  });
});

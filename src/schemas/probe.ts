import { z } from "zod";

// --- Stream Disposition ---

// ffprobe outputs disposition flags as integers (0/1), not booleans.
// z.coerce.boolean() converts 0 → false and 1 → true.
export const streamDispositionSchema = z.object({
  default: z.coerce.boolean(),
  dub: z.coerce.boolean(),
  original: z.coerce.boolean(),
  comment: z.coerce.boolean(),
  lyrics: z.coerce.boolean(),
  karaoke: z.coerce.boolean(),
  forced: z.coerce.boolean(),
  hearing_impaired: z.coerce.boolean(),
  visual_impaired: z.coerce.boolean(),
  attached_pic: z.coerce.boolean(),
});

// --- Streams ---

const baseStreamSchema = z.object({
  index: z.number(),
  codec_name: z.string(),
  codec_long_name: z.string(),
  profile: z.string().optional().default(""),
  disposition: streamDispositionSchema,
  tags: z.record(z.string(), z.string()).optional().default({}),
});

export const rawVideoStreamSchema = baseStreamSchema.extend({
  codec_type: z.literal("video"),
  width: z.number(),
  height: z.number(),
  display_aspect_ratio: z.string().optional().default("0:1"),
  sample_aspect_ratio: z.string().optional().default("1:1"),
  pix_fmt: z.string().optional().default("unknown"),
  color_space: z.string().optional(),
  color_range: z.string().optional(),
  color_transfer: z.string().optional(),
  color_primaries: z.string().optional(),
  r_frame_rate: z.string().optional().default("0/1"),
  avg_frame_rate: z.string().optional().default("0/1"),
  bit_rate: z.string().optional(),
  duration: z.string().optional(),
  nb_frames: z.string().optional(),
  field_order: z.string().optional(),
  bits_per_raw_sample: z.string().optional(),
  side_data_list: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const rawAudioStreamSchema = baseStreamSchema.extend({
  codec_type: z.literal("audio"),
  sample_rate: z.string().optional().default("0"),
  channels: z.number().optional().default(0),
  channel_layout: z.string().optional().default(""),
  sample_fmt: z.string().optional().default("unknown"),
  bit_rate: z.string().optional(),
  duration: z.string().optional(),
  bits_per_raw_sample: z.string().optional(),
});

export const rawSubtitleStreamSchema = baseStreamSchema.extend({
  codec_type: z.literal("subtitle"),
});

export const rawStreamSchema = z.discriminatedUnion("codec_type", [
  rawVideoStreamSchema,
  rawAudioStreamSchema,
  rawSubtitleStreamSchema,
]);

// --- Format ---

export const rawFormatSchema = z.object({
  filename: z.string(),
  format_name: z.string(),
  format_long_name: z.string(),
  duration: z.string().optional().default("0"),
  size: z.string().optional().default("0"),
  bit_rate: z.string().optional().default("0"),
  start_time: z.string().optional().default("0"),
  nb_streams: z.number(),
  tags: z.record(z.string(), z.string()).optional().default({}),
});

// --- Chapters ---

export const rawChapterSchema = z.object({
  id: z.number(),
  start_time: z.string(),
  end_time: z.string(),
  tags: z.record(z.string(), z.string()).optional().default({}),
});

// --- Raw ffprobe output ---

export const rawProbeOutputSchema = z.object({
  format: rawFormatSchema,
  streams: z.array(rawStreamSchema).default([]),
  chapters: z.array(rawChapterSchema).default([]),
});

// --- Transformed (public) schemas ---

export const streamDispositionPublicSchema = streamDispositionSchema.transform((d) => ({
  default: d.default,
  dub: d.dub,
  original: d.original,
  comment: d.comment,
  lyrics: d.lyrics,
  karaoke: d.karaoke,
  forced: d.forced,
  hearingImpaired: d.hearing_impaired,
  visualImpaired: d.visual_impaired,
  attachedPic: d.attached_pic,
}));

function parseFrameRate(rate: string): number {
  const parts = rate.split("/");
  if (parts.length === 2) {
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    return den === 0 ? 0 : num / den;
  }
  return Number(rate) || 0;
}

function parseRotation(
  tags?: Record<string, string>,
  sideDataList?: Array<Record<string, unknown>>,
): number | undefined {
  // Check tags first (older ffmpeg)
  const tagRotation = tags?.rotate;
  if (tagRotation !== undefined) return Number(tagRotation);
  // Check side_data_list (newer ffmpeg)
  if (sideDataList) {
    for (const sd of sideDataList) {
      if (sd.side_data_type === "Display Matrix" && typeof sd.rotation === "number") {
        return sd.rotation as number;
      }
    }
  }
  return undefined;
}

function transformDisposition(d: {
  default: boolean;
  dub: boolean;
  original: boolean;
  comment: boolean;
  lyrics: boolean;
  karaoke: boolean;
  forced: boolean;
  hearing_impaired: boolean;
  visual_impaired: boolean;
  attached_pic: boolean;
}) {
  return {
    default: d.default,
    dub: d.dub,
    original: d.original,
    comment: d.comment,
    lyrics: d.lyrics,
    karaoke: d.karaoke,
    forced: d.forced,
    hearingImpaired: d.hearing_impaired,
    visualImpaired: d.visual_impaired,
    attachedPic: d.attached_pic,
  };
}

export const videoStreamInfoSchema = rawVideoStreamSchema.transform((s) => ({
  type: "video" as const,
  index: s.index,
  codec: s.codec_name,
  codecLongName: s.codec_long_name,
  profile: s.profile ?? "",
  width: s.width,
  height: s.height,
  displayAspectRatio: s.display_aspect_ratio ?? "0:1",
  sampleAspectRatio: s.sample_aspect_ratio ?? "1:1",
  pixelFormat: s.pix_fmt ?? "unknown",
  colorSpace: s.color_space,
  colorRange: s.color_range,
  colorTransfer: s.color_transfer,
  colorPrimaries: s.color_primaries,
  frameRate: parseFrameRate(s.r_frame_rate ?? "0/1"),
  avgFrameRate: parseFrameRate(s.avg_frame_rate ?? "0/1"),
  bitrate: Number(s.bit_rate ?? "0"),
  duration: Number(s.duration ?? "0"),
  nbFrames: s.nb_frames !== undefined ? Number(s.nb_frames) : undefined,
  fieldOrder: s.field_order,
  bitsPerRawSample: s.bits_per_raw_sample !== undefined ? Number(s.bits_per_raw_sample) : undefined,
  disposition: transformDisposition(s.disposition),
  tags: s.tags ?? {},
  rotation: parseRotation(s.tags, s.side_data_list),
}));

export const audioStreamInfoSchema = rawAudioStreamSchema.transform((s) => ({
  type: "audio" as const,
  index: s.index,
  codec: s.codec_name,
  codecLongName: s.codec_long_name,
  profile: s.profile ?? "",
  sampleRate: Number(s.sample_rate ?? "0"),
  channels: s.channels ?? 0,
  channelLayout: s.channel_layout ?? "",
  sampleFormat: s.sample_fmt ?? "unknown",
  bitrate: Number(s.bit_rate ?? "0"),
  duration: Number(s.duration ?? "0"),
  bitsPerRawSample: s.bits_per_raw_sample !== undefined ? Number(s.bits_per_raw_sample) : undefined,
  disposition: transformDisposition(s.disposition),
  tags: s.tags ?? {},
}));

export const subtitleStreamInfoSchema = rawSubtitleStreamSchema.transform((s) => ({
  type: "subtitle" as const,
  index: s.index,
  codec: s.codec_name,
  codecLongName: s.codec_long_name,
  disposition: transformDisposition(s.disposition),
  tags: s.tags ?? {},
}));

export const streamInfoSchema = z
  .discriminatedUnion("codec_type", [
    rawVideoStreamSchema,
    rawAudioStreamSchema,
    rawSubtitleStreamSchema,
  ])
  .transform(
    (
      s,
    ):
      | ReturnType<typeof videoStreamInfoSchema.parse>
      | ReturnType<typeof audioStreamInfoSchema.parse>
      | ReturnType<typeof subtitleStreamInfoSchema.parse> => {
      switch (s.codec_type) {
        case "video":
          return videoStreamInfoSchema.parse(s);
        case "audio":
          return audioStreamInfoSchema.parse(s);
        case "subtitle":
          return subtitleStreamInfoSchema.parse(s);
      }
    },
  );

export const formatInfoSchema = rawFormatSchema.transform((f) => ({
  filename: f.filename,
  formatName: f.format_name,
  formatLongName: f.format_long_name,
  duration: Number(f.duration ?? "0"),
  size: Number(f.size ?? "0"),
  bitrate: Number(f.bit_rate ?? "0"),
  startTime: Number(f.start_time ?? "0"),
  nbStreams: f.nb_streams,
  tags: f.tags ?? {},
}));

export const chapterInfoSchema = rawChapterSchema.transform((c) => ({
  id: c.id,
  startTime: Number(c.start_time),
  endTime: Number(c.end_time),
  tags: c.tags ?? {},
}));

export const probeResultSchema = rawProbeOutputSchema.transform((raw) => ({
  format: formatInfoSchema.parse(raw.format),
  streams: (raw.streams ?? []).map((s) => streamInfoSchema.parse(s)),
  chapters: (raw.chapters ?? []).map((c) => chapterInfoSchema.parse(c)),
}));

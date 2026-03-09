import type { z } from "zod";
import type {
  audioStreamInfoSchema,
  chapterInfoSchema,
  formatInfoSchema,
  probeResultSchema,
  streamDispositionSchema,
  streamInfoSchema,
  subtitleStreamInfoSchema,
  videoStreamInfoSchema,
} from "../schemas/probe.ts";

/** Full probe result from ffprobe */
export type ProbeResult = z.infer<typeof probeResultSchema>;

/** Container/format metadata */
export type FormatInfo = z.infer<typeof formatInfoSchema>;

/** Video stream metadata */
export type VideoStreamInfo = z.infer<typeof videoStreamInfoSchema>;

/** Audio stream metadata */
export type AudioStreamInfo = z.infer<typeof audioStreamInfoSchema>;

/** Subtitle stream metadata */
export type SubtitleStreamInfo = z.infer<typeof subtitleStreamInfoSchema>;

/** Discriminated union of all stream types */
export type StreamInfo = z.infer<typeof streamInfoSchema>;

/** Stream disposition flags */
export type StreamDisposition = z.infer<typeof streamDispositionSchema>;

/** Chapter info from container */
export type ChapterInfo = z.infer<typeof chapterInfoSchema>;

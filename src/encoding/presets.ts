import type { ExportPreset, PresetConfig } from "../types/codecs.ts";

/** YouTube export presets */
export const YOUTUBE_PRESETS: Record<
  "youtube_hd" | "youtube_4k" | "youtube_shorts" | "youtube_draft",
  PresetConfig
> = {
  youtube_hd: {
    video: {
      codec: "libx264",
      crf: 18,
      preset: "slow",
      profile: "high",
      level: "4.1",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "192k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  youtube_4k: {
    video: {
      codec: "libx264",
      crf: 16,
      preset: "slow",
      profile: "high",
      level: "5.1",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "320k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  youtube_shorts: {
    video: {
      codec: "libx264",
      crf: 20,
      preset: "medium",
      profile: "high",
      level: "4.1",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "192k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  youtube_draft: {
    video: {
      codec: "libx264",
      crf: 28,
      preset: "ultrafast",
      profile: "main",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
};

/** Social media presets */
export const SOCIAL_PRESETS: Record<"twitter" | "instagram" | "tiktok", PresetConfig> = {
  twitter: {
    video: {
      codec: "libx264",
      crf: 23,
      preset: "medium",
      profile: "high",
      level: "4.1",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  instagram: {
    video: {
      codec: "libx264",
      crf: 22,
      preset: "medium",
      profile: "high",
      level: "4.0",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  tiktok: {
    video: {
      codec: "libx264",
      crf: 22,
      preset: "medium",
      profile: "high",
      level: "4.1",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
};

/** Web delivery presets */
export const WEB_PRESETS: Record<"web_720p" | "web_1080p", PresetConfig> = {
  web_720p: {
    video: {
      codec: "libx264",
      crf: 23,
      preset: "medium",
      profile: "main",
      level: "3.1",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 44100, channels: 2 },
    format: "mp4",
    faststart: true,
  },
  web_1080p: {
    video: {
      codec: "libx264",
      crf: 22,
      preset: "medium",
      profile: "high",
      level: "4.1",
      pixelFormat: "yuv420p",
    },
    audio: { codec: "aac", bitrate: "128k", sampleRate: 48000, channels: 2 },
    format: "mp4",
    faststart: true,
  },
};

/** Archive preset */
export const ARCHIVE_PRESET: PresetConfig = {
  video: {
    codec: "libx264",
    crf: 14,
    preset: "veryslow",
    profile: "high",
    level: "5.1",
    pixelFormat: "yuv420p",
  },
  audio: { codec: "flac" },
  format: "mkv",
  faststart: false,
};

const ALL_PRESETS: Record<ExportPreset, PresetConfig> = {
  ...YOUTUBE_PRESETS,
  ...SOCIAL_PRESETS,
  ...WEB_PRESETS,
  archive: ARCHIVE_PRESET,
};

/**
 * Look up a preset config by name.
 * Returns undefined if not found.
 */
export function getPreset(name: ExportPreset): PresetConfig | undefined {
  return ALL_PRESETS[name];
}

/**
 * Get all preset names.
 */
export function getPresetNames(): ExportPreset[] {
  return Object.keys(ALL_PRESETS) as ExportPreset[];
}

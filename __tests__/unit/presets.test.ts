import { describe, expect, it } from "vitest";
import {
  ARCHIVE_PRESET,
  getPreset,
  getPresetNames,
  SOCIAL_PRESETS,
  WEB_PRESETS,
  YOUTUBE_PRESETS,
} from "../../src/encoding/presets.ts";
import type { ExportPreset } from "../../src/types/codecs.ts";

const ALL_PRESET_NAMES: ExportPreset[] = [
  "youtube_hd",
  "youtube_4k",
  "youtube_shorts",
  "youtube_draft",
  "twitter",
  "instagram",
  "tiktok",
  "web_720p",
  "web_1080p",
  "archive",
];

describe("getPreset", () => {
  it("resolves every ExportPreset name", () => {
    for (const name of ALL_PRESET_NAMES) {
      const preset = getPreset(name);
      expect(preset, `Expected preset "${name}" to be defined`).toBeDefined();
    }
  });

  it("returns undefined for unknown preset", () => {
    expect(getPreset("nonexistent" as ExportPreset)).toBeUndefined();
  });
});

describe("getPresetNames", () => {
  it("returns all 10 preset names", () => {
    const names = getPresetNames();
    expect(names).toHaveLength(10);
    for (const name of ALL_PRESET_NAMES) {
      expect(names).toContain(name);
    }
  });
});

describe("every preset has required fields", () => {
  it.each(ALL_PRESET_NAMES)("%s has video, audio, format, and faststart", (name) => {
    const preset = getPreset(name);
    expect(preset).toBeDefined();
    if (preset === undefined) return;
    expect(preset.video).toBeDefined();
    expect(preset.video.codec).toBeTruthy();
    expect(preset.audio).toBeDefined();
    expect(preset.audio.codec).toBeTruthy();
    expect(preset.format).toBeTruthy();
    expect(typeof preset.faststart).toBe("boolean");
  });
});

describe("every preset video has pixelFormat yuv420p", () => {
  it.each(ALL_PRESET_NAMES)("%s has pixelFormat yuv420p", (name) => {
    const preset = getPreset(name);
    expect(preset?.video.pixelFormat).toBe("yuv420p");
  });
});

describe("YouTube presets", () => {
  it("all YouTube presets use sampleRate 48000", () => {
    for (const preset of Object.values(YOUTUBE_PRESETS)) {
      expect(preset.audio.sampleRate).toBe(48000);
    }
  });

  it("all YouTube presets use format mp4", () => {
    for (const preset of Object.values(YOUTUBE_PRESETS)) {
      expect(preset.format).toBe("mp4");
    }
  });

  it("all YouTube presets have faststart true", () => {
    for (const preset of Object.values(YOUTUBE_PRESETS)) {
      expect(preset.faststart).toBe(true);
    }
  });
});

describe("ARCHIVE_PRESET", () => {
  it("uses format mkv", () => {
    expect(ARCHIVE_PRESET.format).toBe("mkv");
  });

  it("uses flac audio codec", () => {
    expect(ARCHIVE_PRESET.audio.codec).toBe("flac");
  });

  it("has faststart false", () => {
    expect(ARCHIVE_PRESET.faststart).toBe(false);
  });

  it("uses low crf for high quality", () => {
    expect(ARCHIVE_PRESET.video.crf).toBe(14);
  });
});

describe("SOCIAL_PRESETS", () => {
  it("all social presets use format mp4", () => {
    for (const preset of Object.values(SOCIAL_PRESETS)) {
      expect(preset.format).toBe("mp4");
    }
  });

  it("all social presets have faststart true", () => {
    for (const preset of Object.values(SOCIAL_PRESETS)) {
      expect(preset.faststart).toBe(true);
    }
  });
});

describe("WEB_PRESETS", () => {
  it("web_720p uses profile main and level 3.1", () => {
    expect(WEB_PRESETS.web_720p.video.profile).toBe("main");
    expect(WEB_PRESETS.web_720p.video.level).toBe("3.1");
  });

  it("web_1080p uses profile high and level 4.1", () => {
    expect(WEB_PRESETS.web_1080p.video.profile).toBe("high");
    expect(WEB_PRESETS.web_1080p.video.level).toBe("4.1");
  });
});

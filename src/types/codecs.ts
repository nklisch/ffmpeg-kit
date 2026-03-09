export type VideoCodec =
  // H.264/AVC
  | "libx264"
  | "libx264rgb"
  | "libopenh264"
  | "h264_nvenc"
  | "h264_amf"
  | "h264_vaapi"
  | "h264_qsv"
  | "h264_vulkan"
  // H.265/HEVC
  | "libx265"
  | "hevc_nvenc"
  | "hevc_amf"
  | "hevc_vaapi"
  | "hevc_qsv"
  | "hevc_vulkan"
  // AV1
  | "libaom-av1"
  | "libsvtav1"
  | "librav1e"
  | "av1_nvenc"
  | "av1_amf"
  | "av1_vaapi"
  | "av1_qsv"
  // VP8/VP9
  | "libvpx"
  | "libvpx-vp9"
  | "vp8_vaapi"
  | "vp9_vaapi"
  | "vp9_qsv"
  // VVC/H.266
  | "libvvenc"
  // Others
  | "prores"
  | "prores_ks"
  | "dnxhd"
  | "mjpeg"
  | "gif"
  | "copy";

export type AudioCodec =
  | "aac"
  | "libfdk_aac"
  | "libmp3lame"
  | "libopus"
  | "libvorbis"
  | "flac"
  | "alac"
  | "ac3"
  | "eac3"
  | "pcm_s16le"
  | "pcm_s24le"
  | "pcm_s32le"
  | "pcm_f32le"
  | "copy";

export type PixelFormat =
  | "yuv420p"
  | "yuv422p"
  | "yuv444p"
  | "yuv420p10le"
  | "yuv422p10le"
  | "yuv444p10le"
  | "yuv420p12le"
  | "nv12"
  | "nv21"
  | "rgb24"
  | "bgr24"
  | "rgba"
  | "bgra"
  | "gray"
  | "gray10le"
  | "gbrp"
  | "gbrp10le";

export type ContainerFormat = "mp4" | "mkv" | "webm" | "mov" | "avi" | "ts" | "flv";

export type QualityTier = "premium" | "standard" | "economy";

export type EncodingPreset =
  // libx264/libx265
  | "ultrafast"
  | "superfast"
  | "veryfast"
  | "faster"
  | "fast"
  | "medium"
  | "slow"
  | "slower"
  | "veryslow"
  | "placebo"
  // NVENC
  | "p1"
  | "p2"
  | "p3"
  | "p4"
  | "p5"
  | "p6"
  | "p7"
  // SVT-AV1
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13";

export type RateControlMode = "crf" | "cq" | "cbr" | "vbr" | "abr" | "constrained-quality";

export type HwAccelMode = "auto" | "nvidia" | "vaapi" | "qsv" | "vulkan" | "cpu";

export interface EncoderConfig {
  codec: VideoCodec;
  crf?: number;
  cq?: number;
  qp?: number;
  videoBitrate?: string;
  maxBitrate?: string;
  bufSize?: string;
  preset?: EncodingPreset;
  profile?: string;
  level?: string;
  pixelFormat?: PixelFormat;
  tune?: string;
  codecParams?: string;
  gopSize?: number;
  bFrames?: number;
  twoPass?: boolean;
  pass?: 1 | 2;
  passLogFile?: string;
}

export interface AudioEncoderConfig {
  codec: AudioCodec;
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
}

export interface PresetConfig {
  video: EncoderConfig;
  audio: AudioEncoderConfig;
  format: ContainerFormat;
  faststart: boolean;
  metadata?: Record<string, string>;
}

export type ExportPreset =
  | "youtube_hd"
  | "youtube_4k"
  | "youtube_shorts"
  | "youtube_draft"
  | "twitter"
  | "instagram"
  | "tiktok"
  | "web_720p"
  | "web_1080p"
  | "archive";

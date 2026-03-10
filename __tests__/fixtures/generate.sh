#!/usr/bin/env bash
# Generate all test fixtures for ffmpeg-kit.
# Run once, commit the outputs. Requires ffmpeg installed.
# Total size target: < 5 MB.

set -euo pipefail
cd "$(dirname "$0")"

echo "Generating test fixtures..."

# video-h264.mp4 — primary video test input
# 1920x1080, 5s, 30fps, H.264 + AAC stereo
ffmpeg -y -f lavfi -i "testsrc2=size=1920x1080:rate=30:duration=5" \
  -f lavfi -i "sine=frequency=440:duration=5:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -crf 35 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  video-h264.mp4

# video-short.mp4 — fast tests
# 640x360, 2s, 30fps, H.264 + AAC stereo
ffmpeg -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" \
  -f lavfi -i "sine=frequency=440:duration=2:sample_rate=48000" \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  video-short.mp4

# audio-speech.wav — audio processing tests
# 48kHz, mono, 3s, sine wave
ffmpeg -y -f lavfi -i "sine=frequency=300:duration=3:sample_rate=48000" \
  -c:a pcm_s16le -ac 1 \
  audio-speech.wav

# image-1080p.jpg — image for Ken Burns, overlay, image-to-video tests
# 1920x1080 JPEG
ffmpeg -y -f lavfi -i "testsrc2=size=1920x1080:rate=1:duration=1" \
  -frames:v 1 -q:v 2 \
  image-1080p.jpg

# video-no-audio.mp4 — concat missing-audio test
# 640x360, 2s, 30fps, H.264, NO audio
ffmpeg -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -an \
  video-no-audio.mp4

# audio-music.wav — mixing/ducking tests
# 48kHz, stereo, 5s, dual-tone (300Hz + 500Hz for richer signal)
ffmpeg -y -f lavfi -i "sine=frequency=300:duration=5:sample_rate=48000" \
  -f lavfi -i "sine=frequency=500:duration=5:sample_rate=48000" \
  -filter_complex "[0:a][1:a]amerge=inputs=2[out]" \
  -map "[out]" -c:a pcm_s16le \
  audio-music.wav

# audio-silence.wav — silence detection tests
# 48kHz, mono, 5s: 1.5s tone, 2s silence, 1.5s tone
ffmpeg -y -f lavfi -i "sine=frequency=440:duration=1.5:sample_rate=48000" \
  -f lavfi -i "anullsrc=r=48000:cl=mono" \
  -f lavfi -i "sine=frequency=440:duration=1.5:sample_rate=48000" \
  -filter_complex "[0:a]apad=pad_dur=0[a0];[1:a]atrim=duration=2[a1];[2:a]apad=pad_dur=0[a2];[a0][a1][a2]concat=n=3:v=0:a=1[out]" \
  -map "[out]" -c:a pcm_s16le -t 5 \
  audio-silence.wav

# image-small.png — 200x200 PNG with alpha channel (for overlay/watermark tests)
ffmpeg -y -f lavfi -i "color=c=red:size=200x200:duration=1,format=rgba" \
  -frames:v 1 -update 1 image-small.png

# subtitle.srt — SRT subtitle file for subtitle tests (3 entries, 0-5 seconds)
cat > subtitle.srt << 'SRTEOF'
1
00:00:00,500 --> 00:00:02,000
First subtitle line

2
00:00:02,500 --> 00:00:04,000
Second subtitle line

3
00:00:04,000 --> 00:00:05,000
Third subtitle line
SRTEOF

# chapters.mkv — MKV with chapters for probe chapter test
# 640x360, 5s, 2 chapters (0-2.5s "Chapter 1", 2.5-5s "Chapter 2")
cat > /tmp/ffmpeg-chapters-meta.txt << 'METAEOF'
;FFMETADATA1

[CHAPTER]
TIMEBASE=1/1000
START=0
END=2500
title=Chapter 1

[CHAPTER]
TIMEBASE=1/1000
START=2500
END=5000
title=Chapter 2
METAEOF

ffmpeg -y -f lavfi -i "testsrc2=size=640x360:rate=30:duration=5" \
  -f lavfi -i "sine=frequency=440:duration=5:sample_rate=48000" \
  -i /tmp/ffmpeg-chapters-meta.txt \
  -map 0:v -map 1:a -map_metadata 2 \
  -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 \
  chapters.mkv

rm -f /tmp/ffmpeg-chapters-meta.txt

echo "Done. Generated fixtures:"
ls -lh *.mp4 *.mkv *.wav *.jpg *.png *.srt 2>/dev/null || true

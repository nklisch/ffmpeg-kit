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

echo "Done. Generated fixtures:"
ls -lh *.mp4 *.wav *.jpg 2>/dev/null || true

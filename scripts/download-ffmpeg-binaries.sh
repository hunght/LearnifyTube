#!/bin/bash
# Script to copy FFmpeg binary from ffmpeg-static npm package to assets/bin
# for bundling with the app. The binary will be included in the app bundle via extraResource

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_BIN_DIR="$PROJECT_ROOT/assets/bin"

# Create assets/bin directory if it doesn't exist
mkdir -p "$ASSETS_BIN_DIR"

echo "📦 Copying FFmpeg binary from ffmpeg-static package..."

# Get the path to the ffmpeg binary from ffmpeg-static
# Use node to resolve the path (ffmpeg-static exports the path)
FFMPEG_PATH=$(node -e "console.log(require('ffmpeg-static'))" 2>/dev/null || echo "")

if [ -z "$FFMPEG_PATH" ] || [ ! -f "$FFMPEG_PATH" ]; then
  echo "❌ Error: Could not find ffmpeg binary in ffmpeg-static package"
  echo "   The package may not have downloaded the binary yet."
  echo "   Try running: npm install ffmpeg-static"
  exit 1
fi

# Determine the target filename based on platform
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
  TARGET_NAME="ffmpeg.exe"
else
  TARGET_NAME="ffmpeg"
fi

TARGET_PATH="$ASSETS_BIN_DIR/$TARGET_NAME"

# Copy the binary
echo "📋 Copying: $FFMPEG_PATH -> $TARGET_PATH"
cp "$FFMPEG_PATH" "$TARGET_PATH"

# Make executable (for Unix-like systems)
if [[ "$OSTYPE" != "msys" ]] && [[ "$OSTYPE" != "cygwin" ]] && [[ "$OSTYPE" != "win32" ]]; then
  chmod +x "$TARGET_PATH"
fi

echo ""
echo "✅ FFmpeg binary copied to: $ASSETS_BIN_DIR"
echo "   This will be bundled with the app during build."

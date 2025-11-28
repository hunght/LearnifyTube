#!/bin/bash
# Script to download FFmpeg static binaries for bundling with the app
# These binaries will be included in the app bundle via extraResource

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_BIN_DIR="$PROJECT_ROOT/assets/bin"

# Create assets/bin directory if it doesn't exist
mkdir -p "$ASSETS_BIN_DIR"

echo "📦 Downloading FFmpeg binaries for bundling..."

# Function to download and extract FFmpeg for a platform
download_ffmpeg() {
  local platform=$1
  local arch=$2
  local url=$3
  local output_file=$4
  local extract_cmd=$5

  echo ""
  echo "🔽 Downloading for $platform ($arch)..."
  echo "   URL: $url"
  
  cd "$ASSETS_BIN_DIR"
  
  # Download
  if command -v curl &> /dev/null; then
    curl -L -o "$output_file" "$url"
  elif command -v wget &> /dev/null; then
    wget -O "$output_file" "$url"
  else
    echo "❌ Error: Neither curl nor wget found. Please install one of them."
    exit 1
  fi

  # Extract if needed
  if [ -n "$extract_cmd" ]; then
    echo "📂 Extracting..."
    eval "$extract_cmd"
    rm -f "$output_file"
  fi

  # Make executable (for Unix-like systems)
  if [ "$platform" != "win32" ]; then
    chmod +x ffmpeg 2>/dev/null || true
  fi

  echo "✅ Done for $platform ($arch)"
}

# Detect current platform
CURRENT_PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
CURRENT_ARCH=$(uname -m)

# Map architecture
if [ "$CURRENT_ARCH" = "arm64" ] || [ "$CURRENT_ARCH" = "aarch64" ]; then
  ARCH="arm64"
elif [ "$CURRENT_ARCH" = "x86_64" ] || [ "$CURRENT_ARCH" = "amd64" ]; then
  ARCH="x86_64"
else
  ARCH="$CURRENT_ARCH"
fi

# Download for current platform
if [ "$CURRENT_PLATFORM" = "darwin" ]; then
  # macOS - use evermeet.cx
  URL="https://evermeet.cx/ffmpeg/get/ffmpeg-${ARCH}.zip"
  download_ffmpeg "macOS" "$ARCH" "$URL" "ffmpeg.zip" "unzip -q ffmpeg.zip && rm -f ffmpeg.zip"
  
elif [ "$CURRENT_PLATFORM" = "linux" ]; then
  # Linux - use John Van Sickle's static builds
  if [ "$ARCH" = "arm64" ]; then
    LINUX_ARCH="arm64"
  else
    LINUX_ARCH="amd64"
  fi
  URL="https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-${LINUX_ARCH}-static.tar.xz"
  download_ffmpeg "Linux" "$LINUX_ARCH" "$URL" "ffmpeg.tar.xz" "tar -xf ffmpeg.tar.xz && mv ffmpeg-git-${LINUX_ARCH}-static/ffmpeg . && rm -rf ffmpeg-git-${LINUX_ARCH}-static ffmpeg.tar.xz"
  
elif [ "$CURRENT_PLATFORM" = "mingw" ] || [ "$CURRENT_PLATFORM" = "msys" ] || [ "$CURRENT_PLATFORM" = "cygwin" ]; then
  # Windows - use BtbN FFmpeg builds
  URL="https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip"
  download_ffmpeg "Windows" "x64" "$URL" "ffmpeg.zip" "unzip -q ffmpeg.zip && mv ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe . && rm -rf ffmpeg-master-latest-win64-gpl ffmpeg.zip"
else
  echo "❌ Unsupported platform: $CURRENT_PLATFORM"
  echo "   Please download FFmpeg manually and place it in assets/bin/"
  exit 1
fi

echo ""
echo "✅ FFmpeg binary downloaded to: $ASSETS_BIN_DIR"
echo "   This will be bundled with the app during build."


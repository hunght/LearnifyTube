# FFmpeg Binaries for Bundling

This directory contains FFmpeg static binaries that will be bundled with the app.

## Quick Start

Run the download script to get FFmpeg for your platform:

```bash
./scripts/download-ffmpeg-binaries.sh
```

This will download the appropriate FFmpeg binary for your current platform and place it in this directory.

## Manual Download

If you prefer to download manually:

### macOS
- **ARM64 (Apple Silicon)**: https://evermeet.cx/ffmpeg/get/ffmpeg-arm64.zip
- **x86_64 (Intel)**: https://evermeet.cx/ffmpeg/get/ffmpeg-x86_64.zip
- Extract and place `ffmpeg` in this directory

### Windows
- Download: https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip
- Extract and copy `ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe` to this directory

### Linux
- **AMD64**: https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz
- **ARM64**: https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-arm64-static.tar.xz
- Extract and copy `ffmpeg` from `ffmpeg-git-*-static/` to this directory

## How It Works

1. **Development**: The app looks for FFmpeg in `assets/bin/ffmpeg` (or `ffmpeg.exe` on Windows)
2. **Production**: After build, FFmpeg is bundled in `resources/bin/` and accessed via `process.resourcesPath`
3. **Fallback**: If bundled FFmpeg is not found, the app will try to download it to `userData/bin/`

## File Structure

```
assets/bin/
├── README.md (this file)
├── ffmpeg (macOS/Linux) or ffmpeg.exe (Windows)
└── .gitignore (binaries are gitignored)
```

## Notes

- Binaries are **gitignored** (they're large and platform-specific)
- Each developer should download binaries for their platform
- CI/CD should download binaries for all target platforms before building
- The bundled FFmpeg will be used first, with download as fallback


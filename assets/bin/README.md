# FFmpeg Binaries for Bundling

This directory contains FFmpeg static binaries that will be bundled with the app.

## Automatic Setup

The app uses the `ffmpeg-static` npm package. The FFmpeg binary is **automatically copied** to this directory during the build process (via `prePackage` hook in `forge.config.ts`).

No manual steps required! Just run:
```bash
npm install  # Installs ffmpeg-static
npm run make # Builds app (automatically copies FFmpeg to assets/bin)
```

## How It Works

1. **Development**: The app looks for FFmpeg in this order:
   - `assets/bin/ffmpeg` (bundled version, copied during build)
   - `ffmpeg-static` npm package (from node_modules)
   - `userData/bin/ffmpeg` (downloaded fallback)

2. **Production**: After build, FFmpeg is bundled in `resources/bin/` and accessed via `process.resourcesPath`

3. **Build Process**: The `prePackage` hook automatically copies the binary from `node_modules/ffmpeg-static` to `assets/bin/` before bundling

## File Structure

```
assets/bin/
├── README.md (this file)
├── ffmpeg (macOS/Linux) or ffmpeg.exe (Windows) - auto-generated during build
└── .gitignore (binaries are gitignored)
```

## Notes

- Binaries are **gitignored** (they're large and platform-specific)
- The `ffmpeg-static` package automatically downloads the correct binary for your platform during `npm install`
- The binary is automatically copied to `assets/bin/` during the build process
- No manual download script needed!

## Source

The FFmpeg binaries come from the [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) npm package, which provides:
- Static FFmpeg binaries for macOS (Intel & Apple Silicon)
- Static FFmpeg binaries for Linux (x64, ARM, ARM64)
- Static FFmpeg binaries for Windows (x64, x86)

# Video Playback Issue (Previously Thought to be Folder Permission)

## Problem Description

**UPDATE (v1.0.41)**: The root cause has been identified as a **video codec compatibility issue**, not a folder permission problem. The issue manifests when attempting to play MP4 files that use H.265/HEVC codec, which Chromium (Electron's rendering engine) does not support. WebM files work correctly because they use VP8/VP9 codecs that Chromium supports natively.

The original symptoms suggested a folder permission issue because:
- The error message was generic: "Video file not found"
- It occurred after changing download folders
- Permission checks appeared to pass

However, investigation revealed:
- **MP4 files fail to play** (especially those with H.265/HEVC codec)
- **WebM files play successfully**
- Folder permissions are actually working correctly

## Symptoms

1. **User changes download folder**: User navigates to Settings and selects a new folder (e.g., `/Users/owner/Desktop`) as the download location.

2. **Videos download successfully**: Videos are downloaded to the new folder location without errors.

3. **Playback fails for MP4 files**: When attempting to play a downloaded MP4 video, the app displays:
   - Error message: "Video file not found"
   - Description: "The video file could not be loaded. It may have been deleted or moved."
   - Error code: `MEDIA_ERR_DECODE` or `MEDIA_ERR_SRC_NOT_SUPPORTED`

4. **WebM files play successfully**: Videos in WebM format play without issues.

5. **Permission check appears successful**: The app's permission check (`fs.promises.access`) reports that the directory is readable, confirming macOS has granted access.

## Root Cause

The issue is **codec compatibility**, not folder permissions:

- **MP4 with H.265/HEVC codec**: Chromium does not support H.265/HEVC codec in MP4 containers. YouTube often provides videos in this format, especially for higher quality streams.
- **MP4 with H.264/AVC1 codec**: These work fine with Chromium.
- **WebM format**: Always works because WebM uses VP8/VP9 codecs that Chromium supports natively.

## When It Occurs

- When attempting to play MP4 files downloaded from YouTube
- More common with higher quality videos (which often use H.265/HEVC)
- Occurs regardless of download folder location (not actually a permission issue)
- WebM files work regardless of folder location

## User Impact

- Users cannot play MP4 videos (especially H.265/HEVC encoded)
- Users can play WebM videos successfully
- Users may need to re-download videos in a compatible format
- The issue is format-dependent, not location-dependent

## Technical Context

### Original Investigation (Permission-Focused)

- The app uses Electron's `dialog.showOpenDialog` to request folder access
- Files are accessed via a custom `local-file://` protocol handler
- Permission checks use Node.js `fs.promises.access` with `R_OK` flag
- Enhanced logging was added to trace permission flow (v1.0.39)

### Actual Root Cause (Codec-Focused)

- Chromium's HTML5 video element has limited codec support
- H.265/HEVC requires hardware acceleration or proprietary codecs not available in Chromium
- YouTube's default format selection may choose H.265/HEVC for quality/bandwidth reasons
- The custom `local-file://` protocol handler correctly serves files, but Chromium cannot decode them

## Fixes Attempted

### v1.0.39 - Enhanced Logging
- Added comprehensive logging for folder permission flow
- Added logging in protocol handler for file access
- Added logging in VideoPlayer component for playback errors
- **Result**: Logs revealed the issue was codec-related, not permission-related

### v1.0.41 - Format Preference Fix
- Modified download worker to prefer Chromium-compatible formats:
  - First choice: WebM (always compatible)
  - Second choice: H.264/AVC1 MP4 (Chromium-compatible)
  - Fallback: Best available format
- Enhanced error logging to identify codec issues:
  - Logs file format (MP4 vs WebM)
  - Shows MEDIA_ERR code names
  - Checks `canPlayType` for codec support
- **Expected Result**: New downloads should prefer WebM or H.264-compatible MP4

## Logs Observed

When the issue occurs, logs show:
- `[preferences] Directory is readable` - permission check passes ✅
- `[preferences] Directory already accessible` - no prompt needed ✅
- `[protocol] Serving MP4 file` - file is being served correctly ✅
- `[VideoPlayer] video playback error` with:
  - `errorCodeName: "MEDIA_ERR_DECODE"` or `"MEDIA_ERR_SRC_NOT_SUPPORTED"`
  - `fileFormat: "mp4"`
  - `possibleIssue: "MP4 codec may not be supported (e.g., H.265/HEVC)"`
  - `canPlayTypeMp4: ""` (empty = not supported)

## Environment

- Platform: macOS (but issue is codec-related, not platform-specific)
- App: LearnifyTube (Electron-based, uses Chromium)
- Chromium version: Limited codec support (no H.265/HEVC)
- YouTube: Often provides H.265/HEVC in MP4 containers

## Current Status

- **v1.0.41**: Format preference fix deployed to prefer WebM/H.264 MP4
- **Expected**: New downloads should work correctly
- **Existing files**: H.265/HEVC MP4 files will still fail, but errors are now clearer
- **Monitoring**: Enhanced logging will help identify any remaining codec issues





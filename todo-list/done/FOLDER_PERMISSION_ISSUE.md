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

### v1.0.43 - Single-File Format Preference
- **Issue Discovered**: App was downloading two separate files (video-only and audio-only) instead of a single merged file
- **Root Cause**: Format string prioritized `bestvideo+bestaudio` which requires merging
- **Fix**: Reordered format priority to prefer single-file formats first:
  - `best[height<=1080][ext=webm]` - Single WebM file (video+audio combined)
  - `best[height<=1080][ext=mp4][vcodec^=avc1]` - Single H.264 MP4 file
  - Separate streams only as fallback
- **Result**: Downloads now produce single merged files instead of multiple separate files

### v1.0.45 - Aggressive WebM Preference + Comprehensive Diagnostics
- **Issue**: MP4 files still being downloaded and failing on company MacBooks
- **Root Cause Unknown**: Need to identify if it's H.265 codec, file corruption, or browser issue
- **Fixes Applied**:
  1. **Aggressive WebM Preference**: Format string now tries WebM at 1080p, 720p, and 480p before accepting MP4
  2. **Codec Detection**: Extracts and logs actual codec (H.264 vs H.265) from yt-dlp output
  3. **Comprehensive Error Diagnostics**: Logs full video element state, browser capabilities, and specific error diagnosis
  4. **Format Selection Logging**: Logs which format was selected and why, with codec compatibility warnings
- **Expected Result**: Logs will reveal root cause when tested on company MacBook

### v1.0.46 - CRITICAL: Missing ffmpeg Root Cause Identified
- **Issue Discovered**: Downloads result in incomplete files (audio-only or video-only)
- **Root Cause**: **ffmpeg is not installed** on the system
- **What Happens**:
  1. yt-dlp selects format requiring merging (e.g., `303+251` = separate video+audio streams)
  2. yt-dlp attempts to merge using ffmpeg
  3. **ffmpeg is missing** → merge fails
  4. Only one file is saved (usually audio file like `.f251.webm`)
  5. The other stream (video) is lost
  6. Result: Incomplete download (audio-only file, ~12MB for a 17-minute video)
- **Why WebM-first didn't work**:
  - No single-file WebM available for some videos
  - Falls back to `bestvideo[height<=1080][ext=webm]+bestaudio[ext=webm]` (requires merging)
  - Without ffmpeg, merge fails and only one stream is saved
- **Fixes Applied**:
  1. **Critical Error Detection**: Detects "ffmpeg is not installed" warning and logs as critical error
  2. **Unmerged File Detection**: Detects format code pattern (`.f251.`, `.f303.`) indicating incomplete downloads
  3. **Enhanced Completion Logging**: Warns when only one stream was saved
- **Solution Planned**: Bundle ffmpeg binary with the app (similar to yt-dlp)
  - Download ffmpeg static builds for each platform
  - Use bundled ffmpeg for merging video+audio streams
  - Enable future features: video optimization, format conversion, compression

## Logs Observed

### Original Issue (Codec/Format):
When the issue occurs, logs show:
- `[preferences] Directory is readable` - permission check passes ✅
- `[preferences] Directory already accessible` - no prompt needed ✅
- `[protocol] Serving MP4 file` - file is being served correctly ✅
- `[VideoPlayer] video playback error` with:
  - `errorCodeName: "MEDIA_ERR_DECODE"` or `"MEDIA_ERR_SRC_NOT_SUPPORTED"`
  - `fileFormat: "mp4"`
  - `possibleIssue: "MP4 codec may not be supported (e.g., H.265/HEVC)"`
  - `canPlayTypeMp4: ""` (empty = not supported)

### Critical Issue (Missing ffmpeg - v1.0.46+):
When ffmpeg is missing, logs show:
- `[download-worker] yt-dlp downloading formats` with `formatIds: '303+251'` and `isMerging: true`
- `[download-worker] yt-dlp stderr output` with:
  - `WARNING: You have requested merging of multiple formats but ffmpeg is not installed. The formats won't be merged`
- `[download-worker] CRITICAL: ffmpeg is not installed - merging will fail` (v1.0.46+)
- `[download-worker] Download completed successfully` with:
  - `finalPath: '/path/to/file.f251.webm'` (format code indicates unmerged file)
  - `fileSize: '12.69 MB'` (suspiciously small = audio-only)
- `[download-worker] CRITICAL: Unmerged file detected - merge failed` (v1.0.46+)
  - `note: "File has format code (.fXXX.) indicating it's an unmerged stream"`
  - `impact: "Download is incomplete - only one stream was saved"`

## Environment

- Platform: macOS (but issue is codec-related, not platform-specific)
- App: LearnifyTube (Electron-based, uses Chromium)
- Chromium version: Limited codec support (no H.265/HEVC)
- YouTube: Often provides H.265/HEVC in MP4 containers

## Current Status

- **v1.0.41**: Format preference fix deployed to prefer WebM/H.264 MP4
- **v1.0.45+**: Enhanced codec detection and comprehensive diagnostics added
- **v1.0.46**: **CRITICAL ROOT CAUSE IDENTIFIED** - Missing ffmpeg causes incomplete downloads
  - Detection and logging added for missing ffmpeg warnings
  - Detection for unmerged files (format code pattern)
  - Critical error logging when merge fails
- **v1.0.47+ (Planned)**: Bundle ffmpeg with app to enable proper merging and future video optimization features

### Recent Findings (v1.0.46)

**CRITICAL ROOT CAUSE IDENTIFIED**: **ffmpeg is not installed**

**Issue**: Downloads result in incomplete files (audio-only or video-only), causing playback failures.

**Actual Root Cause**:
- **ffmpeg is missing** from the system
- When yt-dlp selects formats requiring merging (separate video+audio streams), it needs ffmpeg
- Without ffmpeg, merging fails and only one stream is saved
- Example: Format `303+251` selected → only `.f251.webm` (audio) saved → video stream lost

**Evidence from Logs**:
- Warning: `WARNING: You have requested merging of multiple formats but ffmpeg is not installed`
- Final file: `.f251.webm` (format code indicates unmerged file)
- File size: 12.69 MB for a 17-minute video (suspiciously small = audio-only)
- Missing video stream: Format 303 (video) was downloaded but lost during failed merge

**Why This Causes Playback Issues**:
- Audio-only files play but have no video
- Video-only files (if saved) have no audio
- Incomplete downloads cannot be played properly

**Recent Improvements**:

1. **Aggressive WebM Preference** (v1.0.45):
   - Format string now tries WebM at multiple quality levels (1080p, 720p, 480p) before accepting MP4
   - MP4 is only used as absolute last resort
   - Format priority: `best[height<=1080][ext=webm]` → `best[height<=720][ext=webm]` → `best[height<=480][ext=webm]` → MP4 fallback

2. **Comprehensive Codec Detection** (v1.0.45):
   - Extracts actual video/audio codec from yt-dlp format info
   - Detects H.264/AVC1 vs H.265/HEVC automatically
   - Logs codec compatibility warnings during download
   - Identifies when H.265/HEVC is selected (will fail in Chromium)

3. **Enhanced Playback Diagnostics** (v1.0.45):
   - Logs comprehensive video element state on errors:
     - Error code and name (DECODE, SRC_NOT_SUPPORTED, NETWORK, etc.)
     - Video dimensions, duration, buffered ranges
     - Network state and ready state
     - Browser codec support capabilities (`canPlayType` checks)
   - Logs successful video load with metadata
   - Provides specific diagnosis based on error type

4. **Format Selection Logging**:
   - Logs which format yt-dlp actually selected
   - Shows format ID, description, and codec details
   - Warns when MP4 is selected instead of WebM
   - Logs when multiple files are created (merge failures)

**Solution Plan** (v1.0.47+):

1. **Bundle ffmpeg with the app** (similar to yt-dlp):
   - Download ffmpeg static builds for each platform (macOS, Windows, Linux)
   - Store in app's `bin/` directory alongside yt-dlp
   - Auto-download on first run if not present
   - Use bundled ffmpeg for merging video+audio streams

2. **Use bundled ffmpeg for merging**:
   - When yt-dlp selects formats requiring merging, use bundled ffmpeg
   - Ensure successful merge of video+audio streams
   - Complete downloads with both video and audio

3. **Future Features Enabled**:
   - Video optimization and compression
   - Format conversion (MP4 ↔ WebM, etc.)
   - Quality adjustment and re-encoding
   - User-controlled video processing options

**Implementation Status**:
- ✅ Root cause identified (missing ffmpeg)
- ✅ Detection and logging added (v1.0.46)
- 🔄 ffmpeg bundling in progress (v1.0.47+)
- ⏳ Video optimization features (future)





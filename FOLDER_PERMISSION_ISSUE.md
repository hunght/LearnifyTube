# Folder Permission Issue

## Problem Description

When users change the download folder in LearnifyTube settings to a new location (e.g., Desktop, Documents, or any custom folder), the app fails to access video files for playback even after the user appears to grant permission through macOS.

## Symptoms

1. **User changes download folder**: User navigates to Settings and selects a new folder (e.g., `/Users/owner/Desktop`) as the download location.

2. **Videos download successfully**: Videos are downloaded to the new folder location without errors.

3. **Playback fails**: When attempting to play a downloaded video, the app displays:
   - Error message: "Video file not found"
   - Description: "The video file could not be loaded. It may have been deleted or moved."

4. **Permission check appears successful**: The app's permission check (`fs.promises.access`) reports that the directory is readable, suggesting macOS has granted access.

5. **Protocol handler warnings**: The custom `local-file://` protocol handler logs warnings about path normalization (missing leading slash in URLs).

## When It Occurs

- After changing the download folder in Settings to a new location
- When attempting to play videos that were downloaded to the newly configured folder
- The issue persists even after restarting the app
- The issue occurs on macOS (likely related to macOS sandboxing and file access permissions)

## User Impact

- Users cannot play videos after changing their download folder
- Users must either:
  - Re-download videos (which may not be practical)
  - Revert to the default Downloads folder
  - Manually move files to an accessible location

## Technical Context

- The app uses Electron's `dialog.showOpenDialog` to request folder access
- Files are accessed via a custom `local-file://` protocol handler
- The app stores the selected download path in the database
- Permission checks use Node.js `fs.promises.access` with `R_OK` flag
- The issue suggests a disconnect between:
  - What the permission check reports (accessible)
  - What the actual file access can do (blocked)

## Logs Observed

When the issue occurs, logs show:
- `[preferences] Directory is readable` - permission check passes
- `[preferences] Directory already accessible` - no prompt shown
- `[protocol] normalized path missing leading slash` - URL formatting issue
- `[VideoPlayer] video playback error Error: MEDIA_ELEMENT_ERROR: Format error` - playback failure

## Environment

- Platform: macOS
- App: LearnifyTube (Electron-based)
- Issue appears related to macOS sandboxing and security-scoped bookmarks




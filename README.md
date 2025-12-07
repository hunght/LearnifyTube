# LearnifyTube – Download, Organize & Learn Faster

LearnifyTube is the modern YouTube downloader for students, educators and lifelong learners who want to build a personal, distraction‑free learning library. Turn any playlist, lecture or tutorial into beautifully organized offline lessons that sync across your classroom, campus or commute.

[![Watch the Demo](http://img.youtube.com/vi/pBTxg5TlHBA/0.jpg)](https://www.youtube.com/watch?v=pBTxg5TlHBA)

## Why Learners Love LearnifyTube
- 🎓 **Education-Ready Downloads** – Grab videos, whole playlists, shorts, transcripts and subtitles in one click.
- 🚀 **Speed & Reliability** – yt-dlp performance wrapped in a friendly UI built for macOS & Windows.
- 🧠 **Smart Knowledge Hub** – Tag subjects, group courses, pin timestamps, add study notes and keep everything searchable.
- 📲 **Offline Learning Anywhere** – Export to mobile, tablets, classroom screens or LMS platforms for zero-buffer playback.
- 🌓 **Focus-Friendly Design** – Light + dark themes, distraction‑free mode, queue automation and download scheduling.


## Perfect For
- College students saving lectures before exams.
- Teachers assembling lesson plans and blended-learning packs.
- Bootcamp learners collecting SaaS, AI, coding and design tutorials.
- Content creators archiving inspiration libraries.
- Knowledge workers building “second brain” research vaults.


## Key Product Highlights
| Feature | What It Delivers |
| --- | --- |
| **Multi-Format Downloads** | MP4, MP3, MKV, 4K, subtitles, chapters, metadata |
| **Learning Queue** | Drag-and-drop order, priority flags, status tracking |
| **Smart Notes** | Inline timestamps, highlight cards, export to Notion/Obsidian |
| **Auto Playlists** | Auto-tag by subject, speaker, language, topic difficulty |
| **Translator Assist** | Download subtitles in 100+ languages |
| **Privacy First** | Data stays on your device. No accounts, no telemetry. |


## Search-Optimized Benefits
- Download YouTube courses for offline study
- Save playlists for lecture prep & homeschool lessons
- Convert educational videos to audio flashcasts
- Build an AI-ready knowledge base with transcripts and notes
- Keep research materials organized inside one dashboard
- Sync “watch later” learning goals across devices


## Get Started
1. **Download** the latest release for macOS or Windows
2. Paste any YouTube URL, playlist or channel
3. Choose quality, subtitles, audio, metadata, tags
4. Hit **Download & Organize** – LearnifyTube handles the rest

👉 [Download LearnifyTube Now](https://github.com/hunght/LearnifyTube/releases)

## macOS Permissions & Playback (new streaming engine)
We now follow the same pattern as lossless-cut so macOS security doesn’t break playback:

- 🔐 **Main-process streaming** – the renderer never touches `file://` URLs. The Electron main process streams bytes directly to the player, so Chromium’s `DEMUXER_ERROR_COULD_NOT_OPEN` is gone.
- 🗂 **One-time folder authorization** – if macOS blocks a file in Downloads/Desktop/Documents, LearnifyTube automatically asks you to “Allow Access.” Approve the Downloads folder (or your custom library) once and macOS remembers it. You can also manage it from **Settings → Download Folder → Open / Change Folder**.
- ✅ **No hacks required** – we use Apple’s user-selected-folder entitlement, so there’s no need for Full Disk Access tricks. Once the folder is authorized, streaming “just works.”

Moving your library? Reopen Settings → Download Folder, point to the new location, and we’ll refresh the permission for you.

## Questions?
Reach us via GitHub issues or email `hello@learnifytube.com`.
We’re building the smartest learning-first YouTube downloader – and you’re invited.

# CLAUDE.md

Electron + React desktop app for YouTube downloads, transcripts, and study materials (yt-dlp based).

## Commands

```bash
npm run dev              # Development with hot reload
npm run type-check       # TypeScript validation
npm run lint:fix         # ESLint with auto-fix
npm run test             # Jest tests
npm run db:studio        # Drizzle Studio
npm run release:no-draft # Preferred release (auto-publish)
```

## Architecture

**Electron Processes:**
- Main (`src/main.ts`): Window, database, download queue, tRPC handler
- Renderer (`src/App.tsx`): React + TanStack Router
- Preload (`src/preload.ts`): Secure IPC bridge

**IPC:** electron-trpc. Routers in `src/api/routers/`, client in `src/utils/trpc.ts`

**Database:** Drizzle + SQLite (WAL mode). Schema: `src/api/db/schema.ts`

**State:** Jotai (UI) + React Query via tRPC (server) + SQLite (persistent)

**Key Paths:**
- `src/api/` - Main process, tRPC routers, database
- `src/components/` - React components (`ui/` = Shadcn primitives)
- `src/pages/` - Page components
- `src/routes/` - TanStack Router config
- `src/atoms/` - Jotai atoms
- `src/services/` - Business logic (download queue)

## Code Style

- **Max 300 lines** per component file
- **Prefer functions** over classes
- **tRPC hooks** directly in components (no thin wrappers)
- **Path alias:** `@/*` maps to `src/*`

## Media Streaming (macOS)

Renderer uses `local-file://` protocol, not `file://` - main process streams bytes to avoid Chromium demuxer errors.

## Database Migrations

Located in `drizzle/`. Auto-backup before migration (keeps 5). Recovery wipes corrupted DB if retries fail.

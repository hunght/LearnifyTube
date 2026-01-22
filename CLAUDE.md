# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LearnifyTube is an Electron + React desktop application for downloading YouTube videos, managing transcripts, and creating study materials. It uses yt-dlp for downloads and provides features like annotations, flashcards, and AI-powered summaries.

## Common Commands

```bash
# Development
npm run dev           # Start development with hot reload (or npm start)
npm run storybook     # Run Storybook component library on port 6006

# Quality checks
npm run type-check    # TypeScript validation
npm run lint          # ESLint check
npm run lint:fix      # ESLint with auto-fix

# Testing
npm run test                        # Run all Jest tests
npm run test:watch                  # Run tests in watch mode
npm run test -- path/to/file.test.ts  # Run a single test file
npm run test:database               # Database-specific tests
npm run test:e2e                    # Playwright end-to-end tests

# Database
npm run db:generate   # Generate Drizzle migrations
npm run db:studio     # Open Drizzle Studio for database inspection

# Build & Release
npm run make              # Package the application
npm run release:no-draft  # Release and publish immediately (preferred)
npm run release           # Release as draft (requires manual publish on GitHub)
npm run release minor     # Bump minor version and release
npm run release 1.2.3     # Release specific version
```

## Release Process

**Always use `npm run release:no-draft` for releases.** This:
1. Runs type-check (fails if errors)
2. Bumps patch version in package.json
3. Commits and creates git tag
4. Pushes to main and triggers GitHub Actions
5. GitHub Actions builds for macOS, Windows, and Linux
6. Publishes release immediately (no manual steps needed)

## Architecture

### Process Model (Electron)

- **Main process** (`src/main.ts`): Window management, database, download queue, tRPC IPC handler
- **Renderer process** (`src/App.tsx`): React app with TanStack Router
- **Preload script** (`src/preload.ts`): Context bridge for secure IPC

### IPC Communication via tRPC

Communication between renderer and main process uses electron-trpc:

```
Renderer → trpcClient.call() → ipcLink → Main Process tRPC Handler → Router/Procedure → Database/APIs
```

- tRPC routers in `src/api/routers/`: utils, window, ytdlp, queue, preferences, translation, annotations, watchStats, transcripts, playlists, binary, ai, flashcards, optimization
- Root router: `src/api/index.ts`
- Client setup: `src/utils/trpc.ts`

### Database (Drizzle + SQLite)

- Schema: `src/api/db/schema.ts`
- Initialization with migrations: `src/api/db/init.ts`
- Lazy connection via Proxy pattern: `src/api/db/index.ts`
- Uses WAL mode, 64MB cache, foreign keys enabled

### Key Directories

```
src/
├── api/              # Main process: tRPC routers, database
│   ├── db/           # Drizzle schema, migrations, connection
│   └── routers/      # tRPC procedure definitions
├── components/       # React components
│   └── ui/           # Shadcn/Radix primitives
├── pages/            # Page components (one per route)
├── routes/           # TanStack Router configuration
├── hooks/            # Custom React hooks
├── atoms/            # Jotai atoms (client state)
├── services/         # Complex business logic (download queue)
├── helpers/          # Utilities including IPC helpers
└── utils/            # Shared utilities
```

### State Management

- **Jotai**: Client-side UI state with localStorage persistence (`src/atoms/`)
- **React Query**: Server state caching via tRPC
- **Database**: Persistent data in SQLite

### Routing

TanStack React Router with file-based routes in `src/routes/`. Key routes:
- `/` - Dashboard
- `/player?videoId=XXX` - Video player
- `/channel?channelId=XXX` - Channel details
- `/my-words` - Vocabulary/study features
- `/settings` - App settings

## Code Style Requirements

### Component Guidelines

- **Maximum 300 lines per component file**
- Single responsibility per component
- Extract sub-components when complexity grows
- Use custom hooks for complex logic

### TypeScript

- No `any` type - use specific types or generics
- Use interfaces for object shapes
- Prefer `readonly` for immutable data
- Use optional chaining (`?.`) and nullish coalescing (`??`)

### Functional Programming

Classes are forbidden. Use:
- Pure functions
- Higher-order functions
- Composition over inheritance

### tRPC Usage

Use tRPC hooks directly in components. Do not create wrapper hooks that just rename or aggregate tRPC hooks without adding business logic:

```typescript
// Good - direct usage
const { data: categories } = api.category.getAll.useQuery();
const createMutation = api.category.create.useMutation();

// Bad - useless wrapper
const useCategoryData = () => {
  const query = api.category.getAll.useQuery();
  return { categories: query.data }; // Just renaming, no value added
};
```

Wrapper hooks are only justified when they add real value like complex validation logic, computed state, or data transformations.

## Git Hooks (Lefthook)

Pre-commit runs automatically (in parallel):
- Type checking
- ESLint with auto-fix on staged files
- Prettier formatting on staged files
- Jest tests for related changed files

Commit messages must be at least 10 characters.

## Path Alias

Use `@/*` to import from `src/*`:
```typescript
import { Button } from '@/components/ui/button';
```

## macOS Media Streaming

The app uses main-process streaming (like lossless-cut) to avoid Chromium's `DEMUXER_ERROR_COULD_NOT_OPEN`:
- Renderer never touches `file://` URLs directly
- Main process streams bytes via custom `local-file://` protocol and HTTP media server
- One-time folder authorization for Downloads/Desktop/Documents via user-selected-folder entitlement

## Database Migrations

Migrations are in `drizzle/` folder. On app start:
1. Backup created before migration (keeps 5 most recent)
2. Drizzle runs pending migrations
3. Integrity check validates database
4. Recovery mechanism wipes corrupted DB and starts fresh if all retries fail

Backup files: `local.db.{version}.{timestamp}.backup` in app data folder.

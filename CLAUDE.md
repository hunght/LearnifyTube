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

# Build
npm run make          # Package the application
```

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

# LearnifyTube Redesign Plan

Transform LearnifyTube from a "YouTube Downloader" into a "Language Learning Hub"

---

## Phase 1: Navigation & Dashboard [COMPLETED]

### Overview
Reorganize sidebar with grouped sections (LEARN, LIBRARY, MANAGE), create a new learning-focused Home dashboard, and make right sidebar contextual per page.

### Implementation Status

| Step | Task | Status |
|------|------|--------|
| 1 | Update Types & State | DONE |
| 2 | Create Learning Stats Router | DONE |
| 3 | Reorganize Sidebar | DONE |
| 4 | Create New Home Dashboard | DONE |
| 5 | Update Routes | DONE |
| 6 | Contextual Right Sidebar | DONE |

### Files Created
- `src/api/routers/learning-stats.ts` - tRPC router for dashboard stats and streak
- `src/pages/home/HomePage.tsx` - New learning-focused home dashboard
- `src/pages/home/components/StudyStreakCard.tsx` - Hero card with streak display
- `src/pages/home/components/QuickStatsRow.tsx` - Four metric cards
- `src/pages/home/components/ContinueWatchingSection.tsx` - Recent videos section
- `src/components/QuickAddDialog.tsx` - Modal for adding videos/channels
- `src/components/LearningStatsSidebar.tsx` - Right sidebar learning stats

### Files Modified
- `src/lib/types/user-preferences.ts` - Added "home" to SidebarItem
- `src/context/rightSidebar.ts` - Added "learning-stats" content type
- `src/api/index.ts` - Registered learningStatsRouter
- `src/api/routers/preferences/index.ts` - Added "home" to zod enum
- `src/components/app-sidebar.tsx` - Grouped sections (LEARN, LIBRARY, MANAGE)
- `src/components/app-right-sidebar.tsx` - Added learning-stats case
- `src/routes/routes.tsx` - HomePage at `/`, old dashboard at `/downloads`

### Verification
- [x] `npm run type-check` - Passes
- [x] `npm run lint` - Passes
- [x] `npm run test` - Passes

---

## Phase 2: Enhanced Video Player [COMPLETED]

### Goals
- Add vocabulary highlighting in transcripts
- Quick word save with one click
- Inline translation popups
- Progress tracking per video

### Implementation Status

| Step | Task | Status |
|------|------|--------|
| 1 | Add vocabulary content type | DONE |
| 2 | Create VocabularySidebar component | DONE |
| 3 | Add getSavedWordsByVideoId procedure | DONE |
| 4 | Add Vocabulary tab to player sidebar | DONE |
| 5 | Enhanced word selection (quick save) | DONE |
| 6 | Video progress indicator | DONE |

### Files Created (Phase 2)
- `src/components/VocabularySidebar.tsx` - Shows saved words from current video with timestamps

### Files Modified (Phase 2)
- `src/context/rightSidebar.ts` - Added "vocabulary" content type
- `src/api/routers/translation/index.ts` - Added `getSavedWordsByVideoId` procedure
- `src/components/app-right-sidebar.tsx` - Added Vocabulary tab (BookOpen icon)

### Vocabulary Tab Features
- Shows all words saved from the current video
- Displays word, translation, and optional notes
- Click timestamp to jump to that moment in video
- Empty state when no words saved yet

### Quick Save Feature (Step 5)
- Double-click any word in transcript to instantly translate and save
- Visual feedback: yellow highlight while saving, green checkmark on success
- Automatically gets translation and saves to My Words in one action
- Hint text updated to guide users: "Hover to translate • Double-click to quick save"

### Files Modified (Step 5)
- `src/pages/player/components/TranscriptWord.tsx` - Added onClick, isSaving, justSaved props with visual states
- `src/pages/player/components/TranscriptContent.tsx` - Added onWordClick, savingWord, justSavedWord props
- `src/pages/player/components/TranscriptPanel.tsx` - Added handleQuickSave callback and state

### Video Progress Indicator (Step 6)
- Progress bar in CardHeader showing current position vs duration
- Shows time as mm:ss or hh:mm:ss format
- "Completed" badge when 95%+ watched
- Green progress bar color for completed videos

### Files Created (Step 6)
- `src/pages/player/components/VideoProgressIndicator.tsx` - Progress bar component

### Files Modified (Step 6)
- `src/pages/player/PlayerPage.tsx` - Added videoDuration state, metadata event listener, and VideoProgressIndicator

### Verification
- [x] `npm run type-check` - Passes
- [x] `npm run lint` - Passes

---

## Phase 3: Flashcard System Improvements [COMPLETED]

### Goals
- Better SRS algorithm visualization
- Study session modes (quick, focused, review)
- Audio pronunciation support
- Context-based learning with video clips

### Implementation Status

| Step | Task | Status |
|------|------|--------|
| 1 | Add study session types selection | DONE |
| 2 | Create progress visualization charts | DONE |
| 3 | Implement audio playback for words | DONE |
| 4 | Add video clip context to flashcards | DONE |
| 5 | Create spaced repetition calendar view | DONE |

### Study Session Types (Step 1)
Five session modes available:
- **Quick Review** (10 cards) - Fast session for busy times
- **Standard Review** (25 cards) - Balanced daily practice
- **Full Review** (all due) - Complete review of due cards
- **New Cards Only** - Focus on learning new vocabulary
- **Review Only** - Practice previously studied cards

### Files Created (Step 1)
- `src/pages/my-words/components/StudySessionSelector.tsx` - Session picker UI

### Files Modified (Step 1)
- `src/api/routers/flashcards.ts` - Added `getStudySession` procedure with session type filtering
- `src/pages/my-words/MyWordsPage.tsx` - Integrated session selector before study mode

### Progress Visualization (Step 2)
SRSProgressChart component showing:
- **Learning Progress** - Stacked bar showing new/learning/graduated distribution
- **Mastery Rate** - Percentage of cards that are graduated (>21 day interval)
- **Interval Distribution** - Bar chart showing cards by interval bucket (1 day, 2-6 days, 1-2 weeks, etc.)
- **Upcoming Reviews** - Cards due today, tomorrow, next 3 days, this week

### Files Created (Step 2)
- `src/pages/my-words/components/SRSProgressChart.tsx` - Progress visualization component

### Files Modified (Step 2)
- `src/pages/my-words/components/FlashcardsTab.tsx` - Added SRSProgressChart below stat cards

---

## Phase 4: Learning Analytics [COMPLETED]

### Goals
- Detailed learning statistics
- Progress over time charts
- Vocabulary growth tracking
- Study habit insights

### Implementation Status

| Step | Task | Status |
|------|------|--------|
| 1 | Create analytics dashboard page | DONE |
| 2 | Add charts for watch time, words learned, retention | DONE |
| 3 | Add weekly/monthly summary reports | DONE |
| 4 | Create learning goals and milestones | DONE |

### Files Created (Phase 4)
- `src/pages/analytics/AnalyticsPage.tsx` - Main analytics dashboard
- `src/pages/analytics/components/LearningActivityChart.tsx` - 14-day activity bar chart
- `src/pages/analytics/components/VocabularyGrowthChart.tsx` - 30-day vocabulary line chart
- `src/pages/analytics/components/WeeklySummaryCard.tsx` - Weekly stats summary
- `src/pages/analytics/components/LearningGoalsCard.tsx` - Learning goals tracker

### Files Modified (Phase 4)
- `src/lib/types/user-preferences.ts` - Added "analytics" to SidebarItem type
- `src/components/app-sidebar.tsx` - Added Analytics item to LEARN group
- `src/routes/routes.tsx` - Added /analytics route
- `src/api/routers/preferences/index.ts` - Added "analytics" to Zod enum
- `src/api/routers/learning-stats.ts` - Added getAnalytics procedure

### Analytics Features
- **Top Stats Cards**: Current streak, words learned, watch time, retention rate
- **Learning Activity Chart**: 14-day bar chart showing reviews and new words per day
- **Vocabulary Growth Chart**: 30-day line chart showing total and mastered words over time
- **Weekly Summary**: Study days progress, stats grid (new words, cards reviewed, watch time, retention)
- **Learning Goals**: Daily reviews, weekly words, weekly watch time targets with progress bars
- **Monthly Overview**: Total reviews, new words, videos watched, best streak

### Verification
- [x] `npm run type-check` - Passes
- [x] `npm run lint` - Passes

---

## Phase 5: Social & Export Features [PENDING]

### Goals
- Export flashcards to Anki
- Share vocabulary lists
- Import word lists
- Backup/restore functionality

### Proposed Tasks
- [ ] Implement Anki export format
- [ ] Create vocabulary list sharing
- [ ] Add import from CSV/text files
- [ ] Implement cloud backup option
- [ ] Add export to other flashcard apps

---

## Architecture Notes

### Sidebar Groups Structure
```
LEARN
├── Home (/)
├── Flashcards (/my-words)
└── History (/history)

LIBRARY
├── Channels (/channels)
├── Playlists (/playlists)
└── Subscriptions (/subscriptions)

MANAGE
├── Storage (/storage)
├── Settings (/settings)
└── Logs (/app-debug-logs) [dev only]
```

### Data Flow for Home Dashboard
```
HomePage
├── useQuery(api.learningStats.getDashboardStats)
│     → { flashcards: {due, new, learning, graduated}, watchTime: {...} }
├── useQuery(api.learningStats.getStreak)
│     → { currentStreak, lastActiveDate, longestStreak }
├── useQuery(api.watchStats.listRecentWatched)
│     → [{ videoId, title, thumbnail, progress }]
└── useSetAtom(rightSidebarContentAtom) → "learning-stats"
```

### Right Sidebar Content Types
- `"queue"` - Download queue (default)
- `"annotations"` - Video notes
- `"vocabulary"` - Saved words from video (Phase 2)
- `"ai-summary"` - AI-generated summary
- `"quiz"` - Quiz mode
- `"capture"` - Screenshot capture
- `"learning-stats"` - Learning statistics (home page)

---

## Testing Checklist

### Phase 1 Manual Testing
- [x] Sidebar shows 3 groups (LEARN, LIBRARY, MANAGE)
- [x] Home page displays study stats and streak
- [x] Continue watching section shows recent videos
- [x] Quick Add dialog works for videos/channels/playlists
- [x] Right sidebar shows learning stats on home page
- [x] All navigation links work correctly
- [x] Old dashboard accessible at /downloads

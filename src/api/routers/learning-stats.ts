import { publicProcedure, t } from "@/api/trpc";
import { sql, gt } from "drizzle-orm";
import { flashcards, videoWatchStats, youtubeVideos } from "@/api/db/schema";
import defaultDb from "@/api/db";

type DashboardStats = {
  flashcards: {
    due: number;
    new: number;
    learning: number;
    graduated: number;
    total: number;
  };
  watchTime: {
    totalMinutes: number;
    todayMinutes: number;
    weekMinutes: number;
  };
  videos: {
    total: number;
    watched: number;
  };
};

type StreakData = {
  currentStreak: number;
  lastActiveDate: string | null;
  longestStreak: number;
};

export const learningStatsRouter = t.router({
  // Get dashboard statistics
  getDashboardStats: publicProcedure.query(async ({ ctx }): Promise<DashboardStats> => {
    const db = ctx.db ?? defaultDb;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
    const nowIso = now.toISOString();

    // Get flashcard counts
    const allFlashcards = await db.select().from(flashcards);

    let dueCount = 0;
    let newCount = 0;
    let learningCount = 0;
    let graduatedCount = 0;

    for (const card of allFlashcards) {
      const interval = card.interval ?? 0;
      const reviewCount = card.reviewCount ?? 0;

      // New cards: never reviewed
      if (reviewCount === 0) {
        newCount++;
      }
      // Graduated: interval > 21 days (well-learned)
      else if (interval > 21) {
        graduatedCount++;
      }
      // Learning: reviewed but interval <= 21 days
      else {
        learningCount++;
      }

      // Due: nextReviewAt is in the past or now
      if (card.nextReviewAt && card.nextReviewAt <= nowIso) {
        dueCount++;
      }
    }

    // Get watch time stats
    const watchStats = await db.select().from(videoWatchStats);

    let totalSeconds = 0;
    let todaySeconds = 0;
    let weekSeconds = 0;
    let watchedCount = 0;

    for (const stat of watchStats) {
      const seconds = stat.totalWatchSeconds ?? 0;
      totalSeconds += seconds;

      if (seconds > 0) {
        watchedCount++;
      }

      // Check if watched today or this week
      const lastWatched = stat.lastWatchedAt ?? 0;
      if (lastWatched >= todayStart) {
        todaySeconds += seconds;
      }
      if (lastWatched >= weekStart) {
        weekSeconds += seconds;
      }
    }

    // Get total videos count
    const videosResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(youtubeVideos)
      .get();

    return {
      flashcards: {
        due: dueCount,
        new: newCount,
        learning: learningCount,
        graduated: graduatedCount,
        total: allFlashcards.length,
      },
      watchTime: {
        totalMinutes: Math.round(totalSeconds / 60),
        todayMinutes: Math.round(todaySeconds / 60),
        weekMinutes: Math.round(weekSeconds / 60),
      },
      videos: {
        total: videosResult?.count ?? 0,
        watched: watchedCount,
      },
    };
  }),

  // Calculate study streak from watch stats
  getStreak: publicProcedure.query(async ({ ctx }): Promise<StreakData> => {
    const db = ctx.db ?? defaultDb;

    // Get all watch stats ordered by last watched date
    const stats = await db
      .select({
        lastWatchedAt: videoWatchStats.lastWatchedAt,
      })
      .from(videoWatchStats)
      .where(gt(videoWatchStats.totalWatchSeconds, 0));

    if (stats.length === 0) {
      return {
        currentStreak: 0,
        lastActiveDate: null,
        longestStreak: 0,
      };
    }

    // Get unique dates when user was active (watched something)
    const activeDates = new Set<string>();
    for (const stat of stats) {
      if (stat.lastWatchedAt) {
        const date = new Date(stat.lastWatchedAt);
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        activeDates.add(dateStr);
      }
    }

    // Sort dates descending
    const sortedDates = Array.from(activeDates).sort().reverse();

    if (sortedDates.length === 0) {
      return {
        currentStreak: 0,
        lastActiveDate: null,
        longestStreak: 0,
      };
    }

    // Calculate current streak
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    let currentStreak = 0;
    let checkDate = new Date(today);

    // Start from today or yesterday if not active today
    if (!activeDates.has(todayStr)) {
      if (!activeDates.has(yesterdayStr)) {
        // Streak is broken
        return {
          currentStreak: 0,
          lastActiveDate: sortedDates[0],
          longestStreak: calculateLongestStreak(sortedDates),
        };
      }
      checkDate = yesterday;
    }

    // Count consecutive days
    while (true) {
      const checkStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, "0")}-${String(checkDate.getDate()).padStart(2, "0")}`;
      if (activeDates.has(checkStr)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      currentStreak,
      lastActiveDate: sortedDates[0],
      longestStreak: calculateLongestStreak(sortedDates),
    };
  }),
});

// Helper function to calculate longest streak
const calculateLongestStreak = (sortedDates: string[]): number => {
  if (sortedDates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  // Sort ascending for easier calculation
  const ascending = [...sortedDates].sort();

  for (let i = 1; i < ascending.length; i++) {
    const prevDate = new Date(ascending[i - 1]);
    const currDate = new Date(ascending[i]);

    // Check if dates are consecutive
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
};

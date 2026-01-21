import { publicProcedure, t } from "@/api/trpc";
import { sql, gt } from "drizzle-orm";
import { flashcards, videoWatchStats, youtubeVideos, savedWords } from "@/api/db/schema";
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

type DailyActivity = {
  date: string;
  reviews: number;
  newWords: number;
  watchMinutes: number;
};

type VocabularyDataPoint = {
  date: string;
  totalWords: number;
  masteredWords: number;
};

type WeeklyStats = {
  wordsLearned: number;
  cardsReviewed: number;
  averageRetention: number;
  studyDays: number;
};

type MonthlyStats = {
  totalReviews: number;
  newWordsLearned: number;
  videosWatched: number;
  studyStreak: number;
};

type AnalyticsData = {
  dailyActivity: DailyActivity[];
  vocabularyGrowth: VocabularyDataPoint[];
  weeklyStats: WeeklyStats;
  monthlyStats: MonthlyStats;
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

  // Get comprehensive analytics data
  getAnalytics: publicProcedure.query(async ({ ctx }): Promise<AnalyticsData> => {
    const db = ctx.db ?? defaultDb;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get all flashcards for analysis
    const allFlashcards = await db.select().from(flashcards);

    // Get all saved words for vocabulary tracking
    const allSavedWords = await db
      .select({
        id: savedWords.id,
        createdAt: savedWords.createdAt,
      })
      .from(savedWords);

    // Get all watch stats
    const watchStats = await db.select().from(videoWatchStats);

    // Build daily activity data (last 30 days)
    const dailyActivity: DailyActivity[] = [];
    const dailyReviewMap = new Map<string, number>();
    const dailyNewWordsMap = new Map<string, number>();
    const dailyWatchMap = new Map<string, number>();

    // Count reviews per day from flashcard updatedAt
    for (const card of allFlashcards) {
      if (card.updatedAt && card.reviewCount && card.reviewCount > 0) {
        const updateDate = new Date(card.updatedAt);
        const dateStr = updateDate.toISOString().split("T")[0];
        dailyReviewMap.set(dateStr, (dailyReviewMap.get(dateStr) ?? 0) + 1);
      }
    }

    // Count new words per day from savedWords createdAt
    for (const word of allSavedWords) {
      if (word.createdAt) {
        const createDate = new Date(word.createdAt);
        const dateStr = createDate.toISOString().split("T")[0];
        dailyNewWordsMap.set(dateStr, (dailyNewWordsMap.get(dateStr) ?? 0) + 1);
      }
    }

    // Sum watch time per day
    for (const stat of watchStats) {
      if (stat.lastWatchedAt && stat.totalWatchSeconds) {
        const watchDate = new Date(stat.lastWatchedAt);
        const dateStr = watchDate.toISOString().split("T")[0];
        const minutes = Math.round(stat.totalWatchSeconds / 60);
        dailyWatchMap.set(dateStr, (dailyWatchMap.get(dateStr) ?? 0) + minutes);
      }
    }

    // Build 30 days of activity data
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      dailyActivity.push({
        date: dateStr,
        reviews: dailyReviewMap.get(dateStr) ?? 0,
        newWords: dailyNewWordsMap.get(dateStr) ?? 0,
        watchMinutes: dailyWatchMap.get(dateStr) ?? 0,
      });
    }

    // Build vocabulary growth data (cumulative)
    const vocabularyGrowth: VocabularyDataPoint[] = [];
    const sortedWords = [...allSavedWords].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    const sortedCards = [...allFlashcards].sort((a, b) =>
      (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
    );

    // Track cumulative counts per day
    const cumulativeWordsMap = new Map<string, number>();
    const cumulativeMasteredMap = new Map<string, number>();

    let runningTotal = 0;
    for (const word of sortedWords) {
      if (word.createdAt) {
        const dateStr = new Date(word.createdAt).toISOString().split("T")[0];
        runningTotal++;
        cumulativeWordsMap.set(dateStr, runningTotal);
      }
    }

    // Count mastered cards (interval > 21) per day
    let runningMastered = 0;
    for (const card of sortedCards) {
      if (card.createdAt && (card.interval ?? 0) > 21) {
        const dateStr = new Date(card.createdAt).toISOString().split("T")[0];
        runningMastered++;
        cumulativeMasteredMap.set(dateStr, runningMastered);
      }
    }

    // Fill vocabulary growth for last 30 days
    let lastTotal = 0;
    let lastMastered = 0;
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      if (cumulativeWordsMap.has(dateStr)) {
        lastTotal = cumulativeWordsMap.get(dateStr)!;
      }
      if (cumulativeMasteredMap.has(dateStr)) {
        lastMastered = cumulativeMasteredMap.get(dateStr)!;
      }

      vocabularyGrowth.push({
        date: dateStr,
        totalWords: lastTotal,
        masteredWords: lastMastered,
      });
    }

    // Calculate weekly stats
    const weeklyWordsLearned = allSavedWords.filter(
      (w) => w.createdAt && w.createdAt >= weekStart.getTime()
    ).length;

    const weeklyCardsReviewed = allFlashcards.filter((card) => {
      if (!card.updatedAt || !card.reviewCount || card.reviewCount === 0) return false;
      const updateDate = new Date(card.updatedAt);
      return updateDate >= weekStart;
    }).length;

    // Count unique study days this week
    const studyDaysSet = new Set<string>();
    dailyActivity.slice(-7).forEach((day) => {
      if (day.reviews > 0 || day.newWords > 0 || day.watchMinutes > 0) {
        studyDaysSet.add(day.date);
      }
    });

    // Calculate retention (graduated / total with reviews)
    const reviewedCards = allFlashcards.filter((c) => (c.reviewCount ?? 0) > 0);
    const graduatedCards = reviewedCards.filter((c) => (c.interval ?? 0) > 21);
    const averageRetention =
      reviewedCards.length > 0
        ? Math.round((graduatedCards.length / reviewedCards.length) * 100)
        : 0;

    const weeklyStats: WeeklyStats = {
      wordsLearned: weeklyWordsLearned,
      cardsReviewed: weeklyCardsReviewed,
      averageRetention,
      studyDays: studyDaysSet.size,
    };

    // Calculate monthly stats
    const monthlyWordsLearned = allSavedWords.filter(
      (w) => w.createdAt && w.createdAt >= monthStart.getTime()
    ).length;

    const monthlyReviews = allFlashcards.filter((card) => {
      if (!card.updatedAt || !card.reviewCount || card.reviewCount === 0) return false;
      const updateDate = new Date(card.updatedAt);
      return updateDate >= monthStart;
    }).length;

    const videosWatched = watchStats.filter(
      (s) =>
        s.lastWatchedAt && s.lastWatchedAt >= monthStart.getTime() && (s.totalWatchSeconds ?? 0) > 0
    ).length;

    // Calculate best streak this month
    const monthlyDays = dailyActivity.filter((day) => {
      const dayDate = new Date(day.date);
      return dayDate >= monthStart;
    });

    let bestStreak = 0;
    let currentStreak = 0;
    for (const day of monthlyDays) {
      if (day.reviews > 0 || day.newWords > 0 || day.watchMinutes > 0) {
        currentStreak++;
        bestStreak = Math.max(bestStreak, currentStreak);
      } else {
        currentStreak = 0;
      }
    }

    const monthlyStats: MonthlyStats = {
      totalReviews: monthlyReviews,
      newWordsLearned: monthlyWordsLearned,
      videosWatched,
      studyStreak: bestStreak,
    };

    return {
      dailyActivity,
      vocabularyGrowth,
      weeklyStats,
      monthlyStats,
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

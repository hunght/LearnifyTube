import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import defaultDb from "@/api/db";
import {
  translationCache,
  translationContexts,
  youtubeVideos,
  savedWords,
  type TranslationCache,
} from "@/api/db/schema";
import { desc, sql, eq } from "drizzle-orm";
import crypto from "crypto";

// Return types for translation router
type GetTranslationsResult = {
  translations: TranslationCache[];
  total: number;
  hasMore: boolean;
};

type GetStatisticsResult = {
  totalTranslations: number;
  totalQueries: number;
  uniqueLanguagePairs: number;
  mostFrequent: TranslationCache | null;
};

type SearchTranslationsResult = TranslationCache[];

type DeleteTranslationResult = {
  success: true;
};

type SaveWordSuccess = {
  success: true;
  alreadySaved: boolean;
  id: string;
};

type UnsaveWordResult = {
  success: true;
};

type TranslationContextItem = {
  id: string;
  translationId: string;
  videoId: string;
  timestampSeconds: number;
  contextText: string | null;
  createdAt: number;
  videoTitle: string | null;
  videoThumbnailUrl: string | null;
  videoThumbnailPath: string | null;
  videoDuration: number | null;
};

type GetTranslationContextsResult = TranslationContextItem[];

type VideoTranslationItem = {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  detectedLang: string | null;
  queryCount: number;
  timestampSeconds: number;
};

type GetByVideoIdResult = VideoTranslationItem[];

type SavedWordItem = {
  id: string;
  notes: string | null;
  reviewCount: number;
  lastReviewedAt: number | null;
  createdAt: number;
  translation: TranslationCache;
};

type GetSavedWordsResult = {
  words: SavedWordItem[];
  total: number;
  hasMore: boolean;
};

type IsWordSavedResult = {
  isSaved: boolean;
};

type SavedWordForHighlight = {
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  queryCount: number;
};

type GetAllSavedWordsResult = SavedWordForHighlight[];

/**
 * Translation router - handles translation cache and learning features
 */
export const translationRouter = t.router({
  /**
   * Get all translations, sorted by most recent or most queried
   */
  getTranslations: publicProcedure
    .input(
      z.object({
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
        sortBy: z.enum(["recent", "frequent"]).optional().default("recent"),
      })
    )
    .query(async ({ ctx, input }): Promise<GetTranslationsResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        const orderColumn =
          input.sortBy === "frequent"
            ? desc(translationCache.queryCount)
            : desc(translationCache.lastQueriedAt);

        const translations = await db
          .select()
          .from(translationCache)
          .orderBy(orderColumn)
          .limit(input.limit)
          .offset(input.offset);

        // Get total count for pagination
        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(translationCache);

        const total = countResult?.count ?? 0;

        logger.debug("[translation] getTranslations", {
          count: translations.length,
          total,
          sortBy: input.sortBy,
        });

        return {
          translations,
          total,
          hasMore: input.offset + translations.length < total,
        };
      } catch (error) {
        logger.error("[translation] getTranslations failed", error);
        throw error;
      }
    }),

  /**
   * Get translation statistics
   */
  getStatistics: publicProcedure.query(async ({ ctx }): Promise<GetStatisticsResult> => {
    const db = ctx.db ?? defaultDb;

    try {
      // Total translations count
      const [totalResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(translationCache);

      const totalTranslations = totalResult?.count ?? 0;

      // Total queries count
      const [queriesResult] = await db
        .select({ total: sql<number>`sum(query_count)` })
        .from(translationCache);

      const totalQueries = queriesResult?.total ?? 0;

      // Most frequent translation
      const mostFrequent = await db
        .select()
        .from(translationCache)
        .orderBy(desc(translationCache.queryCount))
        .limit(1);

      // Count unique language pairs
      const [languagePairsResult] = await db
        .select({
          count: sql<number>`count(distinct source_lang || '->' || target_lang)`,
        })
        .from(translationCache);

      const uniqueLanguagePairs = languagePairsResult?.count ?? 0;

      logger.debug("[translation] getStatistics", {
        totalTranslations,
        totalQueries,
        uniqueLanguagePairs,
      });

      return {
        totalTranslations,
        totalQueries,
        uniqueLanguagePairs,
        mostFrequent: mostFrequent[0] || null,
      };
    } catch (error) {
      logger.error("[translation] getStatistics failed", error);
      throw error;
    }
  }),

  /**
   * Search translations by text
   */
  searchTranslations: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().optional().default(50),
      })
    )
    .query(async ({ ctx, input }): Promise<SearchTranslationsResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        const searchPattern = `%${input.query.toLowerCase()}%`;

        const results = await db
          .select()
          .from(translationCache)
          .where(
            sql`lower(${translationCache.sourceText}) like ${searchPattern}
                or lower(${translationCache.translatedText}) like ${searchPattern}`
          )
          .orderBy(desc(translationCache.queryCount))
          .limit(input.limit);

        logger.debug("[translation] searchTranslations", {
          query: input.query,
          count: results.length,
        });

        return results;
      } catch (error) {
        logger.error("[translation] searchTranslations failed", error);
        throw error;
      }
    }),

  /**
   * Delete a translation from cache
   */
  deleteTranslation: publicProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ ctx, input }): Promise<DeleteTranslationResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        await db.delete(translationCache).where(sql`${translationCache.id} = ${input.id}`);

        logger.info("[translation] Deleted translation", { id: input.id });

        return { success: true };
      } catch (error) {
        logger.error("[translation] deleteTranslation failed", error);
        throw error;
      }
    }),

  /**
   * Get video contexts for a specific translation
   * Returns all videos and timestamps where this word/phrase was translated
   */
  getTranslationContexts: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
      })
    )
    .query(async ({ ctx, input }): Promise<GetTranslationContextsResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        // Fetch contexts with video metadata
        const contexts = await db
          .select({
            id: translationContexts.id,
            translationId: translationContexts.translationId,
            videoId: translationContexts.videoId,
            timestampSeconds: translationContexts.timestampSeconds,
            contextText: translationContexts.contextText,
            createdAt: translationContexts.createdAt,
            // Video metadata
            videoTitle: youtubeVideos.title,
            videoThumbnailUrl: youtubeVideos.thumbnailUrl,
            videoThumbnailPath: youtubeVideos.thumbnailPath,
            videoDuration: youtubeVideos.durationSeconds,
          })
          .from(translationContexts)
          .leftJoin(youtubeVideos, eq(translationContexts.videoId, youtubeVideos.videoId))
          .where(eq(translationContexts.translationId, input.translationId))
          .orderBy(desc(translationContexts.createdAt));

        logger.debug("[translation] getTranslationContexts", {
          translationId: input.translationId,
          count: contexts.length,
        });

        return contexts;
      } catch (error) {
        logger.error("[translation] getTranslationContexts failed", error);
        throw error;
      }
    }),

  /**
   * Get all translations for a specific video (for inline display)
   * Returns translations with their source text for matching against transcript
   */
  getByVideoId: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
      })
    )
    .query(async ({ ctx, input }): Promise<GetByVideoIdResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        // Fetch all translations for this video via contexts
        const videoTranslations = await db
          .select({
            id: translationCache.id,
            sourceText: translationCache.sourceText,
            translatedText: translationCache.translatedText,
            sourceLang: translationCache.sourceLang,
            targetLang: translationCache.targetLang,
            detectedLang: translationCache.detectedLang,
            queryCount: translationCache.queryCount,
            timestampSeconds: translationContexts.timestampSeconds,
          })
          .from(translationContexts)
          .innerJoin(translationCache, eq(translationContexts.translationId, translationCache.id))
          .where(eq(translationContexts.videoId, input.videoId))
          .orderBy(desc(translationCache.queryCount)); // Most frequent first for better matching

        logger.debug("[translation] getByVideoId", {
          videoId: input.videoId,
          count: videoTranslations.length,
        });

        return videoTranslations;
      } catch (error) {
        logger.error("[translation] getByVideoId failed", error);
        throw error;
      }
    }),

  /**
   * Save a word to the user's learning list
   * Creates a saved_words entry for the translation
   * Also automatically creates a flashcard for the word
   */
  saveWord: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
        notes: z.string().optional(),
        // Optional video context for flashcard
        videoId: z.string().optional(),
        timestampSeconds: z.number().optional(),
        contextText: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }): Promise<SaveWordSuccess> => {
      const db = ctx.db ?? defaultDb;

      try {
        const now = Date.now();

        // Check if already saved
        const existing = await db
          .select()
          .from(savedWords)
          .where(eq(savedWords.translationId, input.translationId))
          .limit(1);

        if (existing.length > 0) {
          // Already saved, just update notes if provided
          if (input.notes !== undefined) {
            await db
              .update(savedWords)
              .set({ notes: input.notes, updatedAt: now })
              .where(eq(savedWords.id, existing[0].id));
          }
          logger.debug("[translation] Word already saved", { translationId: input.translationId });
          return { success: true, alreadySaved: true, id: existing[0].id };
        }

        // Create new saved word entry
        const id = crypto.randomUUID();
        await db.insert(savedWords).values({
          id,
          translationId: input.translationId,
          notes: input.notes ?? null,
          reviewCount: 0,
          lastReviewedAt: null,
          createdAt: now,
          updatedAt: now,
        });

        // Auto-create flashcard for this word
        try {
          // Get translation for flashcard content
          const translation = await db
            .select()
            .from(translationCache)
            .where(eq(translationCache.id, input.translationId))
            .limit(1);

          if (translation.length > 0) {
            const { flashcards } = await import("@/api/db/schema");

            const frontContent = translation[0].sourceText;

            // Check if flashcard with this front content already exists
            const existingFlashcard = await db
              .select()
              .from(flashcards)
              .where(eq(flashcards.frontContent, frontContent))
              .limit(1);

            if (existingFlashcard.length > 0) {
              logger.info("[translation] Flashcard already exists for word", {
                word: frontContent,
                flashcardId: existingFlashcard[0].id,
              });
              // Skip creation
            } else {
              // Build back content: notes (if any) + translation in brackets
              let backContent = "";
              if (input.notes && input.notes.trim()) {
                backContent = input.notes.trim();
              }
              if (backContent) {
                backContent += `\n\n[${translation[0].translatedText}]`;
              } else {
                backContent = `[${translation[0].translatedText}]`;
              }

              // Get video context if not provided
              let videoId = input.videoId;
              let timestampSeconds = input.timestampSeconds;
              let contextText = input.contextText;

              if (!videoId) {
                // Try to get from translation contexts
                const contexts = await db
                  .select({
                    videoId: translationContexts.videoId,
                    timestampSeconds: translationContexts.timestampSeconds,
                    contextText: translationContexts.contextText,
                  })
                  .from(translationContexts)
                  .where(eq(translationContexts.translationId, input.translationId))
                  .orderBy(desc(translationContexts.createdAt))
                  .limit(1);

                if (contexts.length > 0) {
                  videoId = contexts[0].videoId;
                  timestampSeconds = contexts[0].timestampSeconds;
                  contextText = contexts[0].contextText ?? undefined;
                }
              }

              const flashcardId = crypto.randomUUID();
              const nowIso = new Date().toISOString();

              await db.insert(flashcards).values({
                id: flashcardId,
                videoId: videoId ?? null,
                frontContent,
                backContent,
                contextText: contextText ?? null,
                audioUrl: null,
                timestampSeconds: timestampSeconds ?? null,
                difficulty: 0,
                reviewCount: 0,
                interval: 0,
                easeFactor: 250,
                nextReviewAt: nowIso,
                createdAt: nowIso,
                updatedAt: nowIso,
              });

              logger.info("[translation] Auto-created flashcard for saved word", {
                translationId: input.translationId,
                flashcardId,
              });
            }
          }
        } catch (flashcardError) {
          // Don't fail the save if flashcard creation fails
          logger.warn("[translation] Failed to auto-create flashcard", flashcardError);
        }

        logger.info("[translation] Word saved", { translationId: input.translationId });
        return { success: true, alreadySaved: false, id };
      } catch (error) {
        logger.error("[translation] saveWord failed", error);
        throw error;
      }
    }),

  /**
   * Remove a word from the user's learning list
   */
  unsaveWord: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }): Promise<UnsaveWordResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        await db.delete(savedWords).where(eq(savedWords.translationId, input.translationId));

        logger.info("[translation] Word unsaved", { translationId: input.translationId });
        return { success: true };
      } catch (error) {
        logger.error("[translation] unsaveWord failed", error);
        throw error;
      }
    }),

  /**
   * Get all saved words with their translations
   */
  getSavedWords: publicProcedure
    .input(
      z.object({
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      })
    )
    .query(async ({ ctx, input }): Promise<GetSavedWordsResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        const words = await db
          .select({
            id: savedWords.id,
            notes: savedWords.notes,
            reviewCount: savedWords.reviewCount,
            lastReviewedAt: savedWords.lastReviewedAt,
            createdAt: savedWords.createdAt,
            translation: translationCache,
          })
          .from(savedWords)
          .innerJoin(translationCache, eq(savedWords.translationId, translationCache.id))
          .orderBy(desc(savedWords.createdAt))
          .limit(input.limit)
          .offset(input.offset);

        const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(savedWords);

        const total = countResult?.count ?? 0;

        logger.debug("[translation] getSavedWords", { count: words.length, total });

        return {
          words,
          total,
          hasMore: input.offset + words.length < total,
        };
      } catch (error) {
        logger.error("[translation] getSavedWords failed", error);
        throw error;
      }
    }),

  /**
   * Check if a translation is saved
   */
  isWordSaved: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
      })
    )
    .query(async ({ ctx, input }): Promise<IsWordSavedResult> => {
      const db = ctx.db ?? defaultDb;

      try {
        const saved = await db
          .select()
          .from(savedWords)
          .where(eq(savedWords.translationId, input.translationId))
          .limit(1);

        return { isSaved: saved.length > 0 };
      } catch (error) {
        logger.error("[translation] isWordSaved failed", error);
        throw error;
      }
    }),

  /**
   * Get all saved words for transcript highlighting
   * Returns all saved words with their translations (no pagination)
   * Used to build lookup map for highlighting in transcripts
   */
  getAllSavedWords: publicProcedure.query(async ({ ctx }): Promise<GetAllSavedWordsResult> => {
    const db = ctx.db ?? defaultDb;

    try {
      const words = await db
        .select({
          sourceText: translationCache.sourceText,
          translatedText: translationCache.translatedText,
          sourceLang: translationCache.sourceLang,
          targetLang: translationCache.targetLang,
          queryCount: translationCache.queryCount,
        })
        .from(savedWords)
        .innerJoin(translationCache, eq(savedWords.translationId, translationCache.id))
        .orderBy(desc(translationCache.queryCount)); // Most frequently used first

      logger.debug("[translation] getAllSavedWords", { count: words.length });

      return words;
    } catch (error) {
      logger.error("[translation] getAllSavedWords failed", error);
      throw error;
    }
  }),
});

// Router type not exported (unused)

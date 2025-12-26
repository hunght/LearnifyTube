import { z } from "zod";
import { publicProcedure, t } from "@/api/trpc";
import { eq, desc, asc, lte } from "drizzle-orm";
import { flashcards } from "@/api/db/schema";
import defaultDb from "@/api/db";
import { TRPCError } from "@trpc/server";

// Spaced Repetition Algorithm (SM-2 based)
// Grade: 0-5 (0=blackout, 5=perfect)
// In UI we might simplify to: Again(1), Hard(2), Good(3), Easy(4), or map to 0-5
// Simplified mapping:
// Again -> 1 (Fail)
// Hard -> 3 (Pass, hard)
// Good -> 4 (Pass, good)
// Easy -> 5 (Pass, easy)

const calculateNextReview = (
  previousInterval: number,
  previousEaseFactor: number,
  grade: number
): { newInterval: number; newEaseFactor: number } => {
  let newInterval = 0;
  let newEaseFactor = previousEaseFactor;

  if (grade >= 3) {
    if (previousInterval === 0) {
      newInterval = 1;
    } else if (previousInterval === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(previousInterval * previousEaseFactor);
    }

    newEaseFactor = previousEaseFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
    if (newEaseFactor < 1.3) newEaseFactor = 1.3;
  } else {
    newInterval = 1;
    // Ease factor doesn't change on fail in some variants, or drops.
    // SM-2: EF doesn't change on fail? Actually original SM-2 says "If the quality response was lower than 3 then start repetitions for the item from the beginning... without changing the E-Factor".
    // We'll keep EF same on fail.
  }

  return { newInterval, newEaseFactor };
};

export const flashcardsRouter = t.router({
  // Create a flashcard from a saved word
  create: publicProcedure
    .input(
      z.object({
        translationId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;
      const now = new Date().toISOString();
      const id = crypto.randomUUID();

      // Import necessary schemas
      const { translationCache, translationContexts, savedWords } = await import("@/api/db/schema");

      // 1. Fetch the translation
      const translation = await db
        .select()
        .from(translationCache)
        .where(eq(translationCache.id, input.translationId))
        .limit(1)
        .get();

      if (!translation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Translation not found" });
      }

      const frontContent = translation.sourceText;

      // Check if flashcard with this front content already exists
      const existingFlashcard = await db
        .select()
        .from(flashcards)
        .where(eq(flashcards.frontContent, frontContent))
        .limit(1)
        .get();

      if (existingFlashcard) {
        return { success: true, id: existingFlashcard.id };
      }

      // 2. Fetch saved word notes (if this translation is saved)
      const savedWord = await db
        .select()
        .from(savedWords)
        .where(eq(savedWords.translationId, input.translationId))
        .limit(1)
        .get();

      // 3. Build back content: notes (if any) + translation in brackets
      let backContent = "";
      if (savedWord?.notes && savedWord.notes.trim()) {
        backContent = savedWord.notes.trim();
      }

      // Add translation in brackets
      if (backContent) {
        backContent += `\n\n[${translation.translatedText}]`;
      } else {
        backContent = `[${translation.translatedText}]`;
      }

      // 4. Fetch best context (most recent)
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

      const bestContext = contexts[0];
      const videoId = bestContext?.videoId;
      const contextText = bestContext?.contextText ?? undefined;
      const timestampSeconds = bestContext?.timestampSeconds;

      await db.insert(flashcards).values({
        id,
        videoId,
        frontContent,
        backContent,
        contextText,
        audioUrl: undefined,
        timestampSeconds,
        // Initial state
        difficulty: 0,
        reviewCount: 0,
        interval: 0,
        easeFactor: 250, // x100
        nextReviewAt: now, // Due immediately
        createdAt: now,
        updatedAt: now,
      });

      return { success: true, id };
    }),

  // List all flashcards (for management)
  list: publicProcedure.query(async ({ ctx }) => {
    const db = ctx.db ?? defaultDb;
    return await db.select().from(flashcards).orderBy(desc(flashcards.createdAt));
  }),

  // Get due flashcards for study
  getDue: publicProcedure.query(async ({ ctx }) => {
    const db = ctx.db ?? defaultDb;
    const now = new Date().toISOString();

    return await db
      .select()
      .from(flashcards)
      .where(lte(flashcards.nextReviewAt, now))
      .orderBy(asc(flashcards.nextReviewAt)); // Oldest due first
  }),

  // Delete a flashcard
  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const db = ctx.db ?? defaultDb;
    await db.delete(flashcards).where(eq(flashcards.id, input.id));
    return { success: true };
  }),

  // Review a flashcard (Apply SRS)
  review: publicProcedure
    .input(
      z.object({
        id: z.string(),
        grade: z.number().min(0).max(5), // 0-5
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = ctx.db ?? defaultDb;

      const card = await db.select().from(flashcards).where(eq(flashcards.id, input.id)).get();

      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Flashcard not found" });
      }

      const currentEase = (card.easeFactor ?? 250) / 100;
      const currentInterval = card.interval ?? 0;

      const { newInterval, newEaseFactor } = calculateNextReview(
        currentInterval,
        currentEase,
        input.grade
      );

      // Calculate next date
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + newInterval);

      await db
        .update(flashcards)
        .set({
          interval: newInterval,
          easeFactor: Math.round(newEaseFactor * 100),
          nextReviewAt: nextDate.toISOString(),
          reviewCount: (card.reviewCount ?? 0) + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(flashcards.id, input.id));

      return { success: true, nextReview: nextDate.toISOString() };
    }),

  // Auto-create from Saved Words (Bulk import utility)
  // This could be useful if user wants to existing words to flashcards
  importSavedWords: publicProcedure.mutation(async () => {
    // Implementation deferred - can be done in UI via create loop or bulk insert
    return { success: true, message: "Use create mutation loop for now" };
  }),
});

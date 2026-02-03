import { z } from "zod";
import { t, publicProcedure } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import db from "@/api/db";
import {
  videoSummaries,
  flashcards,
  videoTranscripts,
  youtubeVideos,
  savedWords,
  translationCache,
  quizResults,
  generatedQuizzes,
} from "@/api/db/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";

// ============================================================================
// VibeProxy Configuration
// ============================================================================

/**
 * VibeProxy provides OpenAI-compatible endpoints for various AI providers.
 *
 * It's a native macOS menu bar app that handles OAuth authentication
 * automatically. Users sign in with their existing AI subscriptions
 * (Google/Gemini, ChatGPT Plus, Claude Pro) - no API keys needed.
 *
 * Supported providers:
 * - Gemini (free with Google account, or via Antigravity)
 * - OpenAI Codex (ChatGPT Plus/Pro subscription)
 * - Claude Code (Claude Pro/Max subscription)
 * - Qwen (free)
 * - GitHub Copilot
 * - Antigravity (Gemini 3 Pro)
 *
 * Features:
 * - 🎯 One-click OAuth authentication
 * - 👥 Multi-account support with automatic failover
 * - 🔄 Automatic token refresh
 * - 📊 Real-time status in menu bar
 *
 * Setup:
 * 1. Download from https://github.com/automazeio/vibeproxy/releases
 * 2. Drag to /Applications and launch
 * 3. Click menu bar icon → "Connect" for your preferred provider
 *
 * @see https://github.com/automazeio/vibeproxy
 */

// VibeProxy runs on port 8317 by default
const VIBEPROXY_API_URL = process.env.VIBEPROXY_API_URL || "http://localhost:8317";

// Default model - depends on authenticated providers
// Gemini: gemini-2.5-flash, gemini-2.5-pro, gemini-3-pro
// OpenAI: gpt-5, gpt-5.1, gpt-5.1-codex
// Claude: claude-sonnet-4.5, claude-opus-4.5
const VIBEPROXY_MODEL = process.env.VIBEPROXY_MODEL || "gemini-2.5-flash";

// Optional API key (if VibeProxy is configured with access tokens)
const VIBEPROXY_API_KEY = process.env.VIBEPROXY_API_KEY || "";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const chatCompletionResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    })
  ),
});

const transcriptSegmentsSchema = z.array(z.object({ text: z.string() }));

const summarySchema = z
  .object({
    summary: z.string().optional(),
    overview: z.string().optional(),
    sections: z
      .array(
        z.object({
          title: z.string(),
          summary: z.string(),
          startTime: z.string().optional(),
        })
      )
      .optional(),
    keyTakeaways: z.array(z.string()).optional(),
    vocabulary: z
      .union([
        z.array(z.string()), // Old format (backward compatibility)
        z.array(z.object({ word: z.string(), definition: z.string() })), // New format
      ])
      .optional(),
    keyPoints: z
      .array(
        z.object({
          point: z.string(),
          timestamp: z.string().optional(),
        })
      )
      .optional(),
    mainTopics: z.array(z.string()).optional(),
  })
  .passthrough();

const explanationSchema = z
  .object({
    explanation: z.string(),
    examples: z.array(z.string()).optional(),
    relatedConcepts: z.array(z.string()).optional(),
  })
  .passthrough();

const vocabularyExtractionSchema = z.array(
  z.object({
    word: z.string(),
    definition: z.string(),
    example: z.string().optional(),
  })
);

const quizQuestionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  question: z.string(),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string(),
  explanation: z.string().optional(),
});

const quizSchema = z
  .object({
    questions: z.array(quizQuestionSchema),
  })
  .passthrough();

const grammarSchema = z
  .object({
    partOfSpeech: z.string().optional(),
    baseForm: z.string().optional(),
    conjugation: z.string().optional(),
    usage: z.string().optional(),
    examples: z.array(z.string()).optional(),
  })
  .passthrough();

function parseWithSchema<T>(raw: string, schema: z.ZodType<T>): T {
  const parsedJson: unknown = JSON.parse(raw);
  const parsed = schema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(parsed.error.message);
  }

  return parsed.data;
}

/**
 * Call VibeProxy to generate AI responses.
 *
 * VibeProxy must be running (check menu bar icon) with at least one
 * provider authenticated. Click "Connect" in the VibeProxy settings
 * to authenticate with your Google/ChatGPT/Claude account.
 *
 * @throws Error if VibeProxy is not running or no providers are authenticated
 */
async function callAI(messages: ChatMessage[]): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add API key if configured
  if (VIBEPROXY_API_KEY) {
    headers["Authorization"] = `Bearer ${VIBEPROXY_API_KEY}`;
  }

  try {
    const response = await fetch(`${VIBEPROXY_API_URL}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: VIBEPROXY_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (response.ok) {
      const rawData: unknown = await response.json();
      const parsed = chatCompletionResponseSchema.safeParse(rawData);
      if (parsed.success && parsed.data.choices.length > 0) {
        return parsed.data.choices[0]?.message?.content || "";
      }
      return "";
    }

    // Handle specific error cases
    const errorText = await response.text().catch(() => "");

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "AI authentication required. Please open VibeProxy and click 'Connect' to authenticate."
      );
    }

    if (response.status === 404) {
      throw new Error(
        `Model "${VIBEPROXY_MODEL}" not available. Please authenticate with a provider that supports this model.`
      );
    }

    logger.error("VibeProxy request failed", {
      status: response.status,
      error: errorText,
    });

    throw new Error(
      `AI request failed (${response.status}). Please check that VibeProxy is running (check your menu bar).`
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("AI")) {
      throw error; // Re-throw our custom errors
    }

    // Connection error - VibeProxy not running
    logger.warn("VibeProxy not available", { error });
    throw new Error(
      "Cannot connect to AI service. Please ensure VibeProxy is running.\n\n" +
        "Setup (macOS only):\n" +
        "1. Download VibeProxy: https://github.com/automazeio/vibeproxy/releases\n" +
        "2. Drag to Applications and launch\n" +
        "3. Click the menu bar icon → 'Connect' for Gemini (free)\n" +
        "4. Keep VibeProxy running while using LearnifyTube"
    );
  }
}

// ============================================================================
// Input Schemas
// ============================================================================

const summarizeInputSchema = z.object({
  videoId: z.string(),
  type: z.enum(["quick", "detailed", "key_points"]).default("detailed"),
  language: z.string().default("en"),
  forceRegenerate: z.boolean().optional().default(false),
});

const explainInputSchema = z.object({
  text: z.string().min(1).max(5000),
  level: z.enum(["simple", "standard", "advanced"]).default("standard"),
  context: z.string().optional(),
  videoId: z.string().optional(),
});

const chatInputSchema = z.object({
  videoId: z.string(),
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .optional()
    .default([]),
});

const generateFlashcardsInputSchema = z.object({
  videoId: z.string(),
  fromSavedWords: z.boolean().default(true),
  maxCards: z.number().min(1).max(50).default(20),
});

const generateQuizInputSchema = z.object({
  videoId: z.string(),
  type: z.enum(["multiple_choice", "true_false", "fill_blank"]).default("multiple_choice"),
  numQuestions: z.number().min(3).max(20).default(5),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get transcript text for a video
 */
async function getTranscriptText(videoId: string): Promise<string | null> {
  const results = await db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.videoId, videoId))
    .limit(1);

  const result = results[0];
  if (!result) return null;

  // Try to extract text from segments if available
  if (result.segmentsJson) {
    try {
      const segments = transcriptSegmentsSchema.safeParse(JSON.parse(result.segmentsJson));
      if (segments.success) {
        return segments.data.map((s) => s.text).join(" ");
      }
    } catch {
      // Fall back to plain text
    }
  }

  return result.text || null;
}

/**
 * Get video metadata
 */
async function getVideoMetadata(
  videoId: string
): Promise<{ title: string; description: string | null } | null> {
  const results = await db
    .select({
      title: youtubeVideos.title,
      description: youtubeVideos.description,
    })
    .from(youtubeVideos)
    .where(eq(youtubeVideos.videoId, videoId))
    .limit(1);

  return results[0] || null;
}

// ============================================================================
// AI Router
// ============================================================================

export const aiRouter = t.router({
  /**
   * Get cached summary if it exists
   */
  getSummary: publicProcedure.input(summarizeInputSchema).query(async ({ input }) => {
    const { videoId, type, language } = input;

    const results = await db
      .select()
      .from(videoSummaries)
      .where(
        and(
          eq(videoSummaries.videoId, videoId),
          eq(videoSummaries.summaryType, type),
          eq(videoSummaries.language, language)
        )
      )
      .limit(1);

    const cached = results[0];

    if (cached) {
      const cachedSummary = summarySchema.safeParse(JSON.parse(cached.content));

      if (cachedSummary.success) {
        return {
          success: true,
          summary: cachedSummary.data,
          cached: true,
        };
      }

      logger.warn("Invalid cached summary content", {
        videoId,
        type,
        language,
        issues: cachedSummary.error.issues,
      });

      return {
        success: false,
        error: "Cached summary data was invalid. Please regenerate.",
      };
    }

    return null;
  }),

  /**
   * Generate a summary of the video content
   */
  summarize: publicProcedure.input(summarizeInputSchema).mutation(async ({ input }) => {
    const { videoId, type, language, forceRegenerate } = input;

    // If force regenerate, delete existing cache
    if (forceRegenerate) {
      await db
        .delete(videoSummaries)
        .where(
          and(
            eq(videoSummaries.videoId, videoId),
            eq(videoSummaries.summaryType, type),
            eq(videoSummaries.language, language)
          )
        );
      logger.info("Deleted cached summary for regeneration", { videoId, type });
    } else {
      // Check for cached summary only if not forcing regeneration
      const cachedResults = await db
        .select()
        .from(videoSummaries)
        .where(
          and(
            eq(videoSummaries.videoId, videoId),
            eq(videoSummaries.summaryType, type),
            eq(videoSummaries.language, language)
          )
        )
        .limit(1);

      const cached = cachedResults[0];

      if (cached) {
        logger.info("Returning cached summary", { videoId, type });
        const cachedSummary = summarySchema.safeParse(JSON.parse(cached.content));

        if (cachedSummary.success) {
          return {
            success: true,
            summary: cachedSummary.data,
            cached: true,
          };
        }

        logger.warn("Failed to parse cached summary", {
          videoId,
          type,
          language,
          issues: cachedSummary.error.issues,
        });

        return {
          success: false,
          error: "Cached summary was invalid. Please regenerate.",
        };
      }
    }

    // Get transcript
    const transcript = await getTranscriptText(videoId);
    const metadata = await getVideoMetadata(videoId);
    const videoTitle = metadata?.title || "Unknown Video";
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Build context based on available data
    let contextInfo = "";
    if (transcript) {
      contextInfo = `Transcript:\n${transcript.slice(0, 20000)}`;
    } else {
      // No transcript available, provide video URL for AI to analyze
      contextInfo = `Video URL: ${videoUrl}\n\nNote: This video does not have a transcript available. Please analyze the video directly from the URL above.`;
    }

    // Build prompt based on summary type
    let prompt = "";
    const systemPrompt =
      "You are an expert content summarizer. Provide accurate, helpful summaries.";

    switch (type) {
      case "quick":
        prompt = `Provide a 2-3 sentence summary of this video titled "${videoTitle}".

${contextInfo}

Respond with a JSON object: { "summary": "..." }`;
        break;

      case "key_points":
        prompt = `Extract the key points from this video titled "${videoTitle}".

${contextInfo}

Respond with a JSON object:
{
  "keyPoints": [
    { "point": "...", "timestamp": "estimated timestamp if possible, e.g., '2:30'" }
  ],
  "mainTopics": ["topic1", "topic2", ...],
  "vocabulary": [{"word": "term", "definition": "brief definition"}, ...]
}`;
        break;

      case "detailed":
      default:
        prompt = `Create a detailed summary of this video titled "${videoTitle}".

${contextInfo}

Respond with a JSON object:
{
  "overview": "2-3 sentence overview",
  "sections": [
    { "title": "Section title", "summary": "Section summary", "startTime": "estimated timestamp" }
  ],
  "keyTakeaways": ["takeaway 1", "takeaway 2", ...],
  "vocabulary": [{"word": "term", "definition": "brief definition"}, ...]
}`;
        break;
    }

    try {
      const response = await callAI([
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ]);

      // Parse JSON from response (handle markdown code blocks)
      let jsonStr = response;
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const summary = parseWithSchema(jsonStr.trim(), summarySchema);

      // Cache the result
      await db.insert(videoSummaries).values({
        id: randomUUID(),
        videoId,
        summaryType: type,
        content: JSON.stringify(summary),
        language,
        createdAt: new Date().toISOString(),
      });

      logger.info("Generated and cached summary", { videoId, type });

      return {
        success: true,
        summary,
        cached: false,
      };
    } catch (error) {
      logger.error("Failed to generate summary", { error, videoId });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate summary",
      };
    }
  }),

  /**
   * Explain selected text at different difficulty levels
   */
  explain: publicProcedure.input(explainInputSchema).mutation(async ({ input }) => {
    const { text, level, context, videoId } = input;

    const levelInstructions = {
      simple:
        "Explain this like I'm 5 years old. Use simple words, everyday analogies, and short sentences. Avoid jargon completely.",
      standard:
        "Explain this clearly for a general audience. Use some technical terms but define them. Include relevant examples.",
      advanced:
        "Provide an in-depth explanation for someone with expertise. Include technical details, nuances, and connections to related concepts.",
    };

    let contextInfo = "";
    if (context) {
      contextInfo = `\n\nContext from the video: "${context}"`;
    }
    if (videoId) {
      const metadata = await getVideoMetadata(videoId);
      if (metadata) {
        contextInfo += `\n\nThis is from a video titled: "${metadata.title}"`;
      }
    }

    const prompt = `${levelInstructions[level]}

Text to explain: "${text}"${contextInfo}

Respond with a JSON object:
{
  "explanation": "Your explanation here",
  "examples": ["example 1 if helpful", "example 2 if helpful"],
  "relatedConcepts": ["related concept 1", "related concept 2"]
}`;

    try {
      const response = await callAI([
        {
          role: "system",
          content: "You are a skilled educator who adapts explanations to different levels.",
        },
        { role: "user", content: prompt },
      ]);

      // Parse JSON from response
      let jsonStr = response;
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const explanation = parseWithSchema(jsonStr.trim(), explanationSchema);

      return {
        success: true,
        ...explanation,
      };
    } catch (error) {
      logger.error("Failed to generate explanation", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate explanation",
      };
    }
  }),

  /**
   * Interactive Q&A chat about video content
   */
  chat: publicProcedure.input(chatInputSchema).mutation(async ({ input }) => {
    const { videoId, message, history } = input;

    // Get transcript and metadata
    const transcript = await getTranscriptText(videoId);
    const metadata = await getVideoMetadata(videoId);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Build conversation context
    let videoContext = "";
    if (transcript) {
      videoContext = `Video Transcript (for reference):
${transcript.slice(0, 15000)}`;
    } else {
      videoContext = `Video URL: ${videoUrl}

Note: This video does not have a transcript available. Please analyze the video directly from the URL above to answer questions.`;
    }

    const systemMessage = `You are a helpful AI assistant that answers questions about a specific YouTube video.

Video Title: ${metadata?.title || "Unknown"}
Video Description: ${metadata?.description?.slice(0, 500) || "No description"}

${videoContext}

Rules:
- Answer questions based on the video content
- If asked about something not in the video, say so
- Provide timestamps when referencing specific parts
- Be concise but thorough`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemMessage },
      ...history.map((h) => {
        const role = h.role === "user" || h.role === "assistant" ? h.role : "user";
        return { role, content: h.content };
      }),
      { role: "user", content: message },
    ];

    try {
      const response = await callAI(messages);

      return {
        success: true,
        response,
      };
    } catch (error) {
      logger.error("Failed to generate chat response", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate response",
      };
    }
  }),

  /**
   * Generate flashcards from saved words or video vocabulary
   */
  generateFlashcards: publicProcedure
    .input(generateFlashcardsInputSchema)
    .mutation(async ({ input }) => {
      const { videoId, fromSavedWords, maxCards } = input;

      // Get saved words for this video if requested
      let vocabulary: Array<{ word: string; translation: string; context?: string }> = [];

      if (fromSavedWords) {
        // Get saved words with their translations
        const savedWordsResult = await db
          .select({
            notes: savedWords.notes,
            sourceText: translationCache.sourceText,
            translatedText: translationCache.translatedText,
          })
          .from(savedWords)
          .leftJoin(translationCache, eq(savedWords.translationId, translationCache.id))
          .limit(maxCards);

        vocabulary = savedWordsResult.map((sw) => {
          // Combine translation with notes for richer back content
          let backContent = sw.translatedText || "";
          if (sw.notes && sw.notes.trim()) {
            backContent += `\n\n${sw.notes}`;
          }

          return {
            word: sw.sourceText || "",
            translation: backContent,
            context: undefined,
          };
        });
      }

      // If not enough saved words, generate from transcript
      if (vocabulary.length < maxCards) {
        const transcript = await getTranscriptText(videoId);
        if (transcript) {
          const prompt = `Extract ${maxCards - vocabulary.length} important vocabulary words from this transcript for language learning.

Transcript:
${transcript.slice(0, 10000)}

Respond with a JSON array:
[
  { "word": "vocabulary word", "definition": "brief definition", "example": "example sentence from video" }
]`;

          try {
            const response = await callAI([
              { role: "system", content: "You are a language learning expert." },
              { role: "user", content: prompt },
            ]);

            let jsonStr = response;
            const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
              jsonStr = jsonMatch[1];
            }

            const extracted = parseWithSchema(jsonStr.trim(), vocabularyExtractionSchema);

            for (const item of extracted) {
              vocabulary.push({
                word: item.word,
                translation: item.definition,
                context: item.example,
              });
            }
          } catch (error) {
            logger.error("Failed to extract vocabulary", { error });
          }
        }
      }

      // Save flashcards to database
      const createdCards: Array<{ id: string; front: string; back: string; context?: string }> = [];
      for (const item of vocabulary.slice(0, maxCards)) {
        const id = randomUUID();
        await db.insert(flashcards).values({
          id,
          videoId,
          frontContent: item.word,
          backContent: item.translation,
          contextText: item.context || null,
          createdAt: new Date().toISOString(),
        });
        createdCards.push({
          id,
          front: item.word,
          back: item.translation,
          context: item.context,
        });
      }

      return {
        success: true,
        flashcards: createdCards,
        count: createdCards.length,
      };
    }),

  /**
   * Generate a quiz based on video content
   */
  generateQuiz: publicProcedure.input(generateQuizInputSchema).mutation(async ({ input }) => {
    const { videoId, type, numQuestions, difficulty } = input;

    const transcript = await getTranscriptText(videoId);
    const metadata = await getVideoMetadata(videoId);
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Build context based on available data
    let videoContext = "";
    if (transcript) {
      videoContext = `Transcript:
${transcript.slice(0, 15000)}`;
    } else {
      videoContext = `Video URL: ${videoUrl}

Note: This video does not have a transcript available. Please analyze the video directly from the URL above to create the quiz.`;
    }

    // Check query cache for quiz
    const cachedQuizzes = await db
      .select()
      .from(generatedQuizzes)
      .where(
        and(
          eq(generatedQuizzes.videoId, videoId),
          eq(generatedQuizzes.quizType, type),
          eq(generatedQuizzes.difficulty, difficulty),
          eq(generatedQuizzes.numQuestions, numQuestions)
        )
      )
      .limit(1);

    if (cachedQuizzes.length > 0) {
      logger.info("Returning cached quiz", { videoId, type, difficulty });
      const cachedQuiz = quizSchema.safeParse(JSON.parse(cachedQuizzes[0].content));

      if (cachedQuiz.success) {
        return {
          success: true,
          quiz: cachedQuiz.data,
          cached: true,
        };
      }

      logger.warn("Invalid cached quiz content", {
        videoId,
        type,
        difficulty,
        issues: cachedQuiz.error.issues,
      });
    }

    const typeInstructions = {
      multiple_choice:
        "Multiple choice questions with 4 options (A, B, C, D). Include the correct answer.",
      true_false: "True or False questions.",
      fill_blank: "Fill in the blank questions where key terms are removed.",
    };

    const difficultyInstructions = {
      easy: "Focus on main ideas and obvious facts.",
      medium: "Include detailed comprehension and some inference.",
      hard: "Test deep understanding, analysis, and application.",
    };

    const prompt = `Create a quiz based on this video titled "${metadata?.title || "Unknown"}".

${videoContext}

Requirements:
- Quiz type: ${typeInstructions[type]}
- Difficulty: ${difficultyInstructions[difficulty]}
- Number of questions: ${numQuestions}

Respond with a JSON object:
{
  "questions": [
    {
      "id": 1,
      "question": "Question text",
      "options": ["A", "B", "C", "D"] (for multiple choice only),
      "correctAnswer": "The correct answer",
      "explanation": "Brief explanation why this is correct"
    }
  ]
}`;

    try {
      const response = await callAI([
        { role: "system", content: "You are an expert quiz creator for educational content." },
        { role: "user", content: prompt },
      ]);

      let jsonStr = response;
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const quiz = parseWithSchema(jsonStr.trim(), quizSchema);

      // Cache the quiz
      await db.insert(generatedQuizzes).values({
        id: randomUUID(),
        videoId,
        quizType: type,
        difficulty,
        numQuestions,
        content: JSON.stringify(quiz),
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        quiz,
        cached: false,
      };
    } catch (error) {
      logger.error("Failed to generate quiz", { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate quiz",
      };
    }
  }),

  /**
   * Save quiz results
   */
  saveQuizResult: publicProcedure
    .input(
      z.object({
        videoId: z.string(),
        quizType: z.enum(["multiple_choice", "true_false", "fill_blank"]),
        score: z.number(),
        totalQuestions: z.number(),
        answers: z.record(z.unknown()), // JSON object of answers
      })
    )
    .mutation(async ({ input }) => {
      const { videoId, quizType, score, totalQuestions, answers } = input;

      const id = randomUUID();
      await db.insert(quizResults).values({
        id,
        videoId,
        quizType,
        score,
        totalQuestions,
        answers: JSON.stringify(answers),
        completedAt: new Date().toISOString(),
      });

      return { success: true, id };
    }),

  /**
   * Get grammar explanation for a word or phrase
   */
  grammarExplain: publicProcedure
    .input(
      z.object({
        text: z.string().min(1).max(200),
        targetLang: z.string().default("en"),
      })
    )
    .mutation(async ({ input }) => {
      const { text, targetLang } = input;

      const prompt = `Analyze the grammar of this word/phrase: "${text}"

Provide a JSON response:
{
  "partOfSpeech": "noun/verb/adjective/etc",
  "baseForm": "dictionary form if different",
  "conjugation": "if applicable, describe the conjugation/declension",
  "usage": "common usage patterns",
  "examples": ["example 1", "example 2"]
}`;

      try {
        const response = await callAI([
          { role: "system", content: `You are a grammar expert for ${targetLang}.` },
          { role: "user", content: prompt },
        ]);

        let jsonStr = response;
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }

        const grammar = parseWithSchema(jsonStr.trim(), grammarSchema);

        return {
          success: true,
          ...grammar,
        };
      } catch (error) {
        logger.error("Failed to analyze grammar", { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to analyze grammar",
        };
      }
    }),
});

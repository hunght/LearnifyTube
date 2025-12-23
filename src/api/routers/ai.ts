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
} from "@/api/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

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

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
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
      const data = (await response.json()) as ChatCompletionResponse;
      return data.choices[0]?.message?.content || "";
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
      const segments = JSON.parse(result.segmentsJson) as Array<{ text: string }>;
      return segments.map((s) => s.text).join(" ");
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
      return {
        success: true,
        summary: JSON.parse(cached.content),
        cached: true,
      };
    }

    return null;
  }),

  /**
   * Generate a summary of the video content
   */
  summarize: publicProcedure.input(summarizeInputSchema).mutation(async ({ input }) => {
    const { videoId, type, language } = input;

    // Check for cached summary
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
      return {
        success: true,
        summary: JSON.parse(cached.content),
        cached: true,
      };
    }

    // Get transcript
    const transcript = await getTranscriptText(videoId);
    if (!transcript) {
      return {
        success: false,
        error: "No transcript available for this video",
      };
    }

    const metadata = await getVideoMetadata(videoId);
    const videoTitle = metadata?.title || "Unknown Video";

    // Build prompt based on summary type
    let prompt = "";
    const systemPrompt =
      "You are an expert content summarizer. Provide accurate, helpful summaries.";

    switch (type) {
      case "quick":
        prompt = `Provide a 2-3 sentence summary of this video titled "${videoTitle}".

Transcript:
${transcript.slice(0, 10000)}

Respond with a JSON object: { "summary": "..." }`;
        break;

      case "key_points":
        prompt = `Extract the key points from this video titled "${videoTitle}".

Transcript:
${transcript.slice(0, 15000)}

Respond with a JSON object:
{
  "keyPoints": [
    { "point": "...", "timestamp": "estimated timestamp if possible, e.g., '2:30'" }
  ],
  "mainTopics": ["topic1", "topic2", ...],
  "vocabulary": ["important term 1", "important term 2", ...]
}`;
        break;

      case "detailed":
      default:
        prompt = `Create a detailed summary of this video titled "${videoTitle}".

Transcript:
${transcript.slice(0, 20000)}

Respond with a JSON object:
{
  "overview": "2-3 sentence overview",
  "sections": [
    { "title": "Section title", "summary": "Section summary", "startTime": "estimated timestamp" }
  ],
  "keyTakeaways": ["takeaway 1", "takeaway 2", ...],
  "vocabulary": ["important term 1", "important term 2", ...]
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

      const summary = JSON.parse(jsonStr.trim());

      // Cache the result
      await db.insert(videoSummaries).values({
        id: uuidv4(),
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

      const explanation = JSON.parse(jsonStr.trim());

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

    if (!transcript) {
      return {
        success: false,
        error: "No transcript available for this video",
      };
    }

    // Build conversation context
    const systemMessage = `You are a helpful AI assistant that answers questions about a specific YouTube video.

Video Title: ${metadata?.title || "Unknown"}
Video Description: ${metadata?.description?.slice(0, 500) || "No description"}

Video Transcript (for reference):
${transcript.slice(0, 15000)}

Rules:
- Answer questions based on the video content
- If asked about something not in the video, say so
- Provide timestamps when referencing specific parts
- Be concise but thorough`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemMessage },
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
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

        vocabulary = savedWordsResult.map((sw) => ({
          word: sw.sourceText || "",
          translation: sw.translatedText || "",
          context: sw.notes || undefined,
        }));
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

            const extracted = JSON.parse(jsonStr.trim()) as Array<{
              word: string;
              definition: string;
              example?: string;
            }>;

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
      const createdCards = [];
      for (const item of vocabulary.slice(0, maxCards)) {
        const id = uuidv4();
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
    if (!transcript) {
      return {
        success: false,
        error: "No transcript available for this video",
      };
    }

    const metadata = await getVideoMetadata(videoId);

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

Transcript:
${transcript.slice(0, 15000)}

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

      const quiz = JSON.parse(jsonStr.trim());

      return {
        success: true,
        quiz,
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

        const grammar = JSON.parse(jsonStr.trim());

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

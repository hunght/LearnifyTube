import { z } from "zod";
import { t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { GoogleGenAI, type Part } from "@google/genai";

/**
 * Convert L16 PCM audio data to WAV format by adding WAV headers
 * @param pcmData - Base64 encoded PCM audio data
 * @param sampleRate - Sample rate in Hz (default: 24000)
 * @returns Base64 encoded WAV file data
 */
function convertPcmToWav(pcmData: string, sampleRate: number = 24000): string {
  const pcmBuffer = Buffer.from(pcmData, "base64");
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const fileSize = 36 + dataSize;

  // Create WAV header
  const header = Buffer.alloc(44);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);

  // fmt chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // Audio format (1 = PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  // Combine header and PCM data, then convert back to base64
  const wavBuffer = Buffer.concat([header, pcmBuffer]);
  return wavBuffer.toString("base64");
}

// Initialize Gemini
// Note: This assumes GEMINI_API_KEY is available in process.env
// The frontend might need to pass this or it should be loaded from .env in the main process
const rawApiKey = process.env.GEMINI_API_KEY || "";
// Sanitize: Trim whitespace and remove surrounding quotes if accidentally included
const apiKey = rawApiKey.trim().replace(/^['"](.*)['"]$/, "$1");

logger.info("Gemini API Key status:", {
  originalLength: rawApiKey.length,
  sanitizedLength: apiKey.length,
  firstChar: apiKey?.[0],
});
const genAI = new GoogleGenAI({ apiKey });

const generatePodcastInputSchema = z.object({
  content: z.string().optional(),
  fileData: z.string().optional(), // Base64
  type: z.enum(["url", "text", "pdf"]),
  style: z.enum(["Roast", "ELI5", "Steel vs Straw"]),
  length: z.enum(["2-4 min", "4-6 min", "6-8 min"]),
});

// Exported for reuse in frontend components
 
export type GeneratePodcastInput = z.infer<typeof generatePodcastInputSchema>;

export const podcastRouter = t.router({
  generatePodcast: t.procedure.input(generatePodcastInputSchema).mutation(async ({ input }) => {
    try {
      // Step 1: Generate Script
      let prompt = "";
      const parts: Part[] = [];

      if (input.type === "pdf" && input.fileData) {
        prompt = `Analyze this uploaded PDF document.`;
        parts.push({
          inlineData: {
            data: input.fileData,
            mimeType: "application/pdf",
          },
        });
      } else if (input.type === "url") {
        prompt = `Analyze the content from this URL: ${input.content}.`;
      } else {
        prompt = `Analyze this text: "${input.content}".`;
      }

      const styleInstructions = {
        Roast:
          "Write a comedic roast-style podcast. Host 1 and Host 2 find humor and absurdity in the content. Use witty sarcasm, mock buzzwords, but never mean-spirited.",
        ELI5: "Write an educational podcast using simple language. Use everyday analogies (cooking, sports). Avoid jargon. Host 2 asks clarifying questions, Host 1 explains.",
        "Steel vs Straw":
          "Write a debate podcast. Host 1 presents the Steel Man (strongest argument). Host 2 presents the Straw Man (weak counterarguments). Structure: intro -> arguments -> conclusion.",
      };

      prompt += `
        Create a podcast script based on the analysis.
        Style: ${styleInstructions[input.style]}
        Length: ${input.length}.
        The script MUST use the labels "Host 1" and "Host 2" for the speakers.
        Format:
        Host 1: [Text]
        Host 2: [Text]
        ...
        `;

      parts.push({ text: prompt });

      const scriptResponse = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts }],
      });

      const script = scriptResponse.text;

      if (!script) {
        throw new Error("Failed to generate script");
      }

      // Step 2: Generate Audio
      const audioResponse = await genAI.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ role: "user", parts: [{ text: script }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: "Host 1",
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
                },
                {
                  speaker: "Host 2",
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: "Fenrir" } },
                },
              ],
            },
          },
        },
      });

      const inlineData = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      let audioBase64: string | undefined = undefined;

      if (inlineData && inlineData.mimeType?.startsWith("audio/")) {
        const rawAudioBase64 = inlineData.data || "";

        const originalMimeType = inlineData.mimeType;

        // Parse sample rate from MIME type if available (e.g., "audio/L16;codec=pcm;rate=24000")
        let sampleRate = 24000; // Default

        const rateMatch = originalMimeType?.match(/rate=(\d+)/);
        if (rateMatch) {
          sampleRate = parseInt(rateMatch[1], 10);
        }

        // Convert PCM to WAV if needed (L16 PCM format)

        if (originalMimeType?.includes("L16") || originalMimeType?.includes("pcm")) {
          logger.info("Converting PCM audio to WAV format", {
            originalMimeType,
            sampleRate,
          });
          audioBase64 = convertPcmToWav(rawAudioBase64, sampleRate);
          const audioMimeType = "audio/wav";

          return {
            script,
            audioData: audioBase64,
            audioMimeType,
            success: true,
          };
        } else {
          // Already in a playable format

          audioBase64 = rawAudioBase64;

          const audioMimeType = originalMimeType || "audio/mp3";

          return {
            script,
            audioData: audioBase64,

            audioMimeType,
            success: true,
          };
        }
      } else {
        // Fallback/Error if structure doesn't match
        // Try getting text just in case it's an error message
        logger.warn("No inline audio data found. Response:", audioResponse);
        throw new Error("No audio data generated");
      }
    } catch (error) {
      logger.error("Error generating podcast:", error);
      throw new Error("Failed to generate podcast. Please check your API key and try again.");
    }
  }),
});

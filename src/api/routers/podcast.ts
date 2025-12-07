import { z } from "zod";
import { t } from "@/api/trpc";
import { logger } from "@/helpers/logger";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Gemini
// Note: This assumes GEMINI_API_KEY is available in process.env
// The frontend might need to pass this or it should be loaded from .env in the main process
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

export const podcastRouter = t.router({
  generateScript: t.procedure
    .input(
      z.object({
        content: z.string(),
        type: z.enum(["url", "text"]),
      })
    )
    .mutation(async ({ input }) => {
      try {
        let prompt = "";

        if (input.type === "url") {
          // In a real implementation, we would fetch the URL content here.
          // For now, we'll ask Gemini to try and summarize based on its knowledge or just treat it as a topic.
          prompt = `Create a podcast script based on this URL: ${input.content}. 
          The podcast should be a conversation between two hosts, labeled 'Host 1' and 'Host 2'. 
          Make it engaging, informative, and around 5 minutes long.`;
        } else {
          prompt = `Create a podcast script based on the following text: "${input.content}".
          The podcast should be a conversation between two hosts, labeled 'Host 1' and 'Host 2'.
          Make it engaging, informative, and natural sounding.`;
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return {
          script: text,
          success: true,
        };
      } catch (error) {
        logger.error("Error generating podcast script:", error);
        throw new Error(
          "Failed to generate podcast script. Please check your API key and try again."
        );
      }
    }),
});

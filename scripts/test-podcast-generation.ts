import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";

/**
 * Convert L16 PCM audio data to WAV format by adding WAV headers
 * @param pcmData - Base64 encoded PCM audio data
 * @param sampleRate - Sample rate in Hz (default: 24000)
 * @returns Buffer containing WAV file data
 */
function convertPcmToWav(pcmData: string, sampleRate: number = 24000): Buffer {
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

  // Combine header and PCM data
  return Buffer.concat([header, pcmBuffer]);
}

async function testPodcastGeneration(pdfPath?: string) {
  console.log("🎙️  Starting Podcast Generation Test...");
  if (pdfPath) {
    console.log(`📄 PDF file provided: ${pdfPath}`);
  }

  // 1. Load .env manually to avoid dependency issues
  const envPath = path.resolve(process.cwd(), ".env");
  let apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey && fs.existsSync(envPath)) {
    console.log("📂 Processing .env file...");
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/^GEMINI_API_KEY=(.*)$/m);
    if (match) {
      apiKey = match[1];
    }
  }

  if (!apiKey) {
    console.error("❌ GEMINI_API_KEY not found in process environment or .env file.");
    process.exit(1);
  }

  // 2. Sanitize the API key (same as podcast.ts)
  const rawApiKey = apiKey;
  const sanitizedApiKey = rawApiKey.trim().replace(/^['"](.*)['"]$/, "$1");

  console.log("🔑 Key Analysis:");
  console.log(`   - Original Length: ${rawApiKey.length}`);
  console.log(`   - Sanitized Length: ${sanitizedApiKey.length}`);
  console.log(`   - First Character: ${sanitizedApiKey[0]}`);

  // 3. Initialize Gemini
  console.log("\n🚀 Initializing Gemini API...");
  const genAI = new GoogleGenAI({ apiKey: sanitizedApiKey });

  try {
    // Step 1: Generate Script (same as podcast.ts)
    console.log("\n📝 Step 1: Generating Podcast Script...");

    const style = "ELI5"; // Using ELI5 style for testing
    const length = "2-4 min";

    const styleInstructions = {
      Roast:
        "Write a comedic roast-style podcast. Host 1 and Host 2 find humor and absurdity in the content. Use witty sarcasm, mock buzzwords, but never mean-spirited.",
      ELI5: "Write an educational podcast using simple language. Use everyday analogies (cooking, sports). Avoid jargon. Host 2 asks clarifying questions, Host 1 explains.",
      "Steel vs Straw":
        "Write a debate podcast. Host 1 presents the Steel Man (strongest argument). Host 2 presents the Straw Man (weak counterarguments). Structure: intro -> arguments -> conclusion.",
    };

    let prompt = "";
    const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];

    if (pdfPath) {
      // PDF mode
      console.log(`   📄 Reading PDF file: ${pdfPath}`);
      if (!fs.existsSync(pdfPath)) {
        console.error(`❌ PDF file not found: ${pdfPath}`);
        process.exit(1);
      }

      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfBase64 = pdfBuffer.toString("base64");
      const fileSizeKB = (pdfBuffer.length / 1024).toFixed(2);

      console.log(`   ✅ PDF loaded successfully`);
      console.log(`   - File size: ${fileSizeKB} KB`);
      console.log(`   - Base64 length: ${pdfBase64.length} characters`);

      prompt = `Analyze this uploaded PDF document.`;
      parts.push({
        inlineData: {
          data: pdfBase64,
          mimeType: "application/pdf",
        },
      });
    } else {
      // Text mode (default)
      const testContent =
        "Artificial Intelligence is transforming the way we work and live. From chatbots to self-driving cars, AI is everywhere.";
      prompt = `Analyze this text: "${testContent}".`;
      console.log(`   - Content: ${testContent.substring(0, 50)}...`);
    }

    prompt += `
Create a podcast script based on the analysis.
Style: ${styleInstructions[style]}
Length: ${length}.
The script MUST use the labels "Host 1" and "Host 2" for the speakers.
Format:
Host 1: [Text]
Host 2: [Text]
...
`;

    parts.push({ text: prompt });

    console.log(`   - Style: ${style}`);
    console.log(`   - Length: ${length}`);
    console.log(`   - Model: gemini-2.5-flash`);
    console.log(`   - Input type: ${pdfPath ? "PDF" : "Text"}`);

    const scriptResponse = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
    });

    const script = scriptResponse.text;

    if (!script) {
      console.error("❌ Failed to generate script - response is empty");
      process.exit(1);
    }

    console.log("   ✅ Script generated successfully!");
    console.log(`   - Script length: ${script.length} characters`);
    console.log("\n   Script preview (first 300 chars):");
    console.log(`   ${script.substring(0, 300)}...`);

    // Verify script has Host 1 and Host 2 labels
    if (!script.includes("Host 1") || !script.includes("Host 2")) {
      console.warn("   ⚠️  WARNING: Script may not contain 'Host 1' and 'Host 2' labels");
    } else {
      console.log("   ✅ Script contains 'Host 1' and 'Host 2' labels");
    }

    // Step 2: Generate Audio (same as podcast.ts)
    console.log("\n🎧 Step 2: Generating Audio...");
    console.log(`   - Model: gemini-2.5-flash-preview-tts`);
    console.log(`   - Response Modalities: AUDIO`);
    console.log(`   - Voice Config: Host 1 (Puck), Host 2 (Fenrir)`);

    const audioResponse = await genAI.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ role: "user", parts: [{ text: script }] }],
      config: {
        responseModalities: ["AUDIO"],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        } as any,
      },
    });

    // Extract audio data (same as podcast.ts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inlineData = (audioResponse as any).candidates?.[0]?.content?.parts?.[0]?.inlineData;

    if (!inlineData || !inlineData.mimeType?.startsWith("audio/")) {
      console.error("❌ No inline audio data found in response");
      console.log("   Response structure:", JSON.stringify(audioResponse, null, 2));
      process.exit(1);
    }

    const audioBase64 = inlineData.data;

    if (!audioBase64 || audioBase64.length === 0) {
      console.error("❌ Audio data is empty");
      process.exit(1);
    }

    console.log("   ✅ Audio generated successfully!");
    console.log(`   - Audio MIME Type: ${inlineData.mimeType}`);
    console.log(`   - Audio Data Length: ${audioBase64.length} characters (Base64)`);

    // Parse sample rate from MIME type if available (e.g., "audio/L16;codec=pcm;rate=24000")
    let sampleRate = 24000; // Default
    const rateMatch = inlineData.mimeType?.match(/rate=(\d+)/);
    if (rateMatch) {
      sampleRate = parseInt(rateMatch[1], 10);
      console.log(`   - Sample Rate: ${sampleRate} Hz`);
    }

    // Convert PCM to WAV if needed
    let audioBuffer: Buffer;
    let fileExtension: string;
    let mimeTypeForFile: string;

    if (inlineData.mimeType?.includes("L16") || inlineData.mimeType?.includes("pcm")) {
      console.log("   🔄 Converting PCM to WAV format...");
      audioBuffer = convertPcmToWav(audioBase64, sampleRate);
      fileExtension = "wav";
      mimeTypeForFile = "audio/wav";
    } else {
      // Already in a playable format (unlikely but handle it)
      audioBuffer = Buffer.from(audioBase64, "base64");
      fileExtension = "mp3";
      mimeTypeForFile = "audio/mp3";
    }

    console.log(`   - Final Audio Size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   - Format: ${fileExtension.toUpperCase()}`);

    // Save audio to file for testing
    const outputDir = path.resolve(process.cwd(), "test-output");
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const audioFileName = pdfPath
      ? `test-podcast-pdf-${Date.now()}.${fileExtension}`
      : `test-podcast.${fileExtension}`;
    const audioFilePath = path.join(outputDir, audioFileName);
    fs.writeFileSync(audioFilePath, audioBuffer);

    console.log(`\n💾 Audio saved to: ${audioFilePath}`);
    console.log(`   - File size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`   - Format: ${fileExtension.toUpperCase()} (${mimeTypeForFile})`);

    console.log("\n✅ SUCCESS! Podcast generation test completed successfully!");
    console.log("   - Script generation: ✅");
    console.log("   - Audio generation: ✅");
    console.log("   - Audio file saved: ✅");

    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ ERROR during podcast generation:");
    console.error(error);

    if (error.message) {
      console.error(`   Error message: ${error.message}`);
    }

    if (error.message?.includes("404")) {
      console.error("   (404: Model not found or not supported with this key)");
    } else if (error.message?.includes("401") || error.message?.includes("403")) {
      console.error("   (401/403: Authentication failed - check your API key)");
    } else if (error.message?.includes("429")) {
      console.error("   (429: Rate limit exceeded)");
    }

    process.exit(1);
  }
}

// Get PDF path from command line argument or use default
const pdfPath =
  process.argv[2] ||
  "/Users/owner/source/zbook-fyi/book-manager/scripts/A LIFE WORTH LIVING - JOHN HOLT.pdf";
testPodcastGeneration(pdfPath);

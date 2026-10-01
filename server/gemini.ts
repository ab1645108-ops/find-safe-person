import { GoogleGenAI } from "@google/genai";

// Lazy/Safe Gemini initialization with telemetry header
export const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

export async function generateContentWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    models?: string[];
  }
): Promise<string> {
  const models = params.models || [
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash",
  ];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        const text = response.text || "";
        if (text) return text;
      } catch (err: any) {
        lastError = err;
        const isUnavailable =
          err?.status === 503 ||
          err?.code === 503 ||
          err?.message?.includes("high demand") ||
          err?.message?.includes("503") ||
          err?.status === 429 ||
          err?.code === 429;

        if (isUnavailable && attempt < 2) {
          // Short exponential backoff before retry
          await new Promise((r) => setTimeout(r, 400 * attempt));
          continue;
        }
        break; // Fallback to next model
      }
    }
  }

  throw lastError || new Error("Failed to generate content from AI models");
}

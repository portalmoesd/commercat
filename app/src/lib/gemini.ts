import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── System Prompt ──

export const SYSTEM_PROMPT = `You are a personal shopping assistant for Commercat, a platform that sources products from Chinese marketplaces for global shoppers. You help users find products from Taobao, Tmall, 1688, and Pinduoduo.

Respond in the user's language. If they write in English, reply in English. If they write in another language, reply in that language.

Commercat acts as the user's purchasing agent — every order is placed in their name, to their freight forwarder's personal cabinet address. Mention this naturally when users ask how it works.

CRITICAL RULES:
1. When a user wants to find/buy/search for a product, you MUST start your response with exactly [SEARCH_INTENT] on the first line, followed by a brief message like "Let me find that for you!" Do NOT list products, prices, or search results yourself — the system will display product cards automatically.
2. When a user uploads a photo, you MUST start with [SEARCH_INTENT] on the first line, then briefly describe what you see. Do NOT list products yourself.
3. When a user asks about their order, start with [TRACKING_INTENT] on the first line.
4. For general questions (how it works, sizing help, etc.), just answer normally without any tags.
5. NEVER fabricate products, prices, or search results. NEVER show price breakdowns in text. The product cards handle all of that.
6. Keep responses SHORT — 1-2 sentences max for search queries. The product cards are the main content.`;

const flash = genAI.getGenerativeModel({
  model: "gemini-flash-latest",
  systemInstruction: SYSTEM_PROMPT,
});

// ── Retry helper for Gemini API calls ──

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  label = "Gemini"
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const isRetryable = msg.includes("503") || msg.includes("429") || msg.includes("500") || msg.includes("overloaded");

      if (isRetryable && attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`${label} attempt ${attempt + 1} failed (${msg.slice(0, 80)}), retrying in ${delay}ms...`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error(`${label}: exhausted retries`);
}

// ── Streaming Chat (yields text chunks) ──

export async function* streamChatGenerator(
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  userMessage: string,
  imageBase64?: string,
  imageMediaType?: string
): AsyncGenerator<string> {
  const chat = flash.startChat({ history });

  const parts: (
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  )[] = [];

  if (imageBase64) {
    parts.push({
      inlineData: {
        mimeType: imageMediaType || "image/jpeg",
        data: imageBase64,
      },
    });
  }

  parts.push({ text: userMessage || "What is this? Find similar products." });

  // Retry the initial stream connection
  const result = await withRetry(
    () => chat.sendMessageStream(parts),
    3,
    "Gemini stream"
  );

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

// ── Query Translation ──

export async function translateQuery(
  query: string,
  sizeProfile?: Record<string, string>
): Promise<string[]> {
  const sizeContext =
    sizeProfile && Object.keys(sizeProfile).length > 0
      ? `\nUser's size profile: ${JSON.stringify(sizeProfile)}`
      : "";

  const result = await withRetry(
    () =>
      flash.generateContent(
        `Translate this shopping query to 2-3 Chinese search terms that Chinese sellers would use on 1688 and Taobao. Keep brand names in English/original form (e.g. "SMEG", "Nike") since Chinese sellers use them. Mix brand name + Chinese product category. Return ONLY a valid JSON array of strings, nothing else.\n\nQuery: "${query}"${sizeContext}`
      ),
    3,
    "Gemini translate"
  );
  const text = result.response.text();
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Result Filtering ──

export async function filterResults(
  query: string,
  rawResults: object[]
): Promise<FilteredProduct[]> {
  const result = await withRetry(
    () =>
      flash.generateContent(
        `Original query: "${query}"

Raw results:
${JSON.stringify(rawResults)}

Return the top 5 most relevant products as a valid JSON array. For each product include:
- id (from raw results)
- title_en (translate the Chinese title to natural English)
- title_cn (original)
- image_url
- product_url
- price_cny
- platform
- skus (size/colour options)
- branded (boolean — true if appears to be a luxury brand dupe)
- relevance_score (0.0 to 1.0)

Remove products that are clearly irrelevant to the query.
Sort by relevance_score descending.
Return ONLY valid JSON, no explanation text.`
      ),
    3,
    "Gemini filter"
  );
  const text = result.response.text();
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Intent Detection ──

export function hasSearchIntent(text: string): boolean {
  return text.includes("[SEARCH_INTENT]");
}

export function hasTrackingIntent(text: string): boolean {
  return text.includes("[TRACKING_INTENT]");
}

export function stripIntentMarkers(text: string): string {
  return text
    .replace(/\[SEARCH_INTENT\]\n?/g, "")
    .replace(/\[TRACKING_INTENT\]\n?/g, "")
    .trim();
}

// ── Types ──

export interface FilteredProduct {
  id: string;
  title_en: string;
  title_cn: string;
  image_url: string;
  product_url: string;
  price_cny: number;
  platform: string;
  skus: { size?: string; color?: string; price?: number }[];
  branded: boolean;
  relevance_score: number;
}

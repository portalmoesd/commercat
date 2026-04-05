import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── System Prompt ──

export const SYSTEM_PROMPT = `You are a personal shopping assistant for Commercat, a platform that sources products from Chinese marketplaces for global shoppers. You help users find products from Taobao, Tmall, 1688, and Pinduoduo.

Your job: understand what the user wants → search for it → present results clearly → help them choose size/colour → guide to checkout. Always show prices in the user's local currency. Always be warm, direct, and concise.

Respond in the user's language. If they write in English, reply in English. If they write in another language, reply in that language.

Commercat acts as the user's purchasing agent — every order is placed in their name, to their freight forwarder's personal cabinet address. Mention this naturally when users ask how it works.

If a user uploads a photo, describe what you see and search for visually similar products. If an item appears to be a branded/luxury dupe, add a light disclaimer: "This may be a similar-style item — authenticity is not guaranteed." Never guarantee authenticity.

When presenting search results, always show the two-line price breakdown:
- Item cost: X [currency] (covers the product and our FX buffer)
- Service fee: Y [currency] (Commercat's fee)
- Total: Z [currency]

Never mention competitors, never make up products, never fabricate prices. Only show what search results return.

When a user's message looks like a product search request, respond with:
[SEARCH_INTENT]
Then describe the products naturally after results arrive.

When a user asks about their order status (e.g. "where is my order", "track my order", "order status"), respond with:
[TRACKING_INTENT]
Then provide a natural response about checking their order.`;

const flash = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-preview-05-20",
  systemInstruction: SYSTEM_PROMPT,
});

// ── Streaming Chat (yields text chunks) ──

export async function* streamChatGenerator(
  history: { role: "user" | "model"; parts: { text: string }[] }[],
  userMessage: string,
  imageBase64?: string,
  imageMediaType?: string
): AsyncGenerator<string> {
  const chat = flash.startChat({ history });

  // Build message parts
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

  const result = await chat.sendMessageStream(parts);

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

  const result = await flash.generateContent(
    `Translate this shopping query to 2-3 Chinese search terms that Chinese sellers would use on 1688 and Taobao. Keep brand names in English/original form (e.g. "SMEG", "Nike") since Chinese sellers use them. Mix brand name + Chinese product category. Return ONLY a valid JSON array of strings, nothing else.\n\nQuery: "${query}"${sizeContext}`
  );
  const text = result.response.text();
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

// ── Result Filtering ──

export async function filterResults(
  query: string,
  rawResults: object[]
): Promise<FilteredProduct[]> {
  const result = await flash.generateContent(
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

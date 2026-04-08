import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminClient } from "@/lib/supabase-server";
import { streamChatGenerator, translateQuery } from "@/lib/gemini";
import {
  searchByImage as lensSearch,
  findBrandPrice,
} from "@/lib/lens";
import { searchByKeyword, searchByImage } from "@/lib/elimapi";
import { checkAndIncrementSearchCount } from "@/lib/search-limit";
import { getFxRates } from "@/lib/currency";
import { calculatePrice } from "@/lib/pricing";
import type {
  NormalisedProduct,
  SubscriptionTier,
  Platform,
  ProcessedProduct,
  Message,
} from "@/types";

/**
 * Convert NormalisedProduct[] directly to ProcessedProduct[] with pricing.
 * No Gemini filtering — Elimapi results are already sorted by relevance.
 */
function applyPricing(
  products: NormalisedProduct[],
  fxRate: number,
  currency: string,
  maxItems = 10
): ProcessedProduct[] {
  // Deduplicate by ID, take first maxItems
  const seen = new Set<string>();
  const unique: NormalisedProduct[] = [];
  for (const p of products) {
    if (!seen.has(p.id) && p.id) {
      seen.add(p.id);
      unique.push(p);
      if (unique.length >= maxItems) break;
    }
  }

  return unique.map((p) => {
    const priceBreakdown = calculatePrice(p.price_cny, p.cn_shipping_cny, fxRate, currency);
    return {
      id: p.id,
      platform: p.platform,
      title_en: p.title_cn, // Elimapi titleEn is stored in title_cn field
      title_cn: p.title_cn,
      image_url: p.image_url,
      product_url: p.product_url,
      price_cny: p.price_cny,
      shop_name: p.shop_name,
      sales_count: p.sales_count,
      item_cost_local: priceBreakdown.item_cost,
      commission_local: priceBreakdown.commission,
      total_local: priceBreakdown.total,
      currency,
      skus: p.skus,
      branded: false,
      relevance_score: 1,
    };
  });
}

export async function POST(req: NextRequest) {
  try {
    // Auth
    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !authUser) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          details: authError?.message ?? "No valid session",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
      message,
      image_base64,
      conversation_id,
      currency = "USD",
    }: {
      message: string;
      image_base64?: string;
      conversation_id?: string;
      currency?: string;
    } = body;

    if (!message && !image_base64) {
      return new Response(
        JSON.stringify({ error: "message or image required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const adminClient = createAdminClient();

    // Ensure user profile exists
    await adminClient.from("users").upsert(
      {
        id: authUser.id,
        email: authUser.email!,
        full_name:
          authUser.user_metadata?.full_name ??
          authUser.user_metadata?.name ??
          null,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

    // Load user profile
    const { data: userProfile } = await adminClient
      .from("users")
      .select("subscription_tier, size_profile, trial_claimed")
      .eq("id", authUser.id)
      .single();

    const tier: SubscriptionTier =
      (userProfile?.subscription_tier as SubscriptionTier) ?? "free";
    const sizeProfile = userProfile?.size_profile ?? {};

    // Load or create conversation
    let conversationId = conversation_id;
    let messages: Message[] = [];

    if (conversationId) {
      const { data: conv } = await adminClient
        .from("conversations")
        .select("messages")
        .eq("id", conversationId)
        .single();
      if (conv) {
        messages = conv.messages as Message[];
      }
    } else {
      const { data: newConv } = await adminClient
        .from("conversations")
        .insert({ user_id: authUser.id, messages: [] })
        .select("id")
        .single();
      conversationId = newConv?.id;
    }

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    messages.push(userMessage);

    // Build Gemini history
    const geminiHistory = messages.slice(0, -1).map((m) => ({
      role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: m.content }],
    }));

    // Detect image media type
    let imageMediaType = "image/jpeg";
    if (image_base64) {
      if (image_base64.startsWith("iVBOR")) imageMediaType = "image/png";
      else if (image_base64.startsWith("R0lGO")) imageMediaType = "image/gif";
      else if (image_base64.startsWith("UklGR")) imageMediaType = "image/webp";
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const isImageSearch = !!image_base64;

          // ── Start parallel tasks ──

          // 1. Elimapi search (runs in parallel with Gemini chat)
          let searchPromise: Promise<{
            products: NormalisedProduct[];
            brandPrice: { price: string; source: string } | null;
          }> | null = null;

          if (isImageSearch) {
            // IMAGE SEARCH: Elimapi visual search + Lens brand price (no Gemini needed)
            searchPromise = (async () => {
              let brandPrice: { price: string; source: string } | null = null;

              // Run Lens for brand price detection (optional, non-blocking)
              try {
                const { uploadImage } = await import("@/lib/storage");
                const imageUrl = await uploadImage(image_base64!, authUser.id);
                const lensMatches = await lensSearch(imageUrl);
                brandPrice = findBrandPrice(lensMatches);
              } catch (err) {
                console.error("Lens failed:", err);
              }

              // Run Elimapi visual image search
              const products = await searchByImage(
                image_base64!,
                "taobao" as Platform
              );

              return { products, brandPrice };
            })();
          }

          // 2. Stream Gemini chat response (1 Gemini call)
          let fullResponse = "";
          const userText = message || "What is this? Find similar products.";

          for await (const text of streamChatGenerator(
            geminiHistory,
            userText,
            image_base64,
            imageMediaType
          )) {
            fullResponse += text;

            const cleanText = text
              .replace(/\[SEARCH_INTENT\]\n?/g, "")
              .replace(/\[TRACKING_INTENT\]\n?/g, "");
            if (cleanText) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text", content: cleanText })}\n\n`
                )
              );
            }
          }

          // ── Handle search ──
          const hasSearchOrImage = fullResponse.includes("[SEARCH_INTENT]") || isImageSearch;

          if (hasSearchOrImage) {
            const limitStatus = await checkAndIncrementSearchCount(authUser.id, tier);

            if (!limitStatus.allowed) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "search_limit",
                    count: limitStatus.count,
                    limit: limitStatus.limit,
                    trial_claimed: userProfile?.trial_claimed ?? false,
                  })}\n\n`
                )
              );
            } else {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "status", content: "Searching..." })}\n\n`
                )
              );

              let allProducts: NormalisedProduct[] = [];
              let brandPrice: { price: string; source: string } | null = null;

              if (isImageSearch && searchPromise) {
                // IMAGE: results already running in parallel
                const result = await searchPromise;
                allProducts = result.products;
                brandPrice = result.brandPrice;
              } else {
                // TEXT: translate to Chinese (1 Gemini call), then Elimapi keyword search
                const chineseTerms = await translateQuery(message, sizeProfile);

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", content: "Finding products..." })}\n\n`
                  )
                );

                // Search both Taobao AND 1688
                const searchResults = await Promise.allSettled(
                  chineseTerms.flatMap((term) => [
                    searchByKeyword(term, "taobao" as Platform),
                    searchByKeyword(term, "1688" as Platform),
                  ])
                );
                allProducts = searchResults
                  .filter((r) => r.status === "fulfilled")
                  .flatMap((r) => (r as PromiseFulfilledResult<NormalisedProduct[]>).value);
              }

              // Apply pricing directly — no Gemini filtering needed
              const rates = await getFxRates();
              const fxRate = rates[currency] ?? rates["USD"];

              const processedProducts = applyPricing(allProducts, fxRate, currency);

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "product_cards",
                    products: processedProducts,
                    brand_price: brandPrice,
                  })}\n\n`
                )
              );
            }
          }

          // Save assistant message
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullResponse
              .replace(/\[SEARCH_INTENT\]\n?/g, "")
              .replace(/\[TRACKING_INTENT\]\n?/g, ""),
            timestamp: new Date().toISOString(),
          };
          messages.push(assistantMessage);

          if (conversationId) {
            await adminClient
              .from("conversations")
              .update({
                messages,
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversationId);
          }

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", conversation_id: conversationId })}\n\n`
            )
          );
          controller.close();
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Something went wrong";
          console.error("Chat stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: errMsg })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Chat failed";
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

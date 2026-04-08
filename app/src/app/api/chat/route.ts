import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminClient } from "@/lib/supabase-server";
import {
  streamChatGenerator,
  translateQuery,
  filterResults,
  type FilteredProduct,
} from "@/lib/gemini";
import {
  searchByImage as lensSearch,
  extractSearchTerms,
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

    // Use admin client for DB operations (bypasses RLS)
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

    // Build Gemini history format (role: 'user' | 'model')
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

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // If image uploaded, run Lens search in parallel with Gemini streaming
          let lensPromise: Promise<{
            brandPrice: { price: string; source: string } | null;
            searchTerms: string[];
            imageUrl: string | null;
          }> | null = null;

          if (image_base64) {
            lensPromise = (async () => {
              try {
                // Upload to Supabase Storage
                const { uploadImage } = await import("@/lib/storage");
                const imageUrl = await uploadImage(image_base64!, authUser.id);

                // Run Google Lens
                const lensMatches = await lensSearch(imageUrl);
                const brandPrice = findBrandPrice(lensMatches);
                const searchTerms = extractSearchTerms(lensMatches);

                return { brandPrice, searchTerms, imageUrl };
              } catch (err) {
                console.error("Lens search failed:", err);
                return { brandPrice: null, searchTerms: [], imageUrl: null };
              }
            })();
          }

          // Stream Gemini response
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

          // Check for search intent
          const isImageSearch = !!image_base64;
          if (fullResponse.includes("[SEARCH_INTENT]") || isImageSearch) {
            const limitStatus = await checkAndIncrementSearchCount(
              authUser.id,
              tier
            );

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
              let chineseTerms: string[] = [];
              let brandPrice: { price: string; source: string } | null = null;

              if (isImageSearch && lensPromise) {
                // Wait for Lens results
                const lensResult = await lensPromise;
                brandPrice = lensResult.brandPrice;

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", content: "Finding similar products..." })}\n\n`
                  )
                );

                // Use Lens search terms if available, fallback to Gemini description
                const termsToTranslate =
                  lensResult.searchTerms.length > 0
                    ? lensResult.searchTerms
                    : [fullResponse || message || "similar product"];

                // Translate and search
                for (const term of termsToTranslate.slice(0, 2)) {
                  const cnTerms = await translateQuery(term, sizeProfile);
                  chineseTerms.push(...cnTerms);
                }

                const searchPromises = chineseTerms.slice(0, 4).map((term) =>
                  searchByKeyword(term, "taobao" as Platform)
                );

                // Also try Elimapi image search if we have a URL
                if (lensResult.imageUrl) {
                  searchPromises.push(
                    searchByImage(
                      lensResult.imageUrl,
                      "taobao" as Platform
                    )
                  );
                }

                const searchResults = await Promise.allSettled(searchPromises);
                allProducts = searchResults
                  .filter((r) => r.status === "fulfilled")
                  .flatMap(
                    (r) =>
                      (r as PromiseFulfilledResult<NormalisedProduct[]>).value
                  );
              } else {
                // Text search
                chineseTerms = await translateQuery(message, sizeProfile);

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", content: "Finding products..." })}\n\n`
                  )
                );

                // Search both Taobao AND 1688 in parallel
                const searchPromises = chineseTerms.flatMap((term) => [
                  searchByKeyword(term, "taobao" as Platform),
                  searchByKeyword(term, "1688" as Platform),
                ]);
                const searchResults = await Promise.allSettled(searchPromises);
                allProducts = searchResults
                  .filter((r) => r.status === "fulfilled")
                  .flatMap((r) => (r as PromiseFulfilledResult<NormalisedProduct[]>).value);
              }

              // Filter with Gemini
              const filtered = await filterResults(message, allProducts);

              // Calculate prices
              const rates = await getFxRates();
              const fxRate = rates[currency] ?? rates["USD"];

              const processedProducts: ProcessedProduct[] = filtered.map(
                (p: FilteredProduct) => {
                  const priceBreakdown = calculatePrice(
                    p.price_cny,
                    0,
                    fxRate,
                    currency
                  );
                  // Find original normalised product to get shop_name/sales_count
                  const original = allProducts.find(
                    (op) => op.id === p.id
                  );

                  return {
                    id: p.id,
                    platform: p.platform as Platform,
                    title_en: p.title_en,
                    title_cn: p.title_cn,
                    image_url: p.image_url,
                    product_url: p.product_url,
                    price_cny: p.price_cny,
                    shop_name: original?.shop_name ?? "",
                    sales_count: original?.sales_count ?? 0,
                    item_cost_local: priceBreakdown.item_cost,
                    commission_local: priceBreakdown.commission,
                    total_local: priceBreakdown.total,
                    currency,
                    skus: p.skus,
                    branded: p.branded,
                    relevance_score: p.relevance_score,
                  };
                }
              );

              // Send product cards + brand price if available
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "product_cards",
                    products: processedProducts,
                    query_cn: chineseTerms,
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
          const errMsg =
            error instanceof Error ? error.message : "Something went wrong";
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

import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminClient } from "@/lib/supabase-server";
import {
  streamChatGenerator,
  translateQuery,
  filterResults,
  SYSTEM_PROMPT,
  type FilteredProduct,
} from "@/lib/claude";
import { searchByKeyword, searchByImage } from "@/lib/elimapi";
import { checkAndIncrementSearchCount } from "@/lib/search-limit";
import { getFxRates } from "@/lib/currency";
import { calculatePrice } from "@/lib/pricing";
import type {
  SubscriptionTier,
  Platform,
  ProcessedProduct,
  Message,
} from "@/types";

export async function POST(req: NextRequest) {
  try {
    // Auth — same pattern as /api/orders (which works)
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

    // Build Anthropic message format
    const anthropicMessages = messages.slice(0, -1).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // For the latest user message, include image if provided
    if (image_base64) {
      anthropicMessages.push({
        role: "user" as const,
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: image_base64,
            },
          },
          {
            type: "text",
            text: message || "What is this? Find similar products.",
          },
        ] as unknown as string,
      });
    } else {
      anthropicMessages.push({
        role: "user" as const,
        content: message,
      });
    }

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream Claude response using async generator
          let fullResponse = "";

          for await (const text of streamChatGenerator(
            anthropicMessages,
            SYSTEM_PROMPT
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

          // Check for search intent (text search or image upload)
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

              let allProducts;
              let chineseTerms: string[] = [];

              if (isImageSearch) {
                // Claude already described the image above — use its response
                // to generate search terms (Elimapi needs a URL, not base64)
                chineseTerms = await translateQuery(
                  fullResponse || message || "similar product",
                  sizeProfile
                );

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", content: "Finding similar products..." })}\n\n`
                  )
                );

                const searchResults = await Promise.all(
                  chineseTerms.map((term) =>
                    searchByKeyword(term, "taobao" as Platform)
                  )
                );
                allProducts = searchResults.flat();
              } else {
                chineseTerms = await translateQuery(message, sizeProfile);

                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", content: "Finding products..." })}\n\n`
                  )
                );

                const searchResults = await Promise.all(
                  chineseTerms.map((term) =>
                    searchByKeyword(term, "taobao" as Platform)
                  )
                );
                allProducts = searchResults.flat();
              }

              const filtered = await filterResults(message, allProducts);

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
                  return {
                    id: p.id,
                    platform: p.platform as Platform,
                    title_en: p.title_en,
                    title_cn: p.title_cn,
                    image_url: p.image_url,
                    product_url: p.product_url,
                    price_cny: p.price_cny,
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

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "product_cards",
                    products: processedProducts,
                    query_cn: chineseTerms,
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

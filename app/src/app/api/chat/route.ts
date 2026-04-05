import { NextRequest } from "next/server";
import { createSupabaseServerClient, createAdminClient } from "@/lib/supabase-server";
import {
  streamChat,
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

    const supabase = await createSupabaseServerClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Use admin client for DB operations (bypasses RLS issues)
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
    const anthropicMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    // First pass: get Claude's response to detect intent
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Stream initial Claude response
          const claudeStream = await streamChat(
            anthropicMessages,
            SYSTEM_PROMPT
          );
          const reader = claudeStream.getReader();
          let fullResponse = "";

          // Read the full streamed response
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = new TextDecoder().decode(value);

            // Parse SSE events from Anthropic stream
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (
                    data.type === "content_block_delta" &&
                    data.delta?.type === "text_delta"
                  ) {
                    const text = data.delta.text;
                    fullResponse += text;

                    // Stream text to client (excluding intent markers)
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
                } catch {
                  // Skip non-JSON lines
                }
              }
            }
          }

          // Check for search intent (text search or image upload)
          const isImageSearch = !!image_base64;
          if (fullResponse.includes("[SEARCH_INTENT]") || isImageSearch) {
            // Check search limit
            const limitStatus = await checkAndIncrementSearchCount(
              authUser.id,
              tier
            );

            if (!limitStatus.allowed) {
              // Send search limit prompt
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
              // Perform search
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "status", content: "Searching..." })}\n\n`
                )
              );

              let allProducts;
              let chineseTerms: string[] = [];

              if (isImageSearch) {
                // Image search: convert base64 to data URL for Elimapi
                const imageUrl = `data:image/jpeg;base64,${image_base64}`;
                allProducts = await searchByImage(imageUrl, "taobao" as Platform);
              } else {
                // Text search: translate query to Chinese
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

              // Filter and rank via Claude
              const filtered = await filterResults(message, allProducts);

              // Get FX rates and calculate prices
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

              // Send product cards
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

          // Save assistant message to conversation
          const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: fullResponse
              .replace(/\[SEARCH_INTENT\]\n?/g, "")
              .replace(/\[TRACKING_INTENT\]\n?/g, ""),
            timestamp: new Date().toISOString(),
          };
          messages.push(assistantMessage);

          // Update conversation in Supabase
          if (conversationId) {
            await adminClient
              .from("conversations")
              .update({
                messages,
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversationId);
          }

          // Send conversation_id to client
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "done", conversation_id: conversationId })}\n\n`
            )
          );

          controller.close();
        } catch (error) {
          console.error("Chat stream error:", error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", content: "Something went wrong" })}\n\n`
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
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: "Chat failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

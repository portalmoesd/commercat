"use client";

import { useState, useCallback, useEffect } from "react";
import { ChatWindow, type ChatMessage } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { BasketPanel, type BasketItem } from "@/components/basket/BasketPanel";
import { useCurrency } from "@/lib/currency-context";
import type { ProcessedProduct } from "@/types";
import Link from "next/link";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { currencyCode } = useCurrency();

  // Load most recent conversation on mount
  useEffect(() => {
    async function loadConversation() {
      try {
        const response = await fetch("/api/conversations");
        if (!response.ok) return;
        const data = await response.json();
        const conversations = data.conversations ?? [];
        if (conversations.length > 0) {
          const latest = conversations[0];
          const msgs = (latest.messages ?? []).map(
            (m: { id: string; role: string; content: string; timestamp: string }) => ({
              ...m,
              timestamp: new Date(m.timestamp),
            })
          );
          setMessages(msgs);
          setConversationId(latest.id);
        }
      } catch {
        // Silently fail — user will start a new conversation
      }
    }
    loadConversation();
  }, []);

  // Basket state
  const [basketItems, setBasketItems] = useState<BasketItem[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleAddToBasket = useCallback(
    (product: ProcessedProduct, variant: Record<string, string>) => {
      setBasketItems((prev) => [
        ...prev,
        { product, variant, quantity: 1, addedAt: Date.now() },
      ]);
      setBasketOpen(true);
    },
    []
  );

  const handleRemoveItem = useCallback((index: number) => {
    setBasketItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateQuantity = useCallback(
    (index: number, quantity: number) => {
      setBasketItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, quantity } : item))
      );
    },
    []
  );

  const handleCheckout = useCallback(
    async (forwarderAddress: string) => {
      setIsCheckingOut(true);
      try {
        const response = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: basketItems.map((item) => ({
              product_id: item.product.id,
              platform: item.product.platform,
              title_en: item.product.title_en,
              title_cn: item.product.title_cn,
              image_url: item.product.image_url,
              product_url: item.product.product_url,
              price_cny: item.product.price_cny,
              quantity: item.quantity,
              variant: item.variant,
            })),
            forwarder_address: forwarderAddress,
            display_currency: currencyCode,
          }),
        });

        if (!response.ok) {
          throw new Error("Checkout failed");
        }

        const data = await response.json();

        // Redirect to BOG Pay
        if (data.payment_url) {
          window.location.href = data.payment_url;
        }
      } catch (error) {
        console.error("Checkout error:", error);
        // Add error message to chat
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Sorry, checkout failed. Please try again.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsCheckingOut(false);
      }
    },
    [basketItems, currencyCode]
  );

  const handleSend = useCallback(
    async (message: string, imageBase64?: string) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setStreamingContent("");

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            image_base64: imageBase64,
            conversation_id: conversationId,
            currency: currencyCode,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || `Chat request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let assistantText = "";
        let products: ProcessedProduct[] | undefined;
        let isSearchLimit = false;
        let searchLimitData:
          | { count: number; limit: number; trialClaimed: boolean }
          | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "text":
                  assistantText += data.content;
                  setStreamingContent(assistantText);
                  break;

                case "product_cards":
                  products = data.products;
                  break;

                case "search_limit":
                  isSearchLimit = true;
                  searchLimitData = {
                    count: data.count,
                    limit: data.limit,
                    trialClaimed: data.trial_claimed,
                  };
                  break;

                case "status":
                  break;

                case "done":
                  if (data.conversation_id) {
                    setConversationId(data.conversation_id);
                  }
                  break;

                case "error":
                  assistantText += data.content;
                  setStreamingContent(assistantText);
                  break;
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantText,
          products,
          isSearchLimit,
          searchLimitData,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error("Chat error:", error);
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
      }
    },
    [conversationId, currencyCode]
  );

  return (
    <div className="flex flex-col h-screen bg-cream">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-gray-light bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium tracking-wide text-charcoal">
            commercat
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Basket button */}
          <button
            onClick={() => setBasketOpen(true)}
            className="relative text-xs text-gray-dark hover:text-charcoal transition-colors"
          >
            Basket
            {basketItems.length > 0 && (
              <span className="absolute -top-1.5 -right-3 w-4 h-4 bg-accent text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                {basketItems.length}
              </span>
            )}
          </button>
          <Link
            href="/orders"
            className="text-xs text-gray-dark hover:text-charcoal transition-colors"
          >
            Orders
          </Link>
          <Link
            href="/settings"
            className="text-xs text-gray-dark hover:text-charcoal transition-colors"
          >
            Settings
          </Link>
        </div>
      </header>

      {/* Chat area */}
      <ChatWindow
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        onAddToBasket={handleAddToBasket}
      />

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isStreaming} />

      {/* Basket panel */}
      <BasketPanel
        items={basketItems}
        isOpen={basketOpen}
        onClose={() => setBasketOpen(false)}
        onRemoveItem={handleRemoveItem}
        onUpdateQuantity={handleUpdateQuantity}
        onCheckout={handleCheckout}
        walletBalanceGel={0}
        isCheckingOut={isCheckingOut}
      />
    </div>
  );
}

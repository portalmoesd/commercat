"use client";

import { useState, useCallback } from "react";
import { ChatWindow, type ChatMessage } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { useCurrency } from "@/lib/currency-context";
import type { ProcessedProduct } from "@/types";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const { currencyCode } = useCurrency();

  const handleSend = useCallback(
    async (message: string, imageBase64?: string) => {
      // Add user message immediately
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
          throw new Error(`Chat request failed: ${response.status}`);
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
                  // Could show a status indicator, for now just continue
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

        // Add final assistant message
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
          <button className="text-xs text-gray-dark hover:text-charcoal transition-colors">
            Orders
          </button>
          <button className="text-xs text-gray-dark hover:text-charcoal transition-colors">
            Settings
          </button>
        </div>
      </header>

      {/* Chat area */}
      <ChatWindow
        messages={messages}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
      />

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

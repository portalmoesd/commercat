"use client";

import { useEffect, useRef } from "react";
import type { ProcessedProduct, OrderTracking } from "@/types";
import { ProductCardRow } from "./ProductCardRow";
import { SearchLimitPrompt } from "./SearchLimitPrompt";
import { TrackingCard } from "./TrackingCard";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  products?: ProcessedProduct[];
  trackingInfo?: OrderTracking;
  isSearchLimit?: boolean;
  searchLimitData?: {
    count: number;
    limit: number;
    trialClaimed: boolean;
  };
  timestamp: Date;
}

interface ChatWindowProps {
  messages: ChatMessage[];
  streamingContent: string;
  isStreaming: boolean;
  onAddToBasket?: (product: ProcessedProduct, variant: Record<string, string>) => void;
}

export function ChatWindow({
  messages,
  streamingContent,
  isStreaming,
  onAddToBasket,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-col items-center justify-center h-full text-gray-mid">
          <div className="text-4xl mb-4">🐱</div>
          <h2 className="text-lg font-medium text-charcoal mb-1">
            Welcome to Commercat
          </h2>
          <p className="text-sm text-center max-w-sm">
            Describe what you&apos;re looking for, or upload a photo to find
            similar products from Chinese marketplaces.
          </p>
        </div>
      )}

      {messages.map((msg) => (
        <div
          key={msg.id}
          className="animate-[fadeSlideUp_150ms_ease-out]"
        >
          {/* Message bubble */}
          <div
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] md:max-w-[70%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-charcoal text-white rounded-[12px_12px_0_12px]"
                  : "bg-white border border-gray-light rounded-[12px_12px_12px_0]"
              }`}
            >
              {msg.content}
            </div>
          </div>

          {/* Product cards */}
          {msg.products && msg.products.length > 0 && (
            <div className="mt-3">
              <ProductCardRow products={msg.products} onAddToBasket={onAddToBasket} />
            </div>
          )}

          {/* Search limit prompt */}
          {msg.isSearchLimit && msg.searchLimitData && (
            <div className="mt-3">
              <SearchLimitPrompt
                limit={msg.searchLimitData.limit}
                trialClaimed={msg.searchLimitData.trialClaimed}
              />
            </div>
          )}

          {/* Tracking card */}
          {msg.trackingInfo && (
            <div className="mt-3">
              <TrackingCard tracking={msg.trackingInfo} />
            </div>
          )}
        </div>
      ))}

      {/* Streaming bubble */}
      {isStreaming && streamingContent && (
        <div className="flex justify-start animate-[fadeSlideUp_150ms_ease-out]">
          <div className="max-w-[85%] md:max-w-[70%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap bg-white border border-gray-light rounded-[12px_12px_12px_0]">
            {streamingContent}
          </div>
        </div>
      )}

      {/* Typing indicator */}
      {isStreaming && !streamingContent && (
        <div className="flex justify-start">
          <div className="px-4 py-3 bg-white border border-gray-light rounded-[12px_12px_12px_0]">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

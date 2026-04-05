"use client";

import { useState, useRef, type KeyboardEvent, type ChangeEvent } from "react";

interface ChatInputProps {
  onSend: (message: string, imageBase64?: string, imagePreview?: string) => void;
  disabled: boolean;
}

const QUICK_CHIPS = [
  { label: "Find by photo", icon: "📷" },
  { label: "Track my order", icon: "📦" },
  { label: "Sizing help", icon: "📏" },
  { label: "Find a dupe", icon: "🔍" },
];

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed && !imageBase64) return;

    onSend(trimmed || "Find products similar to this image", imageBase64 ?? undefined, imagePreview ?? undefined);
    setText("");
    setImagePreview(null);
    setImageBase64(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setImagePreview(result);
      // Strip data URL prefix for base64
      setImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = "";
  }

  function handleChipClick(label: string) {
    if (label === "Find by photo") {
      fileInputRef.current?.click();
    } else {
      onSend(label);
    }
  }

  return (
    <div className="border-t border-gray-light bg-white px-4 py-3">
      {/* Quick chips — shown only when no messages would be sent */}
      {!disabled && !text && !imageBase64 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          {QUICK_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() => handleChipClick(chip.label)}
              className="flex-shrink-0 px-3 py-1.5 text-xs font-medium bg-gray-light text-charcoal rounded-full hover:bg-gray-mid/30 transition-colors"
            >
              {chip.icon} {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="relative inline-block mb-2">
          <img
            src={imagePreview}
            alt="Upload preview"
            className="h-20 w-20 object-cover rounded-lg border border-gray-light"
          />
          <button
            onClick={() => {
              setImagePreview(null);
              setImageBase64(null);
            }}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-charcoal text-white rounded-full text-xs flex items-center justify-center"
          >
            &times;
          </button>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Photo upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-gray-light text-gray-dark hover:bg-gray-light transition-colors disabled:opacity-40"
          title="Upload photo"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageUpload}
        />

        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="What are you looking for?"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-light px-3 py-2.5 text-sm bg-cream placeholder:text-gray-mid focus:outline-none focus:border-charcoal transition-colors disabled:opacity-40"
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={disabled || (!text.trim() && !imageBase64)}
          className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-charcoal text-white hover:bg-charcoal/90 transition-colors disabled:opacity-40"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

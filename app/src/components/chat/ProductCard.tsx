"use client";

import { useState } from "react";
import type { ProcessedProduct } from "@/types";
import { getCurrencyInfo } from "@/lib/currency";

interface ProductCardProps {
  product: ProcessedProduct;
  onAddToBasket?: (product: ProcessedProduct, variant: Record<string, string>) => void;
}

const PLATFORM_LABELS: Record<string, string> = {
  taobao: "TAOBAO",
  "1688": "1688",
  tmall: "TMALL",
  pinduoduo: "PDD",
};

const PLATFORM_COLORS: Record<string, string> = {
  taobao: "bg-orange-100 text-orange-700",
  "1688": "bg-yellow-100 text-yellow-700",
  tmall: "bg-red-100 text-red-700",
  pinduoduo: "bg-purple-100 text-purple-700",
};

export function ProductCard({ product, onAddToBasket }: ProductCardProps) {
  const [selectedSize, setSelectedSize] = useState<string | undefined>();
  const [selectedColor, setSelectedColor] = useState<string | undefined>();

  const currencyInfo = getCurrencyInfo(product.currency);
  const symbol = currencyInfo.symbol;

  // Extract unique sizes and colors from SKUs
  const sizes = [...new Set(product.skus.map((s) => s.size).filter(Boolean))] as string[];
  const colors = [...new Set(product.skus.map((s) => s.color).filter(Boolean))] as string[];

  function handleAddToBasket() {
    const variant: Record<string, string> = {};
    if (selectedSize) variant.size = selectedSize;
    if (selectedColor) variant.color = selectedColor;
    onAddToBasket?.(product, variant);
  }

  return (
    <div className="w-[180px] flex-shrink-0 bg-white border border-gray-light rounded-lg overflow-hidden">
      {/* Image */}
      <div className="relative w-full h-[180px] bg-gray-light">
        {product.image_url && (
          <img
            src={product.image_url}
            alt={product.title_en}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        )}

        {/* Platform badge */}
        <span
          className={`absolute top-2 left-2 px-1.5 py-0.5 text-[10px] font-medium rounded ${
            PLATFORM_COLORS[product.platform] ?? "bg-gray-100 text-gray-600"
          }`}
        >
          {PLATFORM_LABELS[product.platform] ?? product.platform}
        </span>

        {/* Branded disclaimer */}
        {product.branded && (
          <span className="absolute bottom-2 left-2 right-2 px-1.5 py-0.5 text-[9px] bg-accent-light text-accent rounded text-center">
            Similar style — not guaranteed authentic
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-2.5">
        {/* Title */}
        <p className="text-xs font-medium text-charcoal line-clamp-2 mb-2 leading-snug">
          {product.title_en}
        </p>

        {/* Two-line price breakdown (mandatory) */}
        <div className="font-mono text-[11px] space-y-0.5 mb-2">
          <div className="flex justify-between text-gray-dark">
            <span>Item cost</span>
            <span>
              {symbol}
              {product.item_cost_local.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between text-gray-dark">
            <span>Service fee</span>
            <span>
              {symbol}
              {product.commission_local.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between font-medium text-charcoal border-t border-gray-light pt-0.5">
            <span>Total</span>
            <span>
              {symbol}
              {product.total_local.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Size selector */}
        {sizes.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {sizes.map((size) => (
              <button
                key={size}
                onClick={() => setSelectedSize(selectedSize === size ? undefined : size)}
                className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                  selectedSize === size
                    ? "border-charcoal bg-charcoal text-white"
                    : "border-gray-light text-gray-dark hover:border-gray-mid"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        )}

        {/* Color selector */}
        {colors.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setSelectedColor(selectedColor === color ? undefined : color)}
                className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                  selectedColor === color
                    ? "border-charcoal bg-charcoal text-white"
                    : "border-gray-light text-gray-dark hover:border-gray-mid"
                }`}
              >
                {color}
              </button>
            ))}
          </div>
        )}

        {/* Add to basket button */}
        <button
          onClick={handleAddToBasket}
          className="w-full py-1.5 text-xs font-medium bg-charcoal text-white rounded hover:bg-charcoal/90 transition-colors"
        >
          Add to basket
        </button>
      </div>
    </div>
  );
}

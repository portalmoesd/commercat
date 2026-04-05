"use client";

import { useState, useEffect } from "react";
import type { ProcessedProduct, ProductDetailData } from "@/types";
import { getCurrencyInfo } from "@/lib/currency";

interface ProductDetailProps {
  product: ProcessedProduct;
  isOpen: boolean;
  onClose: () => void;
  onAddToBasket?: (product: ProcessedProduct, variant: Record<string, string>) => void;
}

export function ProductDetail({
  product,
  isOpen,
  onClose,
  onAddToBasket,
}: ProductDetailProps) {
  const [detail, setDetail] = useState<ProductDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | undefined>();
  const [selectedColor, setSelectedColor] = useState<string | undefined>();

  const currencyInfo = getCurrencyInfo(product.currency);
  const symbol = currencyInfo.symbol;

  // Fetch product detail on open
  useEffect(() => {
    if (!isOpen || detail) return;

    setLoading(true);
    fetch(`/api/products/${product.id}?platform=${product.platform}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setDetail(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, detail, product.id, product.platform]);

  // All images: detail pictures or fallback to single image
  const images = detail?.pictures?.length
    ? detail.pictures
    : product.image_url
      ? [product.image_url]
      : [];

  // Merge SKUs from detail (if available) with product SKUs
  const skus = detail?.skus?.length ? detail.skus : product.skus;
  const sizes = [...new Set(skus.map((s) => s.size).filter(Boolean))] as string[];
  const colors = [...new Set(skus.map((s) => s.color).filter(Boolean))] as string[];

  function handleAddToBasket() {
    const variant: Record<string, string> = {};
    if (selectedSize) variant.size = selectedSize;
    if (selectedColor) variant.color = selectedColor;
    onAddToBasket?.(product, variant);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] bg-white rounded-t-xl overflow-hidden flex flex-col animate-[fadeSlideUp_200ms_ease-out] md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:w-full md:rounded-xl md:max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-light flex-shrink-0">
          <span className="text-xs font-mono text-gray-dark">
            {product.platform.toUpperCase()}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-dark hover:text-charcoal text-lg"
          >
            &times;
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Image gallery */}
          <div className="bg-gray-light">
            {/* Main image */}
            <div className="w-full h-[300px] md:h-[350px] flex items-center justify-center">
              {images[selectedImage] ? (
                <img
                  src={images[selectedImage]}
                  alt={product.title_en}
                  className="max-w-full max-h-full object-contain"
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                />
              ) : (
                <div className="text-gray-mid text-sm">No image</div>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-1.5 px-4 py-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`w-14 h-14 flex-shrink-0 rounded border-2 overflow-hidden ${
                      selectedImage === i
                        ? "border-charcoal"
                        : "border-transparent opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img
                      src={img}
                      alt=""
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="px-4 py-4 space-y-3">
            {/* Title */}
            <h3 className="text-sm font-medium text-charcoal leading-snug">
              {product.title_en}
            </h3>

            {/* Chinese title */}
            {product.title_cn && (
              <p className="text-xs text-gray-mid">{product.title_cn}</p>
            )}

            {/* Branded disclaimer */}
            {product.branded && (
              <span className="text-[10px] text-accent bg-accent-light px-2 py-1 rounded inline-block">
                Similar style — authenticity not guaranteed
              </span>
            )}

            {/* Shop info */}
            <div className="flex items-center gap-3 text-xs text-gray-dark">
              {product.shop_name && (
                <span>{product.shop_name}</span>
              )}
              {product.sales_count > 0 && (
                <span>{product.sales_count.toLocaleString()} sold</span>
              )}
            </div>

            {/* Price breakdown */}
            <div className="bg-cream rounded-lg p-3 font-mono text-sm space-y-1">
              <div className="flex justify-between text-gray-dark">
                <span>Item cost</span>
                <span>{symbol}{product.item_cost_local.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-dark">
                <span>Service fee</span>
                <span>{symbol}{product.commission_local.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-medium text-charcoal border-t border-gray-light pt-1">
                <span>Total</span>
                <span>{symbol}{product.total_local.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-gray-mid pt-1">
                Original: ¥{product.price_cny.toFixed(2)} CNY
              </p>
            </div>

            {/* Size selector */}
            {sizes.length > 0 && (
              <div>
                <p className="text-xs text-gray-dark mb-1.5">Size</p>
                <div className="flex flex-wrap gap-1.5">
                  {sizes.map((size) => (
                    <button
                      key={size}
                      onClick={() =>
                        setSelectedSize(selectedSize === size ? undefined : size)
                      }
                      className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                        selectedSize === size
                          ? "border-charcoal bg-charcoal text-white"
                          : "border-gray-light text-gray-dark hover:border-gray-mid"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color selector */}
            {colors.length > 0 && (
              <div>
                <p className="text-xs text-gray-dark mb-1.5">Color</p>
                <div className="flex flex-wrap gap-1.5">
                  {colors.map((color) => (
                    <button
                      key={color}
                      onClick={() =>
                        setSelectedColor(
                          selectedColor === color ? undefined : color
                        )
                      }
                      className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                        selectedColor === color
                          ? "border-charcoal bg-charcoal text-white"
                          : "border-gray-light text-gray-dark hover:border-gray-mid"
                      }`}
                    >
                      {color}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {detail?.description && (
              <div>
                <p className="text-xs text-gray-dark mb-1">Description</p>
                <div
                  className="text-xs text-gray-dark leading-relaxed max-h-40 overflow-y-auto prose-sm"
                  dangerouslySetInnerHTML={{
                    __html: detail.description.slice(0, 2000),
                  }}
                />
              </div>
            )}

            {/* View on marketplace link */}
            <a
              href={product.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-gray-dark underline hover:text-charcoal"
            >
              View on {product.platform === "1688" ? "1688.com" : product.platform === "taobao" ? "Taobao" : product.platform === "tmall" ? "Tmall" : product.platform}
            </a>

            {/* Loading state */}
            {loading && (
              <div className="flex justify-center py-4">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-gray-mid rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer — Add to basket */}
        <div className="border-t border-gray-light px-4 py-3 flex-shrink-0">
          <button
            onClick={handleAddToBasket}
            className="w-full py-3 text-sm font-medium bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors"
          >
            Add to basket — {symbol}{product.total_local.toFixed(2)}
          </button>
        </div>
      </div>
    </>
  );
}

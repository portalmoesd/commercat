"use client";

import { useState } from "react";
import type { ProcessedProduct } from "@/types";
import { ProductCard } from "./ProductCard";
import { ProductDetail } from "./ProductDetail";

interface ProductCardRowProps {
  products: ProcessedProduct[];
  onAddToBasket?: (product: ProcessedProduct, variant: Record<string, string>) => void;
}

export function ProductCardRow({ products, onAddToBasket }: ProductCardRowProps) {
  const [expandedProduct, setExpandedProduct] = useState<ProcessedProduct | null>(null);

  if (products.length === 0) return null;

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onAddToBasket={onAddToBasket}
            onExpand={setExpandedProduct}
          />
        ))}
      </div>

      {/* Product detail modal */}
      {expandedProduct && (
        <ProductDetail
          product={expandedProduct}
          isOpen={true}
          onClose={() => setExpandedProduct(null)}
          onAddToBasket={onAddToBasket}
        />
      )}
    </>
  );
}

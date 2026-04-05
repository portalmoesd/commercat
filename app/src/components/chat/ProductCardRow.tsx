"use client";

import type { ProcessedProduct } from "@/types";
import { ProductCard } from "./ProductCard";

interface ProductCardRowProps {
  products: ProcessedProduct[];
  onAddToBasket?: (product: ProcessedProduct, variant: Record<string, string>) => void;
}

export function ProductCardRow({ products, onAddToBasket }: ProductCardRowProps) {
  if (products.length === 0) return null;

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onAddToBasket={onAddToBasket}
        />
      ))}
    </div>
  );
}

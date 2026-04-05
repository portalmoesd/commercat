"use client";

interface Props {
  brandPrice: { price: string; source: string };
  commercatTotal: string;
}

export function DupePriceReveal({ brandPrice, commercatTotal }: Props) {
  return (
    <div className="bg-accent-light border border-accent/20 rounded-lg p-4 max-w-sm mb-3">
      <p className="text-[10px] text-gray-dark uppercase tracking-widest mb-2">
        Price comparison
      </p>
      <div className="flex items-center gap-3">
        <div className="text-center">
          <p className="text-lg font-mono font-medium text-gray-dark line-through">
            {brandPrice.price}
          </p>
          <p className="text-[10px] text-gray-mid">{brandPrice.source}</p>
        </div>
        <div className="text-accent text-xl">→</div>
        <div className="text-center">
          <p className="text-lg font-mono font-medium text-green">
            {commercatTotal}
          </p>
          <p className="text-[10px] text-gray-mid">on Commercat</p>
        </div>
      </div>
    </div>
  );
}

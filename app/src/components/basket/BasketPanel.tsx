"use client";

import { useState, useEffect } from "react";
import { useCurrency } from "@/lib/currency-context";
import { getCurrencyInfo } from "@/lib/currency";
import type { ProcessedProduct, Forwarder } from "@/types";

export interface BasketItem {
  product: ProcessedProduct;
  variant: Record<string, string>;
  quantity: number;
  addedAt: number; // timestamp for price lock (30 min validity)
}

interface BasketPanelProps {
  items: BasketItem[];
  isOpen: boolean;
  onClose: () => void;
  onRemoveItem: (index: number) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onCheckout: (forwarderAddress: string) => void;
  walletBalanceGel: number;
  isCheckingOut: boolean;
}

export function BasketPanel({
  items,
  isOpen,
  onClose,
  onRemoveItem,
  onUpdateQuantity,
  onCheckout,
  walletBalanceGel,
  isCheckingOut,
}: BasketPanelProps) {
  const { currencyCode, rates } = useCurrency();
  const [forwarders, setForwarders] = useState<Forwarder[]>([]);
  const [selectedForwarder, setSelectedForwarder] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [applyWallet, setApplyWallet] = useState(false);

  const currencyInfo = getCurrencyInfo(currencyCode);
  const symbol = currencyInfo.symbol;

  // Fetch forwarders
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/forwarders")
      .then((r) => r.json())
      .then((data) => {
        if (data.forwarders) setForwarders(data.forwarders);
      })
      .catch(console.error);
  }, [isOpen]);

  // Calculate totals in local currency
  const itemCostTotal = items.reduce(
    (sum, item) => sum + item.product.item_cost_local * item.quantity,
    0
  );
  const commissionTotal = items.reduce(
    (sum, item) => sum + item.product.commission_local * item.quantity,
    0
  );
  const subtotal = itemCostTotal + commissionTotal;

  // Calculate GEL total for checkout display
  const gelRate = rates?.["GEL"];
  const localRate = rates?.[currencyCode];
  let totalGel = 0;
  if (gelRate && localRate) {
    // Convert from local currency back to CNY, then to GEL
    totalGel = (subtotal / localRate) * gelRate;
  }
  totalGel = Math.round(totalGel * 100) / 100;

  // Wallet credit (in GEL)
  const walletCredit = applyWallet ? Math.min(walletBalanceGel, totalGel) : 0;
  const chargeGel = Math.round((totalGel - walletCredit) * 100) / 100;

  // Check price lock validity (30 min)
  const now = Date.now();
  const hasExpiredPrices = items.some(
    (item) => now - item.addedAt > 30 * 60 * 1000
  );

  const forwarderAddress =
    selectedForwarder === "custom"
      ? customAddress
      : forwarders.find((f) => f.id === selectedForwarder)?.cn_address ?? "";

  function handleCheckout() {
    if (!forwarderAddress) return;
    onCheckout(forwarderAddress);
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white z-50 shadow-xl flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-light">
          <h2 className="text-base font-medium">
            Basket ({items.length})
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-gray-dark hover:text-charcoal"
          >
            &times;
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 && (
            <p className="text-sm text-gray-mid text-center py-8">
              Your basket is empty
            </p>
          )}

          {items.map((item, index) => (
            <div
              key={`${item.product.id}-${index}`}
              className="flex gap-3 border-b border-gray-light pb-4"
            >
              {/* Thumbnail */}
              {item.product.image_url && (
                <img
                  src={item.product.image_url}
                  alt={item.product.title_en}
                  className="w-16 h-16 rounded object-cover border border-gray-light flex-shrink-0"
                />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-charcoal truncate">
                  {item.product.title_en}
                </p>

                {/* Variant */}
                {Object.keys(item.variant).length > 0 && (
                  <p className="text-[11px] text-gray-dark mt-0.5">
                    {Object.entries(item.variant)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(", ")}
                  </p>
                )}

                {/* Price breakdown */}
                <div className="font-mono text-[11px] text-gray-dark mt-1">
                  <span>
                    {symbol}
                    {(item.product.total_local * item.quantity).toFixed(2)}
                  </span>
                </div>

                {/* Quantity + remove */}
                <div className="flex items-center gap-2 mt-1.5">
                  <select
                    value={item.quantity}
                    onChange={(e) =>
                      onUpdateQuantity(index, parseInt(e.target.value))
                    }
                    className="text-xs border border-gray-light rounded px-1.5 py-0.5 bg-white"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        Qty: {n}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => onRemoveItem(index)}
                    className="text-[11px] text-gray-dark hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer — summary + checkout */}
        {items.length > 0 && (
          <div className="border-t border-gray-light px-5 py-4 space-y-3">
            {/* Price lock warning */}
            {hasExpiredPrices && (
              <div className="text-[11px] text-accent bg-accent-light px-3 py-2 rounded">
                Some prices may have changed. Prices will be refreshed at
                checkout.
              </div>
            )}

            {/* Forwarder selector */}
            <div>
              <label className="text-xs text-gray-dark block mb-1">
                Freight forwarder
              </label>
              <select
                value={selectedForwarder}
                onChange={(e) => setSelectedForwarder(e.target.value)}
                className="w-full text-sm border border-gray-light rounded-lg px-3 py-2 bg-white"
              >
                <option value="">Select forwarder...</option>
                {forwarders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
                <option value="custom">Custom address</option>
              </select>
            </div>

            {selectedForwarder === "custom" && (
              <textarea
                value={customAddress}
                onChange={(e) => setCustomAddress(e.target.value)}
                placeholder="Enter your China warehouse address..."
                className="w-full text-sm border border-gray-light rounded-lg px-3 py-2 bg-white resize-none"
                rows={2}
              />
            )}

            {/* Order summary — two-line breakdown */}
            <div className="font-mono text-xs space-y-1">
              <div className="flex justify-between text-gray-dark">
                <span>Item cost</span>
                <span>
                  {symbol}
                  {itemCostTotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-gray-dark">
                <span>Service fee</span>
                <span>
                  {symbol}
                  {commissionTotal.toFixed(2)}
                </span>
              </div>
              <div className="border-t border-gray-light pt-1 flex justify-between font-medium text-charcoal">
                <span>Total</span>
                <span>
                  {symbol}
                  {subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-gray-dark text-[11px]">
                <span>You&apos;ll be charged</span>
                <span>{chargeGel.toFixed(2)} GEL</span>
              </div>
            </div>

            {/* Wallet balance */}
            {walletBalanceGel > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-dark cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyWallet}
                  onChange={(e) => setApplyWallet(e.target.checked)}
                  className="rounded"
                />
                Apply wallet balance: -
                {Math.min(walletBalanceGel, totalGel).toFixed(2)} GEL
              </label>
            )}

            {/* Agency disclosure */}
            <p className="text-[10px] text-gray-mid leading-snug">
              Commercat purchases this order in your name, to your freight
              forwarder&apos;s personal cabinet.
            </p>

            {/* Checkout button */}
            <button
              onClick={handleCheckout}
              disabled={!forwarderAddress || isCheckingOut}
              className="w-full py-3 text-sm font-medium bg-charcoal text-white rounded-lg hover:bg-charcoal/90 transition-colors disabled:opacity-40"
            >
              {isCheckingOut ? "Processing..." : `Pay ${chargeGel.toFixed(2)} GEL`}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

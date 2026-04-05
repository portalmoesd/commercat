"use client";

import { useState, useEffect } from "react";
import { useCurrency } from "@/lib/currency-context";
import { getCurrencyInfo } from "@/lib/currency";
import type { Order, OrderStatus } from "@/types";
import Link from "next/link";

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string }
> = {
  pending_payment: { label: "Pending payment", color: "bg-gray-light text-gray-dark" },
  paid: { label: "Paid", color: "bg-blue-100 text-blue-700" },
  purchasing: { label: "Purchasing", color: "bg-yellow-100 text-yellow-700" },
  purchased: { label: "Purchased", color: "bg-indigo-100 text-indigo-700" },
  shipped: { label: "Shipped", color: "bg-purple-100 text-purple-700" },
  at_warehouse: { label: "At warehouse", color: "bg-green-light text-green-dark" },
  cancelled: { label: "Cancelled", color: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", color: "bg-orange-100 text-orange-700" },
};

const STATUS_STEPS: OrderStatus[] = ["paid", "purchased", "shipped", "at_warehouse"];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { currencyCode } = useCurrency();

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function displayPrice(order: Order): string {
    // Convert from GEL to display currency using stored rates
    if (order.display_currency && order.display_fx_rate && order.fx_rate_used) {
      const cnyAmount = order.total_gel / order.fx_rate_used;
      const displayAmount = cnyAmount * order.display_fx_rate;
      const info = getCurrencyInfo(order.display_currency);
      return `${info.symbol}${displayAmount.toFixed(2)}`;
    }
    return `${order.total_gel.toFixed(2)} GEL`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-gray-mid">Loading orders...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="flex items-center justify-between px-4 h-14 border-b border-gray-light bg-white/95 backdrop-blur-sm">
        <Link
          href="/chat"
          className="font-mono text-sm font-medium tracking-wide text-charcoal"
        >
          commercat
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-charcoal">Orders</span>
          <Link
            href="/settings"
            className="text-xs text-gray-dark hover:text-charcoal transition-colors"
          >
            Settings
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-lg font-medium mb-6">Your orders</h1>

        {orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-mid mb-4">No orders yet</p>
            <Link
              href="/chat"
              className="text-sm text-charcoal font-medium underline"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const config = STATUS_CONFIG[order.status];
              const currentStep = STATUS_STEPS.indexOf(order.status as OrderStatus);

              return (
                <div
                  key={order.id}
                  className="bg-white border border-gray-light rounded-lg p-4"
                >
                  {/* Order header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs font-mono text-gray-dark">
                        COM-{order.id.slice(-6).toUpperCase()}
                      </p>
                      <p className="text-sm font-medium mt-0.5">
                        {displayPrice(order)}
                      </p>
                      <p className="text-[11px] text-gray-mid mt-0.5">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${config.color}`}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Items */}
                  {order.items && order.items.length > 0 && (
                    <div className="flex gap-2 mb-3 overflow-x-auto">
                      {order.items.map((item) => (
                        <div key={item.id} className="flex-shrink-0">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.title_en}
                              className="w-12 h-12 rounded object-cover border border-gray-light"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-gray-light" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Status timeline */}
                  {currentStep >= 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      {STATUS_STEPS.map((step, i) => (
                        <div key={step} className="flex items-center flex-1">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              i <= currentStep ? "bg-green" : "bg-gray-light"
                            }`}
                          />
                          {i < STATUS_STEPS.length - 1 && (
                            <div
                              className={`flex-1 h-px mx-1 ${
                                i < currentStep ? "bg-green" : "bg-gray-light"
                              }`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Tracking number */}
                  {order.tracking_number && (
                    <p className="text-[11px] text-gray-dark mt-2">
                      Tracking:{" "}
                      <span className="font-mono">
                        {order.tracking_number}
                      </span>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

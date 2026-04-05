"use client";

import { useState } from "react";
import type { Order, OrderStatus } from "@/types";

interface OrderTableProps {
  orders: Order[];
  onStatusUpdate: (
    orderId: string,
    status: string,
    trackingNumber?: string,
    taobaoOrderId?: string,
    notes?: string
  ) => Promise<void>;
}

const STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "paid", label: "Paid" },
  { value: "purchasing", label: "Purchasing" },
  { value: "purchased", label: "Purchased" },
  { value: "shipped", label: "Shipped" },
  { value: "at_warehouse", label: "At warehouse" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const STATUS_COLORS: Record<string, string> = {
  pending_payment: "bg-gray-100 text-gray-600",
  paid: "bg-blue-100 text-blue-700",
  purchasing: "bg-yellow-100 text-yellow-700",
  purchased: "bg-indigo-100 text-indigo-700",
  shipped: "bg-purple-100 text-purple-700",
  at_warehouse: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-orange-100 text-orange-700",
};

interface OrderRowState {
  status: string;
  trackingNumber: string;
  taobaoOrderId: string;
  notes: string;
  saving: boolean;
}

export function OrderTable({ orders, onStatusUpdate }: OrderTableProps) {
  const [rowStates, setRowStates] = useState<Record<string, OrderRowState>>(
    () => {
      const states: Record<string, OrderRowState> = {};
      for (const order of orders) {
        states[order.id] = {
          status: order.status,
          trackingNumber: order.tracking_number ?? "",
          taobaoOrderId: order.taobao_order_id ?? "",
          notes: order.notes ?? "",
          saving: false,
        };
      }
      return states;
    }
  );

  function updateRow(orderId: string, updates: Partial<OrderRowState>) {
    setRowStates((prev) => ({
      ...prev,
      [orderId]: { ...prev[orderId], ...updates },
    }));
  }

  async function handleSave(orderId: string) {
    const row = rowStates[orderId];
    if (!row) return;

    updateRow(orderId, { saving: true });

    await onStatusUpdate(
      orderId,
      row.status,
      row.trackingNumber || undefined,
      row.taobaoOrderId || undefined,
      row.notes || undefined
    );

    updateRow(orderId, { saving: false });
  }

  if (orders.length === 0) {
    return (
      <p className="text-sm text-gray-mid text-center py-8">No orders found</p>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const row = rowStates[order.id];
        if (!row) return null;

        const orderNumber = `COM-${order.id.slice(-6).toUpperCase()}`;

        return (
          <div
            key={order.id}
            className="bg-white border border-gray-light rounded-lg p-4"
          >
            {/* Header row */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs font-mono text-gray-dark">
                  {orderNumber}
                </p>
                <p className="text-sm font-medium">
                  {order.total_gel.toFixed(2)} GEL
                </p>
                <p className="text-[11px] text-gray-mid">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${
                  STATUS_COLORS[order.status] ?? STATUS_COLORS.pending_payment
                }`}
              >
                {order.status.replace("_", " ")}
              </span>
            </div>

            {/* Items */}
            {order.items && order.items.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-8 h-8 rounded object-cover border border-gray-light"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate">{item.title_en}</p>
                      <p className="text-[10px] text-gray-dark">
                        x{item.quantity} &middot; {item.price_cny} CNY
                      </p>
                    </div>
                    <a
                      href={item.product_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 hover:underline flex-shrink-0"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Forwarder address */}
            <p className="text-[10px] text-gray-dark mb-3 truncate">
              Ship to: {order.forwarder_address}
            </p>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-dark block mb-0.5">
                  Status
                </label>
                <select
                  value={row.status}
                  onChange={(e) =>
                    updateRow(order.id, { status: e.target.value })
                  }
                  className="w-full text-xs border border-gray-light rounded px-2 py-1.5 bg-white"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-dark block mb-0.5">
                  Taobao order ID
                </label>
                <input
                  value={row.taobaoOrderId}
                  onChange={(e) =>
                    updateRow(order.id, { taobaoOrderId: e.target.value })
                  }
                  placeholder="Taobao order #"
                  className="w-full text-xs border border-gray-light rounded px-2 py-1.5 bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-dark block mb-0.5">
                  Tracking number
                </label>
                <input
                  value={row.trackingNumber}
                  onChange={(e) =>
                    updateRow(order.id, { trackingNumber: e.target.value })
                  }
                  placeholder="Tracking #"
                  className="w-full text-xs border border-gray-light rounded px-2 py-1.5 bg-white"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-dark block mb-0.5">
                  Internal notes
                </label>
                <input
                  value={row.notes}
                  onChange={(e) =>
                    updateRow(order.id, { notes: e.target.value })
                  }
                  placeholder="Notes..."
                  className="w-full text-xs border border-gray-light rounded px-2 py-1.5 bg-white"
                />
              </div>
            </div>

            <button
              onClick={() => handleSave(order.id)}
              disabled={row.saving}
              className="mt-3 w-full py-1.5 text-xs font-medium bg-charcoal text-white rounded hover:bg-charcoal/90 transition-colors disabled:opacity-40"
            >
              {row.saving ? "Saving..." : "Save"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

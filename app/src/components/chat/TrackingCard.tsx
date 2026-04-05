"use client";

import type { OrderTracking, OrderStatus } from "@/types";

interface TrackingCardProps {
  tracking: OrderTracking;
}

const STATUS_STEPS: { key: OrderStatus; label: string }[] = [
  { key: "paid", label: "Paid" },
  { key: "purchased", label: "Purchased" },
  { key: "shipped", label: "Shipped" },
  { key: "at_warehouse", label: "At warehouse" },
];

const STATUS_INDEX: Record<string, number> = {
  pending_payment: -1,
  paid: 0,
  purchasing: 0,
  purchased: 1,
  shipped: 2,
  at_warehouse: 3,
  cancelled: -1,
  refunded: -1,
};

export function TrackingCard({ tracking }: TrackingCardProps) {
  const currentIndex = STATUS_INDEX[tracking.status] ?? -1;
  const isCancelled =
    tracking.status === "cancelled" || tracking.status === "refunded";

  return (
    <div className="bg-white border border-gray-light rounded-lg p-4 max-w-sm">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        {tracking.image_url && (
          <img
            src={tracking.image_url}
            alt={tracking.title_en}
            className="w-12 h-12 rounded object-cover border border-gray-light"
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-gray-dark">
            {tracking.order_number}
          </p>
          <p className="text-sm font-medium text-charcoal truncate">
            {tracking.title_en}
          </p>
        </div>
      </div>

      {/* Status timeline */}
      {isCancelled ? (
        <div className="px-3 py-2 bg-red-50 text-red-600 text-xs font-medium rounded">
          Order {tracking.status}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {STATUS_STEPS.map((step, i) => {
            const isComplete = i <= currentIndex;
            const isCurrent = i === currentIndex;
            return (
              <div key={step.key} className="flex items-center flex-1">
                {/* Dot */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-3 h-3 rounded-full border-2 ${
                      isComplete
                        ? "bg-green border-green"
                        : "bg-white border-gray-mid"
                    } ${isCurrent ? "ring-2 ring-green-light" : ""}`}
                  />
                  <span
                    className={`text-[9px] mt-1 text-center ${
                      isComplete ? "text-green font-medium" : "text-gray-mid"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {/* Connector line */}
                {i < STATUS_STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 ${
                      i < currentIndex ? "bg-green" : "bg-gray-light"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Tracking number */}
      {tracking.tracking_number && (
        <p className="mt-3 text-xs text-gray-dark">
          Tracking: <span className="font-mono">{tracking.tracking_number}</span>
        </p>
      )}
    </div>
  );
}

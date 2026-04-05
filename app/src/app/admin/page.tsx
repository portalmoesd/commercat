"use client";

import { useState, useEffect, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase-browser";
import { OrderTable } from "@/components/admin/OrderTable";
import type { Order, OrderStatus } from "@/types";
import Link from "next/link";

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "Paid" },
  { key: "purchasing", label: "Purchasing" },
  { key: "purchased", label: "Purchased" },
  { key: "shipped", label: "Shipped" },
  { key: "at_warehouse", label: "At warehouse" },
];

export default function AdminPage() {
  const supabase = createBrowserClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Check admin status
      const { data: profile } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (!profile?.is_admin) {
        setLoading(false);
        return;
      }
      setIsAdmin(true);

      // Fetch all orders (admin sees all via API)
      const response = await fetch("/api/admin/orders");
      if (response.ok) {
        const data = await response.json();
        setOrders(data.orders ?? []);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  const handleStatusUpdate = useCallback(
    async (
      orderId: string,
      status: string,
      trackingNumber?: string,
      taobaoOrderId?: string,
      notes?: string
    ) => {
      const response = await fetch(`/api/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          tracking_number: trackingNumber,
          taobao_order_id: taobaoOrderId,
          notes,
        }),
      });

      if (response.ok) {
        // Update local state
        setOrders((prev) =>
          prev.map((o) =>
            o.id === orderId
              ? {
                  ...o,
                  status: status as OrderStatus,
                  tracking_number: trackingNumber ?? o.tracking_number,
                  taobao_order_id: taobaoOrderId ?? o.taobao_order_id,
                  notes: notes ?? o.notes,
                }
              : o
          )
        );
      }
    },
    []
  );

  // Filter orders
  let filteredOrders = orders;
  if (filter !== "all") {
    filteredOrders = orders.filter((o) => o.status === filter);
  }
  if (showQueue) {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    filteredOrders = orders.filter(
      (o) =>
        o.status === "paid" &&
        new Date(o.created_at).getTime() > oneDayAgo
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-gray-mid">Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <p className="text-sm text-gray-dark">Access denied</p>
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
        <span className="text-xs font-medium text-accent">Admin</span>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-medium">Orders</h1>
          <button
            onClick={() => {
              setShowQueue(!showQueue);
              if (!showQueue) setFilter("all");
            }}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              showQueue
                ? "bg-accent text-white border-accent"
                : "border-gray-light text-gray-dark hover:border-charcoal"
            }`}
          >
            Morning queue
          </button>
        </div>

        {/* Filter tabs */}
        {!showQueue && (
          <div className="flex gap-1 mb-4 overflow-x-auto">
            {FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors flex-shrink-0 ${
                  filter === tab.key
                    ? "bg-charcoal text-white border-charcoal"
                    : "border-gray-light text-gray-dark hover:border-charcoal"
                }`}
              >
                {tab.label}
                {tab.key !== "all" && (
                  <span className="ml-1 text-[10px] opacity-60">
                    {orders.filter((o) => o.status === tab.key).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <OrderTable
          orders={filteredOrders}
          onStatusUpdate={handleStatusUpdate}
        />
      </div>
    </div>
  );
}

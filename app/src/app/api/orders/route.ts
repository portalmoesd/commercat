import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";
import { getFxRates } from "@/lib/currency";
import { calculatePriceGel } from "@/lib/pricing";
import { createPayment } from "@/lib/bogpay";

// ── POST: Create order + initiate BOG Pay ──

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      items,
      forwarder_address,
      display_currency = "USD",
    }: {
      items: {
        product_id: string;
        platform: string;
        title_en: string;
        title_cn?: string;
        image_url?: string;
        product_url: string;
        price_cny: number;
        cn_shipping_cny?: number;
        quantity: number;
        variant: Record<string, string>;
      }[];
      forwarder_address: string;
      display_currency?: string;
    } = body;

    if (!items?.length || !forwarder_address) {
      return NextResponse.json(
        { error: "items and forwarder_address are required" },
        { status: 400 }
      );
    }

    // Lock FX rates
    const rates = await getFxRates();
    const gelRate = rates["GEL"];
    const displayRate = rates[display_currency] ?? rates["USD"];

    if (!gelRate) {
      return NextResponse.json(
        { error: "FX rate unavailable" },
        { status: 503 }
      );
    }

    // Calculate GEL totals across all items
    let orderItemCostGel = 0;
    let orderCommissionGel = 0;

    const orderItems = items.map((item) => {
      const shipping = item.cn_shipping_cny ?? 0;
      const priceGel = calculatePriceGel(item.price_cny, shipping, gelRate);
      const itemTotal = priceGel.item_cost * item.quantity;
      const commTotal = priceGel.commission * item.quantity;

      orderItemCostGel += itemTotal;
      orderCommissionGel += commTotal;

      return {
        product_id: item.product_id,
        platform: item.platform,
        title_en: item.title_en,
        title_cn: item.title_cn ?? null,
        image_url: item.image_url ?? null,
        product_url: item.product_url,
        price_cny: item.price_cny,
        price_gel: priceGel.total * item.quantity,
        quantity: item.quantity,
        variant: item.variant,
      };
    });

    orderItemCostGel = Math.round(orderItemCostGel * 100) / 100;
    orderCommissionGel = Math.round(orderCommissionGel * 100) / 100;
    const orderTotalGel = Math.round((orderItemCostGel + orderCommissionGel) * 100) / 100;

    // Create order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: user.id,
        status: "pending_payment",
        item_cost_gel: orderItemCostGel,
        commission_gel: orderCommissionGel,
        total_gel: orderTotalGel,
        fx_rate_used: gelRate,
        display_currency,
        display_fx_rate: displayRate,
        forwarder_address,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      throw orderError ?? new Error("Failed to create order");
    }

    // Create order items
    const itemsWithOrderId = orderItems.map((item) => ({
      ...item,
      order_id: order.id,
    }));

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsWithOrderId);

    if (itemsError) throw itemsError;

    // Initiate BOG Pay
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const payment = await createPayment({
      orderId: order.id,
      amountGel: orderTotalGel,
      description: `Commercat order — ${items.length} item(s)`,
      successUrl: `${appUrl}/orders?payment=success&order=${order.id}`,
      failUrl: `${appUrl}/orders?payment=failed&order=${order.id}`,
    });

    // Store payment ID
    await supabase
      .from("orders")
      .update({
        bog_payment_id: payment.paymentId,
        bog_payment_status: "initiated",
      })
      .eq("id", order.id);

    return NextResponse.json({
      order_id: order.id,
      payment_url: payment.paymentUrl,
      total_gel: orderTotalGel,
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}

// ── GET: List user's orders ──

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ orders: orders ?? [] });
  } catch (error) {
    console.error("Orders list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

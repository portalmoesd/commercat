import { NextRequest } from "next/server";
import { verifyBogSignature } from "@/lib/bogpay";
import { createAdminClient } from "@/lib/supabase";
import { sendOrderConfirmationEmail, notifyAdmins } from "@/lib/email";
import { formatPrice } from "@/lib/currency";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-bog-signature");
  const body = await req.text();

  // 1. Verify signature — reject unsigned requests
  if (
    !verifyBogSignature(body, signature, process.env.BOG_PAY_SECRET_KEY!)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const event = JSON.parse(body);

    if (event.event === "payment.success") {
      const orderId =
        event.order?.purchase_units?.[0]?.basket?.[0]?.product_id;
      if (!orderId) {
        return new Response("Missing order ID", { status: 400 });
      }

      const supabase = createAdminClient();

      // 2. Update order status
      await supabase
        .from("orders")
        .update({
          status: "paid",
          bog_payment_id: event.payment_id,
          bog_payment_status: "success",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      // 3. Fetch order + items + user for notifications
      const { data: order } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .single();

      if (!order) {
        return new Response("Order not found", { status: 404 });
      }

      const { data: user } = await supabase
        .from("users")
        .select("email, preferred_currency, wallet_balance_gel, subscription_tier")
        .eq("id", order.user_id)
        .single();

      const orderNumber = `COM-${orderId.slice(-6).toUpperCase()}`;

      // 4. Inject chat confirmation message
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, messages")
        .eq("user_id", order.user_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (conv) {
        const messages = (conv.messages as unknown[]) ?? [];
        messages.push({
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Payment confirmed! Order ${orderNumber} received. We'll purchase your item in China within 24 hours and update you here.`,
          timestamp: new Date().toISOString(),
        });

        await supabase
          .from("conversations")
          .update({
            messages,
            updated_at: new Date().toISOString(),
          })
          .eq("id", conv.id);
      }

      // 5. Apply cashback (if subscribed)
      if (user) {
        const cashbackRates: Record<string, number> = {
          starter: 0.01,
          pro: 0.012,
          elite: 0.015,
        };
        const rate = cashbackRates[user.subscription_tier ?? ""] ?? 0;
        if (rate > 0) {
          const cashback =
            Math.round(order.total_gel * rate * 100) / 100;
          await supabase
            .from("users")
            .update({
              wallet_balance_gel: (user.wallet_balance_gel ?? 0) + cashback,
            })
            .eq("id", order.user_id);
        }

        // 6. Send confirmation email
        const displayCurrency = order.display_currency ?? "USD";
        const displayTotal =
          order.display_fx_rate > 0
            ? ((order.total_gel / order.fx_rate_used) * order.display_fx_rate)
            : order.total_gel;

        await sendOrderConfirmationEmail({
          email: user.email,
          orderNumber,
          totalDisplay: formatPrice(
            Math.round(displayTotal * 100) / 100,
            displayCurrency
          ),
          totalGel: order.total_gel.toFixed(2),
          currency: displayCurrency,
          items: (order.order_items ?? []).map(
            (item: { title_en: string; quantity: number }) => ({
              title: item.title_en,
              quantity: item.quantity,
            })
          ),
        });

        // 7. Notify admins
        await notifyAdmins({
          orderNumber,
          totalGel: order.total_gel.toFixed(2),
          userEmail: user.email,
          productUrls: (order.order_items ?? []).map(
            (item: { product_url: string }) => item.product_url
          ),
        });
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response("Internal error", { status: 500 });
  }
}

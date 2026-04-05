import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createSupabaseServerClient } from "@/lib/supabase";

const STATUS_MESSAGES: Record<string, string> = {
  purchased:
    "Your item has been purchased in China. It's on its way to your forwarder's warehouse.",
  shipped: "Your item is on its way to the warehouse.",
  at_warehouse:
    "Your item has arrived at your forwarder's warehouse. It's ready for you to arrange shipping to your address.",
  cancelled: "Your order has been cancelled.",
  refunded: "Your order has been refunded.",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;

    // Verify admin role
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from("users")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      status,
      tracking_number,
      taobao_order_id,
      notes,
    }: {
      status: string;
      tracking_number?: string;
      taobao_order_id?: string;
      notes?: string;
    } = body;

    // Update order
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (tracking_number) updateData.tracking_number = tracking_number;
    if (taobao_order_id) updateData.taobao_order_id = taobao_order_id;
    if (notes !== undefined) updateData.notes = notes;

    const { error: updateError } = await adminClient
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (updateError) throw updateError;

    // Inject status message into user's conversation
    const statusMessage = STATUS_MESSAGES[status];
    if (statusMessage) {
      // Get order to find user_id
      const { data: order } = await adminClient
        .from("orders")
        .select("user_id")
        .eq("id", orderId)
        .single();

      if (order) {
        let chatContent = statusMessage;
        if (status === "shipped" && tracking_number) {
          chatContent += ` Tracking: ${tracking_number}`;
        }

        // Find user's most recent conversation and append message
        const { data: conv } = await adminClient
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
            content: chatContent,
            timestamp: new Date().toISOString(),
          });

          await adminClient
            .from("conversations")
            .update({
              messages,
              updated_at: new Date().toISOString(),
            })
            .eq("id", conv.id);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Status update error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}

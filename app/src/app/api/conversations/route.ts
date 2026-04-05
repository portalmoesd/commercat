import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

/** GET: List user's conversations (most recent first) */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id, messages, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ conversations: data ?? [] });
  } catch (error) {
    console.error("Conversations list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

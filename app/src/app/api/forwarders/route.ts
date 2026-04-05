import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("forwarders")
      .select("*")
      .eq("active", true)
      .order("name");

    if (error) throw error;

    return NextResponse.json({ forwarders: data ?? [] });
  } catch (error) {
    console.error("Forwarders fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch forwarders" },
      { status: 500 }
    );
  }
}

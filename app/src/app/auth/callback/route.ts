import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase";

/**
 * OAuth callback handler for Supabase Auth (Google OAuth, magic links).
 * Supabase redirects here with a `code` query param after successful auth.
 * We exchange the code for a session, then redirect to /chat.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/chat";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(redirect, origin));
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createAdminClient } from "@/lib/supabase";

/**
 * OAuth callback handler for Supabase Auth (Google OAuth, magic links).
 * Supabase redirects here with a `code` query param after successful auth.
 * We exchange the code for a session, ensure user profile exists, then redirect.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/chat";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Ensure user profile exists (fallback if DB trigger didn't fire)
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const adminClient = createAdminClient();
        await adminClient.from("users").upsert(
          {
            id: user.id,
            email: user.email!,
            full_name:
              user.user_metadata?.full_name ??
              user.user_metadata?.name ??
              null,
          },
          { onConflict: "id", ignoreDuplicates: true }
        );
      }

      return NextResponse.redirect(new URL(redirect, origin));
    }
  }

  // Auth failed — redirect to login with error
  return NextResponse.redirect(new URL("/login?error=auth_failed", origin));
}

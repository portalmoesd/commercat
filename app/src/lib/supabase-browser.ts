import { createBrowserClient as createSupabaseBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createSupabaseBrowserClient> | null = null;

// Singleton browser client that stores auth session in cookies
// (required for proxy/middleware to read the session)
export function createBrowserClient() {
  if (client) return client;

  client = createSupabaseBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return client;
}

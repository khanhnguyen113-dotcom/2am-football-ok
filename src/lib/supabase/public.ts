import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Anonymous, cookie-less client for public reads (pub_* projections) and whitelisted public commands.
 * It never carries an admin session, so its results are safe to render on public pages.
 */
let client: SupabaseClient | null = null;

export function publicDb(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
  }
  return client;
}

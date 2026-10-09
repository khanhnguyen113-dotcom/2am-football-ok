import "server-only";
import { redirect } from "next/navigation";
import { sessionDb } from "@/lib/supabase/server";

/**
 * Page-level gate for /admin/*. Requires a session AND the exact admin user ID (checked in the DB via is_admin()).
 * Every admin command re-checks inside the database too (require_admin), so this is defence in depth.
 */
export async function requireAdminPage() {
  const db = await sessionDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/admin/login");
  const { data: ok } = await db.rpc("is_admin");
  if (!ok) redirect("/admin/login?e=not_admin");
  return { db, user: auth.user };
}

/** Same check for server actions; returns null instead of redirecting. */
export async function adminDbOrNull() {
  const db = await sessionDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data: ok } = await db.rpc("is_admin");
  return ok ? db : null;
}

export async function signedUrl(db: Awaited<ReturnType<typeof sessionDb>>, bucket: string, path: string, seconds = 300) {
  const { data } = await db.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

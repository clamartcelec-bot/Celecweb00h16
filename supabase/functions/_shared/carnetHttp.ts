import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { ApiError } from "./carnetProtocol.ts";
export { ApiError, uuid } from "./carnetProtocol.ts";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export function errorResponse(error: unknown) {
  const e = error instanceof ApiError ? error : new ApiError("service_unavailable", 503, true, "Service indisponible. Réessayez avec le même lot.");
  return json({ success: false, api_version: 1, code: e.code, message: e.message, retryable: e.retryable }, e.status);
}
function envKey(legacy: string, modern: string) {
  const current = Deno.env.get(legacy);
  if (current) return current;
  try { return JSON.parse(Deno.env.get(modern) || "{}").default as string | undefined; } catch { return undefined; }
}
export async function requireAdmin(req: Request): Promise<{ db: SupabaseClient; actor: string; name: string }> {
  const header = req.headers.get("Authorization") || "";
  if (!/^Bearer \S+$/i.test(header)) throw new ApiError("unauthorized", 401, false, "Connexion requise.");
  const url = Deno.env.get("SUPABASE_URL");
  const publicKey = envKey("SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEYS");
  const serviceKey = envKey("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEYS");
  if (!url || !publicKey || !serviceKey) throw new ApiError("configuration_missing", 503, true);
  const token = header.slice(7);
  const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  const userClient = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch } });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) throw new ApiError("unauthorized", 401, false, "Reconnectez-vous pour reprendre le lot.");
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: boundedFetch } });
  const { data: profile, error: profileError } = await db.from("profiles").select("role,full_name,email").eq("id", data.user.id).maybeSingle();
  if (profileError) throw new ApiError("service_unavailable", 503, true);
  if (!profile || profile.role !== "admin") throw new ApiError("forbidden", 403, false, "Compte non autorisé à utiliser Le Carnet.");
  return { db, actor: data.user.id, name: profile.full_name || profile.email };
}
export async function bodyJson(req: Request): Promise<Record<string, unknown>> {
  if (req.method !== "POST") throw new ApiError("method_not_allowed", 405);
  const reader = req.body?.getReader();
  if (!reader) throw new ApiError("invalid_payload");
  let bytes = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > 65536) { await reader.cancel(); throw new ApiError("payload_too_large", 413); }
    chunks.push(value);
  }
  const buffer = new Uint8Array(bytes); let offset = 0;
  for (const c of chunks) { buffer.set(c, offset); offset += c.byteLength; }
  try { const value = JSON.parse(new TextDecoder().decode(buffer)); if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(); return value; }
  catch { throw new ApiError("invalid_payload"); }
}
export async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    const codes: Record<string, [number, boolean]> = { forbidden: [403, false], not_found: [404, false], manifest_conflict: [409, false], entry_deleted: [410, false], quota_exceeded: [429, true], rate_limited: [429, true], processing_busy: [429, true], publication_busy: [409, true], attempt_lost: [409, true], incomplete_batch: [409, true] };
    const rule = codes[error.message];
    if (rule) throw new ApiError(error.message, rule[0], rule[1]);
    throw new ApiError("database_unavailable", 503, true);
  }
  return data as T;
}

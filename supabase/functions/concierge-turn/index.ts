import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_BODY = 4_000_000;
const MAX_TURNS = 200;
const APPENDS_PER_MINUTE = 30;
const RETENTION_DAYS = 90;

type Json = Record<string, unknown>;
type Turn = { role: "user" | "assistant"; text: string; at: string; actions?: Json[] };
type Row = { id: string; write_token_hash: string | null; profile_id: string | null; transcript: Turn[] | null; client_name: string | null; client_phone: string | null };

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function expiry() {
  return new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
}

function publicTurns(transcript: Turn[] | null) {
  return (transcript ?? []).map((t) => ({ role: t.role, text: t.text, at: t.at, actions: t.actions ?? [] }));
}

async function findConversation(service: SupabaseClient, userId: string | null, sessionKey: string, tokenHash: string) {
  const now = new Date().toISOString();
  const cols = "id, write_token_hash, profile_id, transcript, client_name, client_phone";
  const { data: guest } = await service.from("concierge_conversations").select(`${cols}, ended_at, expires_at, mode`).eq("session_key", sessionKey).maybeSingle();
  const found = guest as (Row & { ended_at: string | null; expires_at: string; mode: string }) | null;
  if (found) {
    const owns = found.profile_id ? found.profile_id === userId : found.write_token_hash === tokenHash;
    if (!owns) return { row: null, forbidden: true, closed: false };
    if (found.mode !== "turns" || found.ended_at || Date.parse(found.expires_at) <= Date.now()) return { row: null, forbidden: false, closed: true };
  }
  const guestRow = found as Row | null;

  if (userId) {
    if (guestRow) {
      if (!guestRow.profile_id) await service.from("concierge_conversations").update({ profile_id: userId }).eq("id", guestRow.id);
      return { row: { ...guestRow, profile_id: userId }, forbidden: false, closed: false };
    }
    const { data } = await service
      .from("concierge_conversations").select(cols)
      .eq("profile_id", userId).eq("mode", "turns").is("ended_at", null).gt("expires_at", now)
      .order("last_activity_at", { ascending: false }).limit(1).maybeSingle();
    return { row: data as Row | null, forbidden: false, closed: false };
  }
  return { row: guestRow, forbidden: false, closed: false };
}

async function transcribe(key: string, base64: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("ogg") ? "ogg" : mime.includes("wav") ? "wav" : "webm";
  const fd = new FormData();
  fd.set("file", new File([bytes], `voice.${ext}`, { type: mime || "audio/webm" }));
  fd.set("model", "gpt-4o-mini-transcribe");
  fd.set("language", "fr");
  fd.set("prompt", "CELEC, électricien à Clamart, Meudon, Issy-les-Moulineaux. Tableau électrique, disjoncteur, Ajax, BlockTech, borne de recharge.");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!res.ok) throw new Error(`transcription ${res.status}`);
  const data = await res.json();
  return str(data?.text, 2_000);
}

function cleanAction(raw: unknown): Json | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Json;
  if (a.type === "show_entries" && Array.isArray(a.ids)) {
    const ids = a.ids.map((id) => str(id, 40)).filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 6);
    return ids.length ? { type: "show_entries", ids } : null;
  }
  if (a.type === "show_partner" && /^[0-9a-f-]{36}$/i.test(str(a.id, 40))) return { type: "show_partner", id: str(a.id, 40) };
  if (a.type === "navigate" && /^[a-z-]{2,20}$/.test(str(a.view, 20))) return { type: "navigate", view: str(a.view, 20) };
  return null;
}

function cleanTurns(raw: unknown, now: string): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 4).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const t = item as Json;
    const role = t.role === "assistant" ? "assistant" : t.role === "user" ? "user" : null;
    const text = str(t.text, 2_000);
    if (!role || !text) return [];
    const actions = Array.isArray(t.actions) ? t.actions.slice(0, 4).map(cleanAction).filter((a): a is Json => Boolean(a)) : [];
    return [{ role, text, at: now, ...(actions.length && { actions }) }];
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413);
    const body = JSON.parse(raw || "{}") as Json;

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    let userId: string | null = null;
    if (bearer && bearer !== Deno.env.get("SUPABASE_ANON_KEY")) {
      const { data } = await service.auth.getUser(bearer);
      userId = data.user?.id ?? null;
    }

    const sessionKey = str(body.session_key, 80);
    const token = str(body.token, 120);
    if (!/^[a-z0-9-]{6,80}$/i.test(sessionKey) || token.length < 24) return json({ error: "invalid_session" }, 400);
    const tokenHash = await sha256(token);
    const action = str(body.action, 20);

    const { row, forbidden, closed } = await findConversation(service, userId, sessionKey, tokenHash);
    if (forbidden) return json({ error: "forbidden" }, 403);
    if (closed && action !== "delete") return json({ error: "session_closed", turns: [] }, 409);

    if (action === "load") return json({ turns: publicTurns(row?.transcript ?? null) });

    if (action === "reset") {
      if (row) await service.from("concierge_conversations").update({ ended_at: new Date().toISOString(), ended_reason: "new_conversation" }).eq("id", row.id);
      return json({ success: true });
    }

    if (action === "delete") {
      if (userId) await service.from("concierge_conversations").delete().eq("profile_id", userId).eq("mode", "turns");
      if (row) await service.from("concierge_conversations").delete().eq("id", row.id);
      return json({ success: true });
    }

    if (action === "append") {
      const now = new Date().toISOString();
      const turns = cleanTurns(body.turns, now);
      if (!turns.length) return json({ error: "empty" }, 422);
      const transcript = (row?.transcript ?? []) as Turn[];
      const minuteAgo = Date.now() - 60_000;
      if (transcript.filter((t) => Date.parse(t.at) > minuteAgo).length >= APPENDS_PER_MINUTE) return json({ error: "rate_limited" }, 429);
      const next = [...transcript, ...turns].slice(-MAX_TURNS);
      const patch: Json = { transcript: next, message_count: next.length, last_activity_at: now, expires_at: expiry() };
      const page = str(body.page, 30);
      if (page) patch.context = { page };
      if (row) {
        await service.from("concierge_conversations").update(patch).eq("id", row.id);
      } else {
        const { error } = await service.from("concierge_conversations").insert({
          ...patch, session_key: sessionKey, write_token_hash: tokenHash, profile_id: userId, mode: "turns",
        });
        if (error) throw error;
      }
      return json({ success: true });
    }

    if (action === "transcribe") {
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key) return json({ error: "ai_unavailable" }, 503);
      const audio = typeof body.audio_base64 === "string" ? body.audio_base64 : "";
      if (!audio) return json({ error: "empty_transcript" }, 422);
      try {
        return json({ transcript: await transcribe(key, audio, str(body.audio_mime, 60)) });
      } catch (err) {
        console.error("dictation failed", err);
        return json({ error: "transcription_failed" }, 502);
      }
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("concierge-turn error", err);
    return json({ error: "server_error" }, 500);
  }
});

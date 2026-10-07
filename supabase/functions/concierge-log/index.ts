import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_BODY = 600_000;
const MAX_TURNS = 400;
const MAX_EVENTS = 300;

type Json = Record<string, unknown>;

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

function cleanTranscript(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.slice(-MAX_TURNS).flatMap((turn) => {
    if (!turn || typeof turn !== "object") return [];
    const t = turn as Json;
    const role = t.role === "assistant" ? "assistant" : t.role === "user" ? "user" : null;
    const text = str(t.text, 4_000);
    if (!role || !text) return [];
    return [{ role, text, at: str(t.at, 40) || new Date().toISOString() }];
  });
}

function cleanEvents(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.slice(-MAX_EVENTS).flatMap((event) => {
    if (!event || typeof event !== "object") return [];
    const e = event as Json;
    const name = str(e.name, 60);
    if (!name) return [];
    const detail = JSON.stringify(e.detail ?? null);
    return [{ name, at: str(e.at, 40) || new Date().toISOString(), detail: detail.length <= 2_000 ? JSON.parse(detail) : null }];
  });
}

async function summarize(transcript: { role: string; text: string }[], draft: unknown): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const dialogue = transcript.map((t) => `${t.role === "user" ? "Client" : "Concierge"} : ${t.text}`).join("\n").slice(-60_000);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Tu résumes pour l'équipe d'une entreprise d'électricité (CELEC) une conversation entre un visiteur et le concierge vocal du site. Réponds en français, en texte brut, avec ces rubriques courtes : « Objet », « Client » (nom, téléphone, commune si connus), « Ce qui a été demandé », « Ce que le concierge n'a pas pu répondre », « Suite à donner ». Sois factuel, n'invente rien, écris « non précisé » si une information manque.",
        },
        { role: "user", content: `Fiche saisie : ${JSON.stringify(draft ?? {})}\n\nConversation :\n${dialogue || "(aucun échange)"}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty summary");
  return text.trim().slice(0, 6_000);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: "Payload too large" }, 413);
    const body = JSON.parse(raw || "{}") as Json;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    let userId: string | null = null;
    let userEmail: string | null = null;
    if (bearer && bearer !== anonKey) {
      const { data } = await service.auth.getUser(bearer);
      userId = data.user?.id ?? null;
      userEmail = data.user?.email ?? null;
    }

    if (body.action === "summarize") {
      if (!userId) return json({ error: "Unauthorized" }, 401);
      const { data: profile } = await service.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (profile?.role !== "admin") return json({ error: "Forbidden" }, 403);
      const id = str(body.id, 60);
      const { data: row } = await service.from("concierge_conversations").select("id, transcript, draft").eq("id", id).maybeSingle();
      if (!row) return json({ error: "Not found" }, 404);
      try {
        const summary = await summarize(row.transcript ?? [], row.draft);
        await service.from("concierge_conversations").update({ summary, summary_status: "done", summarized_at: new Date().toISOString() }).eq("id", id);
        return json({ success: true, summary });
      } catch (err) {
        console.error("summarize failed", err);
        await service.from("concierge_conversations").update({ summary_status: "error" }).eq("id", id);
        return json({ error: "Summary failed" }, 502);
      }
    }

    const sessionKey = str(body.session_key, 80);
    const token = str(body.token, 120);
    if (!/^[a-z0-9-]{6,80}$/i.test(sessionKey) || token.length < 24) return json({ error: "Invalid session" }, 400);
    const tokenHash = await sha256(token);

    const { data: existing } = await service
      .from("concierge_conversations")
      .select("id, write_token_hash, transcript, draft, summary_status, profile_id, client_email")
      .eq("session_key", sessionKey)
      .maybeSingle();
    if (existing && existing.write_token_hash !== tokenHash) return json({ error: "Forbidden" }, 403);

    const transcript = cleanTranscript(body.transcript);
    const events = cleanEvents(body.events);
    const client = (body.client && typeof body.client === "object" ? body.client : {}) as Json;
    const draftText = body.draft && typeof body.draft === "object" ? JSON.stringify(body.draft) : null;
    const draft = draftText && draftText.length <= 20_000 ? JSON.parse(draftText) : undefined;
    const requestId = str(body.request_id, 60);
    const ended = body.ended === true;
    const now = new Date().toISOString();

    const patch: Json = { last_activity_at: now };
    if (transcript) { patch.transcript = transcript; patch.message_count = transcript.length; }
    if (events) patch.events = events;
    if (draft !== undefined) patch.draft = draft;
    const name = str(client.name, 120);
    const phone = str(client.phone, 40);
    if (name) patch.client_name = name;
    if (phone) patch.client_phone = phone;
    if (userId && !existing?.profile_id) patch.profile_id = userId;
    if (userEmail && !existing?.client_email) patch.client_email = userEmail;
    if (/^[0-9a-f-]{36}$/i.test(requestId)) patch.request_id = requestId;
    if (ended) {
      patch.ended_at = now;
      patch.ended_reason = str(body.ended_reason, 60) || "ended";
      const duration = Number(body.duration_seconds);
      if (Number.isFinite(duration) && duration >= 0) patch.duration_seconds = Math.min(Math.round(duration), 86_400);
    }

    let rowId = existing?.id as string | undefined;
    if (existing) {
      const { error } = await service.from("concierge_conversations").update(patch).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data, error } = await service
        .from("concierge_conversations")
        .insert({ ...patch, session_key: sessionKey, write_token_hash: tokenHash })
        .select("id")
        .single();
      if (error) throw error;
      rowId = data.id;
    }

    if (ended && rowId) {
      const finalTranscript = (transcript ?? existing?.transcript ?? []) as { role: string; text: string }[];
      const finalDraft = draft ?? existing?.draft ?? null;
      const id = rowId;
      const job = (async () => {
        try {
          const summary = await summarize(finalTranscript, finalDraft);
          await service.from("concierge_conversations").update({ summary, summary_status: "done", summarized_at: new Date().toISOString() }).eq("id", id);
        } catch (err) {
          console.error("summary failed", err);
          await service.from("concierge_conversations").update({ summary_status: "error" }).eq("id", id);
        }
      })();
      // deno-lint-ignore no-explicit-any
      const runtime = (globalThis as any).EdgeRuntime;
      if (runtime?.waitUntil) runtime.waitUntil(job); else await job;
    }

    return json({ success: true });
  } catch (err) {
    console.error("concierge-log error", err);
    return json({ error: "Unable to save conversation" }, 500);
  }
});

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_BODY = 4_000_000;
const MAX_TURNS = 200;
const HISTORY_FOR_MODEL = 12;
const TURNS_PER_MINUTE = 8;
const RETENTION_DAYS = 90;

const VIEWS = ["home", "family", "entretien", "map", "carnet", "partners", "blocktech", "contact"];
const FAMILIES = ["electricite", "confort", "securite", "reseau", "energie"];
const TOPICS = [
  "depannage", "tableau", "prises", "renovation", "projet", "eclairage", "domotique", "volets", "chauffage",
  "alarme", "video", "acces", "portail", "reseau-local", "supervision", "recharge", "suivi-conso", "puissance",
  "photovoltaique", "entretien",
];
const CATEGORIES = ["depannage", "chantier", "projet"];
const VOICES = ["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"];

type Json = Record<string, unknown>;
type Turn = { role: "user" | "assistant"; text: string; at: string; actions?: unknown[] };
type Row = { id: string; write_token_hash: string | null; profile_id: string | null; transcript: Turn[] | null; client_name: string | null; client_phone: string | null };

function json(body: Json, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
  const { data: guest } = sessionKey
    ? await service.from("concierge_conversations").select(`${cols}, ended_at, expires_at, mode`).eq("session_key", sessionKey).maybeSingle()
    : { data: null };
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
  fd.set("model", "whisper-1");
  fd.set("language", "fr");
  fd.set("prompt", "CELEC, électricien à Clamart, Meudon, Issy-les-Moulineaux. Tableau électrique, disjoncteur, Ajax, BlockTech, borne de recharge.");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: fd });
  if (!res.ok) throw new Error(`whisper ${res.status}`);
  const data = await res.json();
  return str(data?.text, 2_000);
}

async function speak(key: string, text: string, voice: string) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "tts-1", voice, input: text.slice(0, 1_200), response_format: "mp3" }),
  });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(binary);
}

type Entry = { id: string; title: string; city: string | null; description: string | null; ai_summary: string | null; topics: string[] | null; detected_brands: string[] | null; created_at: string };

function rankEntries(entries: Entry[], query: string, topic: string) {
  const words = normalize(query).split(/[^a-z0-9]+/).filter((w) => w.length > 3).map((w) => w.replace(/(s|x)$/, ""));
  return entries
    .map((e) => {
      const hay = normalize([e.title, e.city, e.description, e.ai_summary, (e.topics ?? []).join(" "), (e.detected_brands ?? []).join(" ")].join(" "));
      let score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
      if (topic && e.topics?.includes(topic)) score += 1.5;
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.e);
}

function buildSystem(settings: Json | null, facts: Json[], partners: Json[], entries: Entry[], context: Json, client: { name: string; phone: string }) {
  const lines = [
    str(settings?.prompt, 4_000) || "Tu es le majordome numérique de CELEC, une équipe d’électriciens basée à Clamart qui intervient aussi à Meudon, Issy-les-Moulineaux et dans le sud de Paris.",
    str(settings?.tone, 1_000) ? `TON : ${str(settings?.tone, 1_000)}` : "",
    "Tu réponds en français, à l’oral : deux à trois phrases courtes, chaleureuses et simples, sans liste ni markdown. Ta réponse sera lue à voix haute.",
    "Tu n’inventes jamais un prix, un délai, une fréquence d’entretien, un horaire, une réalisation, un membre de l’équipe ni un lien juridique avec BlockTech. BlockTech est le bureau d’études qui intervient en amont des projets ; CELEC réalise sur le terrain.",
    "SAVOIR-FAIRE DE CELEC (offres réelles) : Électricité (dépannage, tableau, prises et circuits, rénovation, projets avec architecte), Confort (éclairage, domotique, volets, partie électrique des portails), Sécurité (alarme — notamment Ajax —, vidéosurveillance, interphonie et accès), Réseau (Wi-Fi, câblage, supervision), Énergie (bornes de recharge, suivi des consommations, gestion de puissance), et l’entretien de ces installations.",
    "Le photovoltaïque et la climatisation ne sont pas des offres confirmées : propose de transmettre la question à l’équipe.",
    "Si tu n’as pas l’information, propose de transmettre la question à l’équipe avec un numéro de téléphone.",
    str(settings?.site_info, 4_000) ? `INFORMATIONS DU SITE :\n${str(settings?.site_info, 4_000)}` : "",
    facts.length ? `FICHE SOCIÉTÉ (fait foi) :\n${facts.map((f) => `- ${f.label} : ${f.value}${f.detail ? ` — ${f.detail}` : ""}`).join("\n")}` : "",
    partners.length ? `PARTENAIRES (id | nom | type | pourquoi ce choix) :\n${partners.map((p) => `- ${p.id} | ${p.name} | ${p.kind === "pro" ? `professionnel ${p.trade ?? ""} ${p.locality ?? ""}` : "marque"} | ${str(p.why_story, 300) || "non renseigné"}`).join("\n")}` : "",
    entries.length
      ? `RÉALISATIONS DU CARNET pertinentes (id | titre | commune | résumé) — seules preuves autorisées :\n${entries.map((e) => `- ${e.id} | ${e.title} | ${e.city ?? ""} | ${str(e.ai_summary || e.description, 220)}`).join("\n")}`
      : "Aucune réalisation du carnet ne correspond directement à la question : ne prétends pas en avoir.",
    `PAGE ACTUELLE : ${str(context.page, 30) || "accueil"}${context.family ? `, famille ${str(context.family, 30)}` : ""}${context.topic ? `, sujet ${str(context.topic, 30)}` : ""}.`,
    client.name || client.phone ? `COORDONNÉES DÉJÀ DONNÉES : ${client.name} ${client.phone}` : "",
    `RÉPONDS UNIQUEMENT en JSON : {"reply": string, "actions": Action[]}. Actions possibles (0 à 2, seulement si elles aident vraiment) :
- {"type":"navigate","view":"${VIEWS.join("|")}","family":"${FAMILIES.join("|")}"(si view=family)}
- {"type":"filter_carnet","topic":"${TOPICS.join("|")}"}
- {"type":"show_entries","ids":[ids du carnet listés ci-dessus, 4 max]}
- {"type":"show_partner","id":"id d’un partenaire listé"}
- {"type":"prefill_contact","category":"${CATEGORIES.join("|")}","first_name":string,"phone":string,"commune":string,"description":string} — quand le visiteur veut être rappelé, une intervention ou un devis. Cela remplit seulement le formulaire : le visiteur doit lui-même vérifier puis confirmer l’envoi. Dis-le-lui.`,
  ];
  return lines.filter(Boolean).join("\n\n");
}

function cleanActions(raw: unknown, entryIds: Set<string>, partnerIds: Set<string>) {
  if (!Array.isArray(raw)) return [];
  const out: Json[] = [];
  for (const item of raw.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const a = item as Json;
    if (a.type === "navigate" && VIEWS.includes(String(a.view))) {
      const family = FAMILIES.includes(String(a.family)) ? String(a.family) : undefined;
      if (a.view === "family" && !family) continue;
      out.push({ type: "navigate", view: a.view, ...(family && { family }) });
    } else if (a.type === "filter_carnet" && TOPICS.includes(String(a.topic))) {
      out.push({ type: "filter_carnet", topic: a.topic });
    } else if (a.type === "show_entries" && Array.isArray(a.ids)) {
      const ids = a.ids.map(String).filter((id) => entryIds.has(id)).slice(0, 4);
      if (ids.length) out.push({ type: "show_entries", ids });
    } else if (a.type === "show_partner" && partnerIds.has(String(a.id))) {
      out.push({ type: "show_partner", id: String(a.id) });
    } else if (a.type === "prefill_contact") {
      out.push({
        type: "prefill_contact",
        category: CATEGORIES.includes(String(a.category)) ? a.category : "depannage",
        first_name: str(a.first_name, 60),
        phone: str(a.phone, 30).replace(/[^\d+ .-]/g, ""),
        commune: str(a.commune, 80),
        description: str(a.description, 600),
      });
    }
  }
  return out;
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
    const action = str(body.action, 20) || "turn";

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

    if (action !== "turn" && action !== "transcribe") return json({ error: "unknown_action" }, 400);

    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return json({ error: "ai_unavailable" }, 503);

    if (action === "transcribe") {
      const audio = typeof body.audio_base64 === "string" ? body.audio_base64 : "";
      if (!audio) return json({ error: "empty_transcript" }, 422);
      try {
        return json({ transcript: await transcribe(key, audio, str(body.audio_mime, 60)) });
      } catch (err) {
        console.error("dictation failed", err);
        return json({ error: "transcription_failed" }, 502);
      }
    }

    const transcript = (row?.transcript ?? []) as Turn[];
    const minuteAgo = Date.now() - 60_000;
    if (transcript.filter((t) => t.role === "user" && Date.parse(t.at) > minuteAgo).length >= TURNS_PER_MINUTE) {
      return json({ error: "rate_limited" }, 429);
    }

    let userText = str(body.text, 1_000);
    const audio = typeof body.audio_base64 === "string" ? body.audio_base64 : "";
    if (!userText && audio) {
      try {
        userText = await transcribe(key, audio, str(body.audio_mime, 60));
      } catch (err) {
        console.error("transcription failed", err);
        return json({ error: "transcription_failed" }, 502);
      }
    }
    if (userText.replace(/[^\p{L}\p{N}]/gu, "").length < 2) return json({ error: "empty_transcript" }, 422);

    const context = (body.context && typeof body.context === "object" ? body.context : {}) as Json;
    const [{ data: settings }, { data: facts }, { data: partners }, { data: entries }] = await Promise.all([
      service.from("concierge_settings").select("prompt, tone, site_info, voice").eq("id", 1).maybeSingle(),
      service.from("company_facts").select("label, value, detail").eq("published", true).order("position"),
      service.from("partners").select("id, name, kind, trade, locality, why_story").eq("published", true).order("position"),
      service.from("photos").select("id, title, city, description, ai_summary, topics, detected_brands, created_at").eq("published", true).order("created_at", { ascending: false }).limit(400),
    ]);
    const history = transcript.slice(-HISTORY_FOR_MODEL).map((t) => t.text).join(" ");
    const relevant = rankEntries((entries ?? []) as Entry[], `${userText} ${history.slice(-400)}`, str(context.topic, 30));
    const client = { name: row?.client_name ?? "", phone: row?.client_phone ?? "" };

    const chat = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildSystem(settings as Json | null, (facts ?? []) as Json[], (partners ?? []) as Json[], relevant, context, client) },
          ...transcript.slice(-HISTORY_FOR_MODEL).map((t) => ({ role: t.role, content: t.text })),
          { role: "user", content: userText },
        ],
      }),
    });
    if (!chat.ok) {
      console.error("chat failed", chat.status, await chat.text().catch(() => ""));
      return json({ error: "ai_failed", transcript: userText }, 502);
    }
    const parsed = JSON.parse((await chat.json())?.choices?.[0]?.message?.content ?? "{}") as Json;
    const reply = str(parsed.reply, 1_200) || "Je n’ai pas bien saisi. Pouvez-vous reformuler ?";
    const actions = cleanActions(parsed.actions, new Set(relevant.map((e) => e.id)), new Set(((partners ?? []) as Json[]).map((p) => String(p.id))));

    const voiceSetting = str((settings as Json | null)?.voice, 20);
    let audioOut: string | null = null;
    if (body.speak !== false) {
      try {
        audioOut = await speak(key, reply, VOICES.includes(voiceSetting) ? voiceSetting : "coral");
      } catch (err) {
        console.error("tts failed", err);
      }
    }

    const now = new Date().toISOString();
    const nextTranscript: Turn[] = [...transcript, { role: "user", text: userText, at: now }, { role: "assistant", text: reply, at: now, actions }].slice(-MAX_TURNS);
    const prefill = actions.find((a) => a.type === "prefill_contact");
    const patch: Json = {
      transcript: nextTranscript,
      message_count: nextTranscript.length,
      last_activity_at: now,
      expires_at: expiry(),
      context: { page: str(context.page, 30), family: str(context.family, 30), topic: str(context.topic, 30) },
    };
    if (prefill?.first_name) patch.client_name = prefill.first_name;
    if (prefill?.phone) patch.client_phone = prefill.phone;
    if (row) {
      await service.from("concierge_conversations").update(patch).eq("id", row.id);
    } else {
      const { error } = await service.from("concierge_conversations").insert({
        ...patch, session_key: sessionKey, write_token_hash: tokenHash, profile_id: userId, mode: "turns",
      });
      if (error) throw error;
    }

    return json({ transcript: userText, reply, actions, audio_base64: audioOut, at: now });
  } catch (err) {
    console.error("concierge-turn error", err);
    return json({ error: "server_error" }, 500);
  }
});


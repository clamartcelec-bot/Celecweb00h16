import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MAX_IMAGES_TO_ANALYZE = 6;
const SENDER_BATCH_TTL_MS = 10 * 60 * 1000;
const MAX_BATCHES_PER_CALL = 5;

const DEFAULT_PROMPT =
  "Tu es l'assistant de CELEC, un electricien de terrain en region parisienne. On t'envoie des photos et ou un texte pris sur un chantier. Tu dois decrire l'intervention et produire un JSON avec exactement ces champs.";

const JSON_SCHEMA = `Reponds UNIQUEMENT avec le JSON demande. Aucun raisonnement, aucune explication, aucun texte avant ou apres le JSON, pas de markdown, pas de backticks.
{"title":"...","summary":"...","brands":["..."],"category":"..."}
- "title" : titre court et descriptif pour le carnet de bord (max 60 caracteres). Jamais "Sans titre".
- "summary" : vraie description de l'intervention ou de la situation montree (2-4 phrases). Explique ce qui est montre, le type de travail, le contexte.
- "brands" : tableau des marques visibles ou mentionnees (ex: ["Legrand", "Schneider"]). Si aucune marque, tableau vide.
- "category" : une parmi "depannage", "renovation", "installation", "diagnostic", "autre"
Interdiction absolue d'ecrire tes reflexions, tes doutes, tes hypotheses ou la maniere dont tu examines les images. Le champ "summary" decrit le chantier, pas ta demarche.`;

interface CarnetSettings {
  ai_prompt: string;
  ai_style: string;
  ai_model: string;
  activity_context: string;
  detect_brands: boolean;
  auto_transcribe: boolean;
  minimax_api_key: string;
  minimax_base_url: string;
  batch_window_seconds: number;
  ai_language: string;
}

interface AiProvider {
  name: string;
  model: string;
  url: string;
  apiKey: string;
}

interface BatchRow {
  id: string;
  chat_id: number;
  group_key: string;
  status: string;
  created_at: string;
}

interface StoredImage {
  url: string;
  position: number;
}

interface MessageInput {
  messageId: number | null;
  senderId: string;
  senderName: string;
  sentAt: string;
  caption: string;
  groupKey: string;
  location: { latitude: number; longitude: number } | null;
  photos: Array<{ file_id: string }>;
  document: { file_id: string; mime_type?: string } | null;
  voice: { file_id: string } | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const update = body.message || body.channel_post;
    if (!update) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const botToken = Deno.env.get("TELEGRAM_CARNET_BOT_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const minimaxKey =
      Deno.env.get("MINIMAX_API_KEY") || Deno.env.get("MINIMAX_M3_API_KEY") || "";

    if (!botToken || !supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "Missing secrets" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const settings = await loadSettings(supabase);
    const windowSeconds = Math.min(
      Math.max(Number(settings?.batch_window_seconds) || 120, 10),
      3600
    );

    const input = extractMessage(update);
    const batchId = await attachBatch(supabase, input, windowSeconds);

    // Transcription (only when enabled and an OpenAI key is present)
    let transcript: string | null = null;
    if (input.voice && settings?.auto_transcribe !== false && openaiKey) {
      transcript = await transcribeVoice(
        botToken,
        input.voice.file_id,
        openaiKey,
        settings?.ai_language || "fr"
      );
    }

    // Download the photo of THIS message (Telegram sends several sizes of the SAME image,
    // so only the largest one is kept) plus an image sent as a file, if any.
    const storedImages: StoredImage[] = [];
    if (input.photos.length > 0) {
      const best = input.photos[input.photos.length - 1];
      const url = await fetchAndStoreImage(supabase, botToken, best.file_id, storedImages.length);
      if (url) storedImages.push({ url, position: storedImages.length });
    }
    if (input.document && input.document.mime_type?.startsWith("image/")) {
      const url = await fetchAndStoreImage(
        supabase,
        botToken,
        input.document.file_id,
        storedImages.length
      );
      if (url) storedImages.push({ url, position: storedImages.length });
    }

    const { error: msgErr } = await supabase.from("telegram_batch_messages").insert({
      batch_id: batchId,
      message_id: input.messageId,
      from_name: input.senderName,
      sent_at: input.sentAt,
      caption: input.caption,
      transcript,
      location: input.location,
      image_urls: storedImages,
      raw: {
        message_id: input.messageId,
        from_name: input.senderName,
        has_photo: input.photos.length > 0,
        has_voice: !!input.voice,
        has_document: !!input.document,
        group_key: input.groupKey,
      },
    });

    if (msgErr) {
      await sendTelegram(botToken, input.chatId, `Erreur: ${msgErr.message}`);
      return new Response(JSON.stringify({ error: msgErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A newer message supersedes older waiting batches from the SAME chat only
    await rescheduleOlderBatches(supabase, input.chatId, batchId);
    await extendBatchWindow(supabase, batchId, input.senderId, windowSeconds);

    const finalized = await reconcileDueBatches(
      supabase,
      botToken,
      settings,
      openaiKey,
      minimaxKey
    );

    // If this message is the last one of the group, no further webhook will arrive to
    // trigger the closing of the batch. Wake up after the window elapses to finalize it.
    const wake = (async () => {
      await new Promise((r) => setTimeout(r, windowSeconds * 1000 + 1000));
      const freshSettings = await loadSettings(supabase);
      await reconcileDueBatches(supabase, botToken, freshSettings, openaiKey, minimaxKey);
    })();
    const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
      .EdgeRuntime;
    if (runtime?.waitUntil) {
      runtime.waitUntil(wake);
    } else {
      wake.catch(() => {});
    }

    return new Response(
      JSON.stringify({ success: true, batch: batchId, finalized }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/* ── Message parsing ── */

function extractMessage(update: Record<string, unknown>): MessageInput & { chatId: number } {
  const chat = update.chat as { id: number } | undefined;
  const from = update.from as
    | { id?: number; first_name?: string; last_name?: string }
    | undefined;
  const photo = update.photo as Array<{ file_id: string }> | undefined;
  const document = update.document as { file_id: string; mime_type?: string } | null;
  const voice = (update.voice || update.audio) as { file_id: string } | null;
  const mediaGroupId = update.media_group_id as string | undefined;
  const caption = String(update.caption || update.text || "");
  const chatId = chat?.id ?? 0;
  const senderId = from?.id ? String(from.id) : "unknown";
  const senderName = from
    ? [from.first_name, from.last_name].filter(Boolean).join(" ")
    : "";

  return {
    chatId,
    messageId: (update.message_id as number) ?? null,
    senderId,
    senderName: senderName || "Inconnu",
    sentAt: update.date
      ? new Date(Number(update.date) * 1000).toISOString()
      : new Date().toISOString(),
    caption,
    groupKey: mediaGroupId ? `mg:${chatId}:${mediaGroupId}` : `sg:${chatId}`,
    location: (update.location as { latitude: number; longitude: number }) || null,
    photos: photo ?? [],
    document: document ?? null,
    voice: voice ?? null,
  };
}

async function loadSettings(
  supabase: ReturnType<typeof createClient>
): Promise<CarnetSettings | null> {
  try {
    const { data } = await supabase
      .from("carnet_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    return (data as CarnetSettings) ?? null;
  } catch {
    return null;
  }
}

/* ── Batching ── */

function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function attachBatch(
  supabase: ReturnType<typeof createClient>,
  input: MessageInput & { chatId: number },
  windowSeconds: number
): Promise<string> {
  const nowIso = new Date().toISOString();
  const expires = expiresAt(windowSeconds);

  const extend = async (id: string) => {
    const { data } = await supabase
      .from("telegram_batches")
      .update({ window_expires_at: expires, updated_at: nowIso })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    return data ? (data.id as string) : null;
  };

  // Album photos: Telegram emits one webhook per photo sharing the same media_group_id
  if (input.groupKey.startsWith("mg:")) {
    const { data: album } = await supabase
      .from("telegram_batches")
      .update({ window_expires_at: expires, updated_at: nowIso })
      .eq("group_key", input.groupKey)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (album) return album.id as string;

    const senderBatch = await findSenderBatch(supabase, input.chatId, input.senderId);
    if (senderBatch) {
      const id = await extend(senderBatch);
      if (id) return id;
    }
  } else {
    const senderBatch = await findSenderBatch(supabase, input.chatId, input.senderId);
    if (senderBatch) {
      const id = await extend(senderBatch);
      if (id) return id;
    }
  }

  const key = input.groupKey.startsWith("mg:")
    ? input.groupKey
    : `${input.groupKey}:${input.senderId}:${Date.now()}`;

  const { data, error } = await supabase
    .from("telegram_batches")
    .insert({
      chat_id: input.chatId,
      group_key: key,
      status: "pending",
      window_expires_at: expires,
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle();

  if (!error && data) return data.id as string;

  // Someone else created the same group between our SELECT and INSERT
  const { data: raced } = await supabase
    .from("telegram_batches")
    .update({ window_expires_at: expires, updated_at: nowIso })
    .eq("group_key", key)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (raced) return raced.id as string;

  const fallbackKey = `sg:${input.chatId}:${input.senderId}:${Date.now()}`;
  const { data: fallback, error: fbErr } = await supabase
    .from("telegram_batches")
    .insert({
      chat_id: input.chatId,
      group_key: fallbackKey,
      status: "pending",
      window_expires_at: expires,
      last_message_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .maybeSingle();
  if (fbErr || !fallback) throw new Error("Impossible de creer le lot Telegram");
  return fallback.id as string;
}

async function findSenderBatch(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  senderId: string
): Promise<string | null> {
  if (senderId === "unknown") return null;
  const { data } = await supabase
    .from("telegram_batches")
    .select("id")
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .ilike("group_key", `sg:${chatId}:${senderId}:%`)
    .gte("created_at", new Date(Date.now() - SENDER_BATCH_TTL_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data.id as string) : null;
}

async function extendBatchWindow(
  supabase: ReturnType<typeof createClient>,
  batchId: string,
  _senderId: string,
  windowSeconds: number
) {
  await supabase
    .from("telegram_batches")
    .update({
      window_expires_at: expiresAt(windowSeconds),
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId)
    .eq("status", "pending");
}

// When a new message lands, older waiting batches of the SAME chat are closed early
// so the new activity is never appended to a batch that is about to be published.
async function rescheduleOlderBatches(
  supabase: ReturnType<typeof createClient>,
  chatId: number,
  currentBatchId: string
) {
  await supabase
    .from("telegram_batches")
    .update({ window_expires_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .neq("id", currentBatchId);
}

/* ── Reconciliation ── */

async function reconcileDueBatches(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  settings: CarnetSettings | null,
  openaiKey: string | undefined,
  minimaxKey: string
): Promise<number> {
  let finalized = 0;
  for (let i = 0; i < MAX_BATCHES_PER_CALL; i++) {
    const nowIso = new Date().toISOString();
    const { data: due } = await supabase
      .from("telegram_batches")
      .select("id")
      .eq("status", "pending")
      .lte("window_expires_at", nowIso)
      .order("window_expires_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!due) break;

    const { data: claimed } = await supabase
      .from("telegram_batches")
      .update({ status: "processing", updated_at: nowIso })
      .eq("id", due.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();
    if (!claimed) continue;

    try {
      await finalizeBatch(
        supabase,
        botToken,
        claimed as BatchRow,
        settings,
        openaiKey,
        minimaxKey
      );
      finalized++;
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      const message = (e as Error).message;
      await supabase
        .from("telegram_batches")
        .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
        .eq("id", claimed.id);
      await sendTelegram(botToken, claimed.chat_id, `Erreur carnet : ${message}`);
    }
  }
  return finalized;
}

/* ── Finalization ── */

async function finalizeBatch(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  batch: BatchRow,
  settings: CarnetSettings | null,
  openaiKey: string | undefined,
  minimaxKey: string
) {
  const { data: messages, error } = await supabase
    .from("telegram_batch_messages")
    .select("*")
    .eq("batch_id", batch.id)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  if (!messages || messages.length === 0) {
    await supabase
      .from("telegram_batches")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", batch.id);
    return;
  }

  const transcripts: string[] = [];
  const captions: string[] = [];
  const allImages: string[] = [];
  let lat = 0;
  let lng = 0;
  let author = "";

  for (const m of messages) {
    if (!author && m.from_name) author = m.from_name;
    if (m.transcript) transcripts.push(m.transcript);
    if (m.caption && m.caption.trim()) captions.push(m.caption);
    const imgs = Array.isArray(m.image_urls) ? (m.image_urls as StoredImage[]) : [];
    for (const img of imgs) {
      if (img?.url) allImages.push(img.url);
    }
    if (m.location && lat === 0) {
      lat = Number(m.location.latitude) || 0;
      lng = Number(m.location.longitude) || 0;
    }
  }

  // Aggregate the text of the whole group
  const captionText = captions.join("\n");
  let city = "";
  const cityMatch = captionText.match(/#(\S+)/);
  if (cityMatch) city = cityMatch[1].replace(/_/g, " ");
  const authorMatch = captionText.match(/@(\S+)/);
  if (authorMatch) author = authorMatch[1].replace(/_/g, " ");

  if (city && lat === 0) {
    const { data: cityRow } = await supabase
      .from("french_cities")
      .select("lat, lng")
      .ilike("name", city)
      .maybeSingle();
    if (cityRow) {
      lat = cityRow.lat;
      lng = cityRow.lng;
    }
  }

  const voiceTranscript = transcripts.length > 0 ? transcripts.join("\n") : null;

  // Nothing was received: no image could be retrieved and there is no text or voice.
  // Creating an empty carnet entry would only produce a meaningless draft.
  if (allImages.length === 0 && !captionText.trim() && !voiceTranscript) {
    await supabase
      .from("telegram_batches")
      .update({
        status: "failed",
        error: "Aucun contenu recu : image non recuperee",
        updated_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    await sendTelegram(
      botToken,
      batch.chat_id,
      "Je n'ai pas pu recuperer la photo de ce message, le carnet n'a pas ete cree. Merci de renvoyer la photo."
    );
    return;
  }

  const userText = captions.length > 0
    ? captionText.replace(/#\S+/g, "").replace(/@\S+/g, "").trim()
    : voiceTranscript || "";

  const ai = await analyzeWithAi(allImages, userText, city, settings, openaiKey, minimaxKey);

  const lines = captionText
    .replace(/#\S+/g, "")
    .replace(/@\S+/g, "")
    .split("\n")
    .map((l: string) => l.trim())
    .filter(Boolean);
  const userTitle = lines[0] || "";
  const userDescription = lines.slice(1).join("\n") || null;

  const finalTitle = (
    ai.title ||
    userTitle ||
    fallbackTitle(settings?.ai_language || "fr", ai.category, city)
  ).slice(0, 120);
  const finalDescription = ai.summary || userDescription || null;

  const { data: entry, error: insertErr } = await supabase
    .from("photos")
    .insert({
      title: finalTitle,
      description: finalDescription,
      city,
      author,
      lat,
      lng,
      published: false,
      image_url: allImages[0] || "",
      raw_data: {
        telegram: {
          chat_id: batch.chat_id,
          message_count: messages.length,
          message_ids: messages.map((m) => m.message_id),
          group_key: batch.group_key,
        },
        ai_provider: ai.provider,
        ai_model: ai.model,
        ai_category: ai.category,
        ai_analysis: ai.raw,
        ai_error: ai.error,
        gps: lat !== 0 || lng !== 0 ? { lat, lng } : null,
      },
      detected_brands:
        ai.brands && ai.brands.length > 0 ? ai.brands : null,
      voice_transcript: voiceTranscript,
      ai_summary: ai.summary,
      source: "telegram",
    })
    .select("id")
    .single();

  if (insertErr) throw new Error(insertErr.message);

  const entryId = entry.id as string;
  for (let i = 0; i < allImages.length; i++) {
    await supabase.from("photo_images").insert({
      photo_id: entryId,
      image_url: allImages[i],
      position: i,
    });
  }

  await supabase
    .from("telegram_batches")
    .update({ status: "done", photo_id: entryId, updated_at: new Date().toISOString() })
    .eq("id", batch.id);

  const ageMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(batch.created_at).getTime()) / 60000)
  );
  const replyParts = [
    "Carnet : brouillon cree",
    `Titre : ${finalTitle}`,
  ];
  if (city) replyParts.push(`Lieu : ${city}`);
  if (ai.brands.length > 0) replyParts.push(`Marques : ${ai.brands.join(", ")}`);
  if (voiceTranscript) {
    replyParts.push(
      `Transcription : ${voiceTranscript.slice(0, 100)}${voiceTranscript.length > 100 ? "..." : ""}`
    );
  }
  if (ai.summary) {
    replyParts.push(
      `Resume IA : ${ai.summary.slice(0, 150)}${ai.summary.length > 150 ? "..." : ""}`
    );
  }
  replyParts.push(`${allImages.length} photo(s)`);
  if (messages.length > 1) {
    replyParts.push(
      `Regroupe : ${messages.length} messages sur ${ageMinutes < 1 ? "moins d'une minute" : ageMinutes + " minutes"}`
    );
  }
  replyParts.push("A valider dans l'espace admin pour publier.");

  await sendTelegram(botToken, batch.chat_id, replyParts.join("\n"));
}

/* ── AI analysis ── */

const LANGUAGES: Record<string, string> = {
  fr: "francais",
  en: "anglais",
  es: "espagnol",
  de: "allemand",
  it: "italien",
  pt: "portugais",
  nl: "neerlandais",
  ar: "arabe",
};

const FALLBACK_LABELS: Record<string, { prefix: string; at: string }> = {
  fr: { prefix: "Intervention", at: "a" },
  en: { prefix: "Job", at: "in" },
  es: { prefix: "Intervencion", at: "en" },
  de: { prefix: "Einsatz", at: "in" },
  it: { prefix: "Intervento", at: "a" },
  pt: { prefix: "Intervencao", at: "em" },
  nl: { prefix: "Opdracht", at: "in" },
};

function fallbackTitle(language: string, category: string, city: string): string {
  const lang = (language || "fr").slice(0, 2).toLowerCase();
  const labels = FALLBACK_LABELS[lang] || FALLBACK_LABELS.fr;
  const parts = [labels.prefix];
  if (category) parts.push(category);
  if (city) parts.push(`${labels.at} ${city}`);
  return parts.join(" ");
}

function buildPrompt(settings: CarnetSettings | null): string {
  const base = (settings?.ai_prompt || "").trim() || DEFAULT_PROMPT;
  const language = (settings?.ai_language || "fr").slice(0, 2).toLowerCase();
  const languageName = LANGUAGES[language] || LANGUAGES.fr;
  const parts = [base];
  parts.push(
    `Tu rediges TOUJOURS le titre et le resume en ${languageName}, meme si les messages recus sont dans une autre langue.`
  );
  const style = (settings?.ai_style || "professionnel").trim();
  if (style) {
    parts.push(`Style de redaction demande : ${style}.`);
  }
  const activity = (settings?.activity_context || "").trim();
  if (activity) {
    parts.push(`Contexte de l'activite de l'entreprise : ${activity}`);
  }
  if (settings?.detect_brands === false) {
    parts.push('Aucune recherche de marque : renvoie toujours un tableau "brands" vide.');
  }
  if (!/["']summary["']/.test(base)) {
    parts.push(JSON_SCHEMA);
  }
  return parts.join("\n\n");
}

function resolveProvider(
  settings: CarnetSettings | null,
  openaiKey: string | undefined,
  minimaxKey: string
): AiProvider | null {
  const model = (settings?.ai_model || "gpt-4o-mini").trim();
  if (/^minimax/i.test(model)) {
    const key = minimaxKey || (settings?.minimax_api_key || "").trim();
    if (!key) return null;
    const base = (settings?.minimax_base_url || "https://api.minimax.io/v1").replace(/\/+$/, "");
    return { name: "minimax", model, url: `${base}/chat/completions`, apiKey: key };
  }
  if (!openaiKey) return null;
  return {
    name: "openai",
    model,
    url: "https://api.openai.com/v1/chat/completions",
    apiKey: openaiKey,
  };
}

// Models often wrap the JSON in reasoning prose or fences. This pulls out the first
// balanced JSON object so the content is never mistaken for a description.
function extractJsonObject(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return cleaned.slice(start, i + 1);
    }
  }
  return null;
}

interface AiResult {
  title: string;
  summary: string | null;
  brands: string[];
  category: string;
  provider: string;
  model: string;
  raw: unknown;
  error: string | null;
}

async function analyzeWithAi(
  images: string[],
  text: string,
  city: string,
  settings: CarnetSettings | null,
  openaiKey: string | undefined,
  minimaxKey: string
): Promise<AiResult> {
  const provider = resolveProvider(settings, openaiKey, minimaxKey);
  const empty: AiResult = {
    title: "",
    summary: null,
    brands: [],
    category: "",
    provider: provider?.name ?? "none",
    model: provider?.model ?? "",
    raw: null,
    error: null,
  };
  if (!provider || (images.length === 0 && !text)) {
    if (!provider) empty.error = "Aucune cle IA configuree";
    return empty;
  }

  try {
    const userContent: Array<Record<string, unknown>> = [];
    for (const url of images.slice(0, MAX_IMAGES_TO_ANALYZE)) {
      userContent.push({ type: "image_url", image_url: { url } });
    }
    if (text) userContent.push({ type: "text", text: `Contexte du technicien : ${text}` });
    if (city) userContent.push({ type: "text", text: `Lieu : ${city}` });
    if (images.length > MAX_IMAGES_TO_ANALYZE) {
      userContent.push({
        type: "text",
        text: `(${images.length - MAX_IMAGES_TO_ANALYZE} photo(s) supplementaire(s) non transmise(s))`,
      });
    }

    const resp = await fetch(provider.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: "system", content: buildPrompt(settings) },
          { role: "user", content: userContent },
        ],
        max_tokens: 800,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      empty.error = `${provider.name} API ${resp.status}: ${detail.slice(0, 200)}`;
      return empty;
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;
    const textContent = typeof content === "string" ? content.trim() : "";
    if (!textContent) {
      empty.error = "Reponse IA vide";
      return empty;
    }

    const jsonText = extractJsonObject(textContent);
    if (jsonText) {
      try {
        const parsed = JSON.parse(jsonText);
        const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
        return {
          title: typeof parsed.title === "string" ? parsed.title.trim() : "",
          summary: summary || null,
          brands:
            settings?.detect_brands === false
              ? []
              : Array.isArray(parsed.brands)
                ? parsed.brands.filter((b: unknown) => typeof b === "string")
                : [],
          category: typeof parsed.category === "string" ? parsed.category : "",
          provider: provider.name,
          model: provider.model,
          raw: parsed,
          error: null,
        };
      } catch {
        // fall through to the unparsed branch below
      }
    }

    // The model answered but no usable JSON was found. Nothing from the raw answer
    // is used as a description: the technician's own caption and a generated title
    // take over, so no reasoning text can ever reach the carnet.
    return {
      title: "",
      summary: null,
      brands: [],
      category: "",
      provider: provider.name,
      model: provider.model,
      raw: { unparsed_response: textContent.slice(0, 2000) },
      error: "Reponse IA non exploitable",
    };
  } catch (e) {
    empty.error = (e as Error).message;
    return empty;
  }
}

/* ── Telegram helpers ── */

async function transcribeVoice(
  botToken: string,
  fileId: string,
  openaiKey: string,
  language: string
): Promise<string | null> {
  try {
    const fileUrl = await getTelegramFileUrl(botToken, fileId);
    if (!fileUrl) return null;
    const audioResp = await fetch(fileUrl);
    if (!audioResp.ok) return null;
    const audioBlob = await audioResp.blob();
    const formData = new FormData();
    formData.append("file", audioBlob, "voice.ogg");
    formData.append("model", "whisper-1");
    formData.append("language", (language || "fr").slice(0, 2).toLowerCase());

    const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });
    if (!whisperResp.ok) return null;
    const data = await whisperResp.json();
    return data.text || null;
  } catch {
    return null;
  }
}

async function getTelegramFileUrl(
  botToken: string,
  fileId: string
): Promise<string | null> {
  const resp = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.ok || !data.result?.file_path) return null;
  return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
}

async function fetchAndStoreImage(
  supabase: ReturnType<typeof createClient>,
  botToken: string,
  fileId: string,
  position: number
): Promise<string | null> {
  // Telegram occasionally answers too slowly on the first try: retry once before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
    try {
      const fileUrl = await getTelegramFileUrl(botToken, fileId);
      if (!fileUrl) continue;
      const resp = await fetch(fileUrl);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const ext = fileUrl.split(".").pop()?.split("?")[0] || "jpg";
      const path = `telegram/${Date.now()}-${position}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("photos").upload(path, blob, {
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
      if (error) continue;
      const { data } = supabase.storage.from("photos").getPublicUrl(path);
      return data.publicUrl;
    } catch {
      continue;
    }
  }
  return null;
}

async function sendTelegram(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

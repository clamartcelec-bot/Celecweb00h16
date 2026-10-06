import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { loadSettings, analyzeWithAi, getAnalysisText, calculateDraftFields, type CarnetSettings } from "../_shared/carnetProcessor.ts";
import { transcribeAudio } from "../_shared/carnetTranscription.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SENDER_BATCH_TTL_MS = 10 * 60 * 1000;
const MAX_BATCHES_PER_CALL = 5;

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
  gps?: { lat: number; lng: number } | null;
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
    // EXIF GPS survives only on files sent as "document"; Telegram strips it from
    // compressed photos, so extraction may return null and that is expected.
    const storedImages: StoredImage[] = [];
    if (input.photos.length > 0) {
      const best = input.photos[input.photos.length - 1];
      const stored = await fetchAndStoreImage(supabase, botToken, best.file_id, storedImages.length);
      if (stored) storedImages.push({ url: stored.url, gps: stored.gps, position: storedImages.length });
    }
    if (input.document && input.document.mime_type?.startsWith("image/")) {
      const stored = await fetchAndStoreImage(
        supabase,
        botToken,
        input.document.file_id,
        storedImages.length
      );
      if (stored) storedImages.push({ url: stored.url, gps: stored.gps, position: storedImages.length });
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

/* ── Batching ── */

function expiresAt(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function attachBatch(
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
  supabase: SupabaseClient,
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
      if (img?.gps && lat === 0 && lng === 0) {
        lat = Number(img.gps.lat) || 0;
        lng = Number(img.gps.lng) || 0;
      }
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

  const userText = getAnalysisText(captionText, voiceTranscript, captions.length > 0);

  const ai = await analyzeWithAi(allImages, userText, city, settings, openaiKey, minimaxKey);

  const fields = calculateDraftFields(ai, captionText, city, settings?.ai_language || "fr");
  const finalTitle = fields.title;
  const finalDescription = fields.description;

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
  if (!city && lat !== 0) replyParts.push("Position GPS detectee sur la photo");
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
    const result = await transcribeAudio(audioBlob, "voice.ogg", openaiKey, language);
    return result.text;
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
  supabase: SupabaseClient,
  botToken: string,
  fileId: string,
  position: number
): Promise<{ url: string; gps: { lat: number; lng: number } | null } | null> {
  // Telegram occasionally answers too slowly on the first try: retry once before giving up.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1200));
    try {
      const fileUrl = await getTelegramFileUrl(botToken, fileId);
      if (!fileUrl) continue;
      const resp = await fetch(fileUrl);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      const gps = await extractExifGps(blob);
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
      return { url: data.publicUrl, gps };
    } catch {
      continue;
    }
  }
  return null;
}

/* ── EXIF GPS extraction ── */

// Reads the GPS coordinates from a JPEG's EXIF block. Returns null for photos
// without EXIF (Telegram compressed photos) or without a GPS tag.
async function extractExifGps(blob: Blob): Promise<{ lat: number; lng: number } | null> {
  try {
    const view = new DataView(await blob.arrayBuffer());
    if (view.byteLength < 12 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset);
      const size = view.getUint16(offset + 2);
      if (marker === 0xffe1 && offset + 10 < view.byteLength) {
        let isExif = true;
        for (let i = 0; i < 4; i++) {
          if (view.getUint8(offset + 4 + i) !== "Exif".charCodeAt(i)) {
            isExif = false;
            break;
          }
        }
        if (isExif) return parseTiffGps(view, offset + 10);
      }
      if (marker === 0xffda) break;
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

function parseTiffGps(view: DataView, tiffStart: number): { lat: number; lng: number } | null {
  if (tiffStart + 8 > view.byteLength) return null;
  const little = view.getUint16(tiffStart) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  if (u16(tiffStart + 2) !== 42) return null;
  const ifd0 = tiffStart + u32(tiffStart + 4);
  if (ifd0 + 2 > view.byteLength) return null;

  let gpsStart = 0;
  const entries0 = u16(ifd0);
  for (let i = 0; i < entries0; i++) {
    const e = ifd0 + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    if (u16(e) === 0x8825) {
      gpsStart = tiffStart + u32(e + 8);
      break;
    }
  }
  if (!gpsStart || gpsStart + 2 > view.byteLength) return null;

  const readRationals = (base: number, count: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const num = u32(base + i * 8);
      const den = u32(base + i * 8 + 4);
      out.push(den === 0 ? 0 : num / den);
    }
    return out;
  };

  let latRef = "N";
  let lngRef = "E";
  let latVals: number[] = [];
  let lngVals: number[] = [];
  const entries = u16(gpsStart);
  for (let i = 0; i < entries; i++) {
    const e = gpsStart + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const tag = u16(e);
    const type = u16(e + 2);
    const count = u32(e + 4);
    const bytesPer = type === 5 || type === 10 ? 8 : type === 2 || type === 1 || type === 7 ? 1 : type === 3 ? 2 : 4;
    const base = count * bytesPer > 4 ? tiffStart + u32(e + 8) : e + 8;
    if (tag === 1) latRef = String.fromCharCode(view.getUint8(base));
    else if (tag === 2) latVals = readRationals(base, Math.min(count, 3));
    else if (tag === 3) lngRef = String.fromCharCode(view.getUint8(base));
    else if (tag === 4) lngVals = readRationals(base, Math.min(count, 3));
  }
  if (latVals.length === 0 || lngVals.length === 0) return null;

  const dmsToDeg = (v: number[]) => (v[0] || 0) + (v[1] || 0) / 60 + (v[2] || 0) / 3600;
  const lat = dmsToDeg(latVals) * (latRef === "S" ? -1 : 1);
  const lng = dmsToDeg(lngVals) * (lngRef === "W" ? -1 : 1);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

async function sendTelegram(botToken: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

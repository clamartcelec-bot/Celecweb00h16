import { ApiError, bodyJson, errorResponse, json, requireAdmin, rpc, uuid } from "../_shared/carnetHttp.ts";
import { LIMITS, manifestHash, sha256, validateManifest, verifyContainer, type Manifest } from "../_shared/carnetManifest.ts";
import { analyzeWithAi, calculateDraftFields, getAnalysisText, loadSettings, type CarnetSettings } from "../_shared/carnetProcessor.ts";
import { transcribeAudio } from "../_shared/carnetTranscription.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";

interface Batch { batch_id: string; user_id: string; status: string; stage: string; attempt_id: string | null; lease_until: string | null; carnet_entry_id: string | null; original_entry_id: string | null; manifest: Manifest; settings_snapshot: CarnetSettings | null; draft_result: Record<string, unknown> | null; error_code: string | null; retryable: boolean }
interface Media { item_id: string; type: string; origin: string; position: number; storage_path: string; byte_size: number; mime_type: string; sha256: string; verified: boolean; transcription_done: boolean; transcript: string | null }
const BUCKET = "carnet-ingest";

function response(b: Batch) {
  if (b.status === "deleted") return json({ success: false, api_version: 1, batch_id: b.batch_id, status: "deleted", code: "entry_deleted", original_entry_id: b.original_entry_id, retryable: false }, 410);
  return json({ success: b.status === "created", api_version: 1, batch_id: b.batch_id, status: b.status, stage: b.stage,
    ...(b.status === "created" ? { carnet_entry_id: b.carnet_entry_id } : { retry_after_seconds: 3, error_code: b.error_code, retryable: b.retryable, stale_attempt: b.status === "processing" && (!b.lease_until || Date.parse(b.lease_until) <= Date.now()) }) }, b.status === "processing" || b.status === "uploaded" ? 202 : 200);
}
async function getBatch(db: SupabaseClient, actor: string, id: string): Promise<Batch> {
  const { data, error } = await db.from("carnet_ingest_batches").select("*").eq("batch_id", id).eq("user_id", actor).maybeSingle();
  if (error) throw new ApiError("database_unavailable", 503, true);
  if (!data) throw new ApiError("not_found", 404);
  return data as Batch;
}
async function getMedia(db: SupabaseClient, batch: string): Promise<Media[]> {
  const { data, error } = await db.from("carnet_ingest_media").select("*").eq("batch_id", batch).eq("origin", "capture").order("position");
  if (error) throw new ApiError("database_unavailable", 503, true);
  return data as Media[];
}
async function objectBytes(db: SupabaseClient, media: Media): Promise<Uint8Array<ArrayBuffer>> {
  // Fetch one bounded object. The expected size was reserved before upload; bucket caps size.
  const { data, error } = await db.storage.from(BUCKET).download(media.storage_path);
  if (error || !data) throw new ApiError("media_missing", 409, true, "Un média doit être réenvoyé.");
  if (data.size !== media.byte_size || data.size > 25 * 1024 * 1024) throw new ApiError("media_size_mismatch", 409, true);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!verifyContainer(bytes, media.mime_type)) throw new ApiError("media_type_mismatch", 415, true);
  if (await sha256(bytes) !== media.sha256) throw new ApiError("media_hash_mismatch", 409, true);
  return bytes;
}

export async function handleMobile(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return json(null);
  let context: Awaited<ReturnType<typeof requireAdmin>> | undefined;
  let active: { batch: string; attempt: string } | undefined;
  try {
    const body = await bodyJson(req);
    if (body.api_version !== 1) throw new ApiError("unsupported_version");
    context = await requireAdmin(req);
    const { db, actor, name } = context;
    if (body.action === "capabilities") return json({ success: true, api_version: 1, user: { id: actor, name }, limits: LIMITS, max_pending_batches: 3, max_pending_bytes: 314572800, media_types: ["image/jpeg","image/png","audio/mp4","video/mp4"], video_processing: "stored_only", requires_location: false });
    if (!["prepare","status","finalize"].includes(String(body.action))) throw new ApiError("invalid_action");
    const batchId = uuid(body.batch_id);
    if (body.action === "status") return response(await getBatch(db, actor, batchId));
    if (body.action === "prepare") {
      const manifest = validateManifest(body);
      const b = await rpc<Batch>(db, "mobile_carnet_prepare", { p_actor: actor, p_batch: batchId, p_manifest: manifest, p_hash: await manifestHash(manifest) });
      if (b.status === "created" || b.status === "deleted" || b.status === "processing") return response(b);
      const uploads = [];
      for (const m of await getMedia(db, batchId)) {
        if (m.verified) continue;
        const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(m.storage_path, { upsert: false });
        if (error || !data) throw new ApiError("storage_unavailable", 503, true);
        uploads.push({ item_id: m.item_id, path: m.storage_path, token: data.token, signed_url: data.signedUrl, expires_in_seconds: 7200 });
      }
      return json({ success: false, api_version: 1, batch_id: batchId, status: b.status, manifest_hash: await manifestHash(manifest), uploads });
    }
    const current = await getBatch(db, actor, batchId);
    if (current.status === "created" || current.status === "deleted") return response(current);
    const liveSettings = await loadSettings(db);
    if (!liveSettings) throw new ApiError("settings_unavailable", 503, true);
    const snapshot = { ...liveSettings, minimax_api_key: "" };
    const attempt = crypto.randomUUID();
    const b = await rpc<Batch>(db, "mobile_carnet_claim", { p_actor: actor, p_batch: batchId, p_attempt: attempt, p_settings: snapshot });
    if (b.status !== "processing" || b.attempt_id !== attempt) return response(b);
    active = { batch: batchId, attempt };
    const started = Date.now();
    const checkpoint = (patch: Record<string, unknown>, item: string | null = null, media: Record<string, unknown> | null = null) => rpc(db, "mobile_carnet_checkpoint", { p_actor: actor, p_batch: batchId, p_attempt: attempt, p_patch: patch, p_item: item, p_media: media });
    const yieldIfNeeded = async (stage: string) => {
      if (Date.now()-started < 50000) return false;
      await checkpoint({ status: stage === "verify" ? "uploading" : "uploaded", stage }); return true;
    };
    const media = await getMedia(db, batchId);
    for (const m of media) {
      if (m.verified) continue;
      if (await yieldIfNeeded("verify")) return response(await getBatch(db, actor, batchId));
      try { await objectBytes(db, m); }
      catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("storage_unavailable", 503, true);
        await checkpoint({ status: err.code === "media_missing" ? "uploading" : "failed", stage: "verify", error_code: err.code, retryable: true }, m.item_id, { needs_reupload: err.code.startsWith("media_") && err.code !== "media_missing" });
        active = undefined; throw err;
      }
      await checkpoint({}, m.item_id, { verified: true }); m.verified = true;
    }
    const settings = { ...b.settings_snapshot!, minimax_api_key: liveSettings.minimax_api_key };
    const openai = Deno.env.get("OPENAI_API_KEY");
    const minimax = Deno.env.get("MINIMAX_API_KEY") || Deno.env.get("MINIMAX_M3_API_KEY") || "";
    await checkpoint({ stage: "transcribe" });
    for (const m of media.filter(x => x.type === "audio" && !x.transcription_done)) {
      if (settings.auto_transcribe === false) { await checkpoint({}, m.item_id, { transcription_done: true, transcript: null }); m.transcription_done = true; continue; }
      if (!openai) throw new ApiError("transcription_unavailable", 503, true);
      if (await yieldIfNeeded("transcribe")) return response(await getBatch(db, actor, batchId));
      const bytes = await objectBytes(db, m);
      const result = await transcribeAudio(new Blob([bytes], { type: m.mime_type }), "voice.m4a", openai, settings.ai_language, { signal: AbortSignal.timeout(Math.min(35000,85000-(Date.now()-started))) });
      if (result.error || !result.text) throw new ApiError(result.error || "transcription_unavailable", 502, true, "Transcription indisponible. Le lot est conservé.");
      await checkpoint({}, m.item_id, { transcript: result.text, transcription_done: true }); m.transcript = result.text;
    }
    const voice = media.map(m => m.transcript).filter(Boolean).join("\n") || null;
    await checkpoint({ voice_transcript: voice, stage: "analyze" });
    if (!b.draft_result) {
      if (await yieldIfNeeded("analyze")) return response(await getBatch(db, actor, batchId));
      const images = [];
      for (const m of media.filter(x => x.type === "image")) {
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(m.storage_path, 120);
        if (error || !data) throw new ApiError("storage_unavailable", 503, true);
        images.push(data.signedUrl);
      }
      const caption = b.manifest.text;
      const analysisText = getAnalysisText(caption, voice, Boolean(caption.trim()));
      let ai = { title: "", summary: null as string | null, brands: [] as string[], category: "", provider: "none", model: "", raw: null as unknown, error: null as string | null };
      if (images.length || analysisText) {
        ai = await analyzeWithAi(images, analysisText, "", settings, openai, minimax, { signal: AbortSignal.timeout(Math.min(35000,85000-(Date.now()-started))) });
        if (ai.error) throw new ApiError("analysis_unavailable", 502, true, "Analyse indisponible. Le lot est conservé.");
      }
      const fields = calculateDraftFields(ai, caption, "", settings.ai_language);
      await checkpoint({ draft_result: { ...fields, brands: ai.brands, category: ai.category, provider: ai.provider, model: ai.model, diagnostics: ai.raw, unanalyzed_video_count: media.filter(m => m.type === "video").length } });
    }
    await checkpoint({ stage: "commit" });
    await rpc(db, "mobile_carnet_commit", { p_actor: actor, p_batch: batchId, p_attempt: attempt });
    active = undefined;
    return response(await getBatch(db, actor, batchId));
  } catch (e) {
    if (context && active) {
      const err = e instanceof ApiError ? e : new ApiError("service_unavailable", 503, true);
      try { await rpc(context.db, "mobile_carnet_checkpoint", { p_actor: context.actor, p_batch: active.batch, p_attempt: active.attempt, p_patch: { status: "failed", error_code: err.code, retryable: err.retryable } }); } catch { /* Expired or revoked actor cannot update this attempt. */ }
    }
    return errorResponse(e);
  }
}

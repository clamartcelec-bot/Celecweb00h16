import { ApiError, bodyJson, errorResponse, json, requireAdmin, uuid } from "../_shared/carnetHttp.ts";

// carnet-archive: read-only admin access to field data captured by Le Carnet CELEC.
// Reuses requireAdmin (Supabase Auth bearer + profiles.role === 'admin').
// Never mutates batches, never triggers transcription/analysis, never publishes.

const BUCKET = "carnet-ingest";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function safeName(base: string, mime: string): string {
  const clean = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 80) || "media";
  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : mime === "audio/mp4" ? "m4a" : mime === "video/mp4" ? "mp4" : "bin";
  return clean.includes(`.${ext}`) ? clean : `${clean}.${ext}`;
}

interface SessionCtx {
  session_id: string;
  intention: string | null;
  part: number;
  total: number;
  created_at: number;
  captures?: Array<{ item_id: string; created_at?: number; label?: string | null; role?: string | null; meeting_start?: number | null }>;
  passages?: Array<{ media_id: string; from_ms: number; to_ms: number; label?: string | null }>;
  passages_count?: number;
  details_on_device?: boolean;
}

function parseCtx(text: string): SessionCtx | null {
  if (!text.trim().startsWith("{")) return null;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    if (typeof v.session_id !== "string" || typeof v.part !== "number" || typeof v.total !== "number") return null;
    return v as SessionCtx;
  } catch { return null; }
}

export async function handleArchive(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors });
  try {
    const body = await bodyJson(req);
    const { db, actor, name } = await requireAdmin(req);
    const action = String(body.action || "");

    if (action === "list") {
      const limit = Math.min(Math.max(Number(body.limit) || 40, 1), 100);
      const before = body.before_created_at ? new Date(String(body.before_created_at)) : null;
      const beforeId = body.before_id ? uuid(body.before_id) : null;
      const owner = body.owner_id ? uuid(body.owner_id) : null;
      let query = db.from("carnet_ingest_batches").select("batch_id,user_id,status,stage,created_at,updated_at,expected_bytes,error_code,carnet_entry_id,manifest,voice_transcript,draft_result")
        .order("created_at", { ascending: false }).order("batch_id", { ascending: false }).limit(limit);
      if (before && !isNaN(before.getTime()) && beforeId) query = query.lt("created_at", before.toISOString());
      if (owner) query = query.eq("user_id", owner);
      const { data, error } = await query;
      if (error) throw new ApiError("database_unavailable", 503, true);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const counts = (m: unknown) => {
        const items = Array.isArray(m) ? m as Array<{ type: string }> : [];
        return {
          photos: items.filter((i) => i.type === "image").length,
          videos: items.filter((i) => i.type === "video").length,
          audios: items.filter((i) => i.type === "audio").length,
          total: items.length,
        };
      };
      const batches = rows.map((b) => {
        const manifest = b.manifest as { text?: string; items?: Array<{ type: string }> } | null;
        const ctx = parseCtx(String(manifest?.text ?? ""));
        return {
          batch_id: b.batch_id,
          owner_id: b.user_id,
          status: b.status,
          stage: b.stage,
          error_code: b.error_code,
          created_at: b.created_at,
          updated_at: b.updated_at,
          expected_bytes: b.expected_bytes,
          carnet_entry_id: b.carnet_entry_id,
          has_voice_transcript: Boolean(b.voice_transcript),
          ...counts(manifest?.items),
          session: ctx,
        };
      });
      const last = rows[rows.length - 1];
      return json({ success: true, batches, cursor: last ? { created_at: last.created_at, id: last.batch_id } : null, actor: { id: actor, name } });
    }

    if (action === "detail") {
      const batchId = uuid(body.batch_id);
      const { data: batch, error } = await db.from("carnet_ingest_batches").select("*").eq("batch_id", batchId).maybeSingle();
      if (error) throw new ApiError("database_unavailable", 503, true);
      if (!batch) throw new ApiError("not_found", 404);
      const { data: media, error: mediaError } = await db.from("carnet_ingest_media").select("item_id,batch_id,type,origin,position,mime_type,byte_size,sha256,duration_ms,storage_path,verified,needs_reupload,transcript,transcription_done,photo_id,photo_image_id,created_at")
        .eq("batch_id", batchId).order("position");
      if (mediaError) throw new ApiError("database_unavailable", 503, true);
      const manifest = batch.manifest as { text?: string; items?: unknown } | null;
      const ctx = parseCtx(String(manifest?.text ?? ""));
      return json({
        success: true,
        batch: {
          batch_id: batch.batch_id,
          owner_id: batch.user_id,
          status: batch.status,
          stage: batch.stage,
          attempt_id: batch.attempt_id,
          error_code: batch.error_code,
          retryable: batch.retryable,
          created_at: batch.created_at,
          updated_at: batch.updated_at,
          expected_bytes: batch.expected_bytes,
          manifest_hash: batch.manifest_hash,
          carnet_entry_id: batch.carnet_entry_id,
          original_entry_id: batch.original_entry_id,
          voice_transcript: batch.voice_transcript,
          draft_result: batch.draft_result,
          manifest_text: String(manifest?.text ?? ""),
        },
        media: (media ?? []).map((m: Record<string, unknown>) => ({ ...m, filename: safeName(String(m.item_id), String(m.mime_type)) })),
        session: ctx,
      });
    }

    if (action === "file_url") {
      const itemId = uuid(body.item_id);
      const { data: m, error } = await db.from("carnet_ingest_media").select("storage_path,mime_type,byte_size").eq("item_id", itemId).maybeSingle();
      if (error) throw new ApiError("database_unavailable", 503, true);
      if (!m || !m.storage_path) throw new ApiError("not_found", 404, false, "Fichier absent du stockage. Le média n'est pas (encore) arrivé.");
      const { data, error: urlError } = await db.storage.from(BUCKET).createSignedUrl(String(m.storage_path), 300, { download: safeName(String(m.filename ?? itemId), String(m.mime_type)) });
      if (urlError || !data) throw new ApiError("storage_unavailable", 503, true);
      return json({ success: true, url: data.signedUrl, mime_type: m.mime_type, byte_size: m.byte_size });
    }

    if (action === "manifest") {
      const batchId = uuid(body.batch_id);
      const { data: batch, error } = await db.from("carnet_ingest_batches").select("manifest,manifest_hash,expected_bytes,status,stage,error_code,created_at,updated_at,user_id,carnet_entry_id,voice_transcript,draft_result").eq("batch_id", batchId).maybeSingle();
      if (error) throw new ApiError("database_unavailable", 503, true);
      if (!batch) throw new ApiError("not_found", 404);
      const { data: media, error: mediaError } = await db.from("carnet_ingest_media").select("item_id,batch_id,type,origin,position,mime_type,byte_size,sha256,duration_ms,storage_path,verified,needs_reupload,transcript,transcription_done,photo_id,photo_image_id,created_at")
        .eq("batch_id", batchId).order("position");
      if (mediaError) throw new ApiError("database_unavailable", 503, true);
      const manifest = batch.manifest as { text?: string } | null;
      const ctx = parseCtx(String(manifest?.text ?? ""));
      const received = (media ?? []).reduce((s: number, m: Record<string, unknown>) => s + Number(m.byte_size ?? 0), 0);
      return json({
        success: true,
        snapshot: {
          format: "celec-carnet-export/1",
          legacy: !ctx,
          exported_at: new Date().toISOString(),
          batch: {
            batch_id: batch.batch_id, owner_id: batch.user_id, status: batch.status, stage: batch.stage,
            error_code: batch.error_code, created_at: batch.created_at, updated_at: batch.updated_at,
            carnet_entry_id: batch.carnet_entry_id, voice_transcript: batch.voice_transcript, draft_result: batch.draft_result,
          },
          manifest_hash: batch.manifest_hash,
          manifest_text: String(manifest?.text ?? ""),
          session: ctx,
          media,
          expected_bytes: batch.expected_bytes,
          received_bytes: received,
          complete: batch.status === "created" && received === Number(batch.expected_bytes ?? 0),
        },
      });
    }

    throw new ApiError("invalid_action");
  } catch (e) { return errorResponse(e); }
}

import { ApiError, uuid } from "./carnetProtocol.ts";
export const LIMITS = { max_items: 20, max_batch_bytes: 100 * 1024 * 1024, image_bytes: 10 * 1024 * 1024, audio_bytes: 20 * 1024 * 1024, video_bytes: 25 * 1024 * 1024, audio_duration_ms: 300000, video_duration_ms: 30000 };
export interface MediaInput { item_id: string; type: "image" | "audio" | "video"; position: number; mime_type: string; byte_size: number; sha256: string; duration_ms?: number }
export interface Manifest { api_version: 1; batch_id: string; text: string; items: MediaInput[] }
export function validateManifest(body: Record<string, unknown>): Manifest {
  const batch_id = uuid(body.batch_id);
  if (body.api_version !== 1) throw new ApiError("unsupported_version");
  const text = body.text ?? "";
  if (typeof text !== "string" || text.length > 4000) throw new ApiError("invalid_text");
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > LIMITS.max_items) throw new ApiError("invalid_items");
  const seen = new Set<string>(); let total = 0;
  const items: MediaInput[] = body.items.map((raw: Record<string, unknown>, i: number) => {
    if (!raw || typeof raw !== "object") throw new ApiError("invalid_item");
    const item_id = uuid(raw.item_id); if (seen.has(item_id)) throw new ApiError("duplicate_item"); seen.add(item_id);
    if (raw.position !== i) throw new ApiError("invalid_order");
    const type = raw.type;
    if (type !== "image" && type !== "audio" && type !== "video") throw new ApiError("unsupported_media", 415);
    const mimes = { image: ["image/jpeg", "image/png"], audio: ["audio/mp4"], video: ["video/mp4"] };
    if (typeof raw.mime_type !== "string" || !mimes[type].includes(raw.mime_type)) throw new ApiError("unsupported_media", 415);
    const size = raw.byte_size;
    if (typeof size !== "number" || !Number.isSafeInteger(size) || size <= 0) throw new ApiError("invalid_size");
    if (size > LIMITS[`${type}_bytes`]) throw new ApiError("media_too_large", 413);
    if (typeof raw.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(raw.sha256)) throw new ApiError("invalid_hash");
    if (raw.duration_ms !== undefined && (typeof raw.duration_ms !== "number" || !Number.isSafeInteger(raw.duration_ms) || raw.duration_ms < 0 || raw.duration_ms > 86400000)) throw new ApiError("invalid_duration");
    total += size;
    return { item_id, type, position: i, mime_type: raw.mime_type, byte_size: size, sha256: raw.sha256.toLowerCase(), ...(raw.duration_ms !== undefined ? { duration_ms: raw.duration_ms as number } : {}) };
  });
  if (total > LIMITS.max_batch_bytes) throw new ApiError("batch_too_large", 413);
  return { api_version: 1, batch_id, text, items };
}
export async function sha256(data: BufferSource) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data))).map(x => x.toString(16).padStart(2, "0")).join("");
}
export async function manifestHash(manifest: Manifest) { return sha256(new TextEncoder().encode(JSON.stringify(manifest))); }

// Container verification only: no transcoding or unbounded video decoding in an Edge Function.
export function verifyContainer(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") return bytes.length > 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  if (mime === "image/png") return [137,80,78,71,13,10,26,10].every((x,i) => bytes[i] === x) && bytes.length > 20;
  if (bytes.length < 24 || new TextDecoder().decode(bytes.subarray(4,8)) !== "ftyp") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let audio = false, video = false;
  function boxes(start: number, end: number, depth = 0): boolean {
    if (depth > 8) return false;
    for (let pos = start; pos + 8 <= end;) {
      let size = view.getUint32(pos); const type = new TextDecoder().decode(bytes.subarray(pos+4,pos+8)); let header = 8;
      if (size === 1) { if (pos+16>end) return false; const big = view.getBigUint64(pos+8); if (big > BigInt(bytes.length)) return false; size = Number(big); header = 16; }
      if (size === 0) size = end-pos;
      if (size<header || pos+size>end) return false;
      if (["moov","trak","mdia"].includes(type) && !boxes(pos+header,pos+size,depth+1)) return false;
      if (type === "hdlr" && size >= header+12) { const handler = new TextDecoder().decode(bytes.subarray(pos+header+8,pos+header+12)); audio ||= handler === "soun"; video ||= handler === "vide"; }
      pos += size;
    }
    return true;
  }
  return boxes(0,bytes.length) && (mime === "audio/mp4" ? audio && !video : video);
}

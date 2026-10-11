import { supabase } from './supabase';

export interface ArchiveSessionCtx {
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

export interface ArchiveBatchRow {
  batch_id: string;
  owner_id: string;
  status: string;
  stage: string;
  error_code: string | null;
  created_at: string;
  updated_at: string;
  expected_bytes: number;
  carnet_entry_id: string | null;
  has_voice_transcript: boolean;
  photos: number;
  videos: number;
  audios: number;
  total: number;
  session: ArchiveSessionCtx | null;
}

export interface ArchiveMediaRow {
  item_id: string;
  batch_id: string;
  type: 'image' | 'audio' | 'video';
  origin: string;
  position: number;
  mime_type: string;
  byte_size: number;
  sha256: string;
  duration_ms: number | null;
  storage_path: string;
  verified: boolean;
  needs_reupload: boolean;
  transcript: string | null;
  transcription_done: boolean;
  photo_id: string | null;
  photo_image_id: string | null;
  created_at: string;
  filename: string;
}

export interface ArchiveBatchDetail {
  batch: {
    batch_id: string;
    owner_id: string;
    status: string;
    stage: string;
    attempt_id: string | null;
    error_code: string | null;
    retryable: boolean | null;
    created_at: string;
    updated_at: string;
    expected_bytes: number;
    manifest_hash: string | null;
    carnet_entry_id: string | null;
    original_entry_id: string | null;
    voice_transcript: string | null;
    draft_result: Record<string, unknown> | null;
    manifest_text: string;
  };
  media: ArchiveMediaRow[];
  session: ArchiveSessionCtx | null;
}

export interface ArchiveSnapshot {
  format: string;
  legacy: boolean;
  exported_at: string;
  batch: Record<string, unknown>;
  manifest_hash: string | null;
  manifest_text: string;
  session: ArchiveSessionCtx | null;
  media: ArchiveMediaRow[];
  expected_bytes: number;
  received_bytes: number;
  complete: boolean;
}

export type ArchiveErrorCode =
  | 'not_configured' | 'signin_required' | 'forbidden' | 'not_deployed' | 'network' | 'read_error' | 'not_found';

export class ArchiveAccessError extends Error {
  constructor(public code: ArchiveErrorCode, message: string) { super(message); }
}

async function callArchive<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new ArchiveAccessError('not_configured', 'La base n\'est pas reliée au site.');
  const { data, error } = await supabase.functions.invoke('carnet-archive', { body });
  if (error) {
    let payload: { code?: string; message?: string } | null = null;
    try { payload = await (error.context as Response | undefined)?.json(); } catch { /* no body */ }
    const code = payload?.code;
    if (code === 'unauthorized') throw new ArchiveAccessError('signin_required', 'Connexion requise.');
    if (code === 'forbidden') throw new ArchiveAccessError('forbidden', 'Accès réservé aux administrateurs.');
    if (!payload && !navigator.onLine) throw new ArchiveAccessError('network', 'Réseau indisponible.');
    if (error.message?.includes('Failed to fetch') || error.message?.includes('non-existent')) {
      throw new ArchiveAccessError('not_deployed', 'Service d\'archive non déployé.');
    }
    throw new ArchiveAccessError('read_error', payload?.message || 'Lecture impossible pour le moment.');
  }
  if (!data?.success) throw new ArchiveAccessError('read_error', data?.message || 'Lecture incomplète.');
  return data as T;
}

export async function listArchiveBatches(params: { limit?: number; before_created_at?: string; before_id?: string; owner_id?: string } = {}) {
  const res = await callArchive<{ batches: ArchiveBatchRow[]; cursor: { created_at: string; id: string } | null }>({ action: 'list', ...params });
  return res;
}

export async function getArchiveDetail(batchId: string) {
  const res = await callArchive<ArchiveBatchDetail>({ action: 'detail', batch_id: batchId });
  return res;
}

export async function getArchiveFileUrl(itemId: string) {
  const res = await callArchive<{ url: string; mime_type: string; byte_size: number }>({ action: 'file_url', item_id: itemId });
  return res;
}

export async function getArchiveManifest(batchId: string) {
  const res = await callArchive<{ snapshot: ArchiveSnapshot }>({ action: 'manifest', batch_id: batchId });
  return res.snapshot;
}

export function ctxStatusLabel(batch: Pick<ArchiveBatchRow, 'status' | 'stage' | 'session' | 'total' | 'photos'>): { label: string; tone: string } {
  if (batch.session && batch.session.total > 1 && batch.session.part < batch.session.total) return { label: 'Partiellement reçue', tone: 'warn' };
  if (batch.status === 'deleted') return { label: 'Archive supprimée', tone: 'muted' };
  if (batch.status === 'failed') return { label: 'Échec de traitement', tone: 'error' };
  if (batch.status === 'processing' || batch.status === 'uploaded') return { label: 'Traitement en cours', tone: 'warn' };
  if (batch.status === 'uploading') return { label: 'Envoi incomplet', tone: 'warn' };
  if (batch.session?.details_on_device) return { label: 'Métadonnées partielles reçues', tone: 'warn' };
  if (batch.status === 'created') return { label: 'Reçu', tone: 'ok' };
  return { label: batch.status, tone: 'muted' };
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

export function fmtUtcLocal(d: string | number): string {
  const date = typeof d === 'number' ? new Date(d) : new Date(d);
  return `${date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })} · ${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function fmtMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

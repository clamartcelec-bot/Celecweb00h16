import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, Calendar, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Download, FileText, FileWarning, ImageIcon, MapPin, Mic, Play, RefreshCw,
  Search, ShieldAlert, Smartphone, Video, WifiOff, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  ArchiveAccessError, ArchiveBatchDetail, ArchiveBatchRow, ArchiveErrorCode, ArchiveMediaRow,
  ArchiveSessionCtx, ctxStatusLabel, fmtBytes, fmtMs, fmtUtcLocal, getArchiveDetail,
  getArchiveFileUrl, getArchiveManifest, listArchiveBatches,
} from '@/lib/carnetArchive';
import { downloadBlob } from '@/lib/zip';

/* ── Build binary-capable ZIP by reusing the stored-ZIP layout with bytes. ── */

interface BinaryZipEntry { name: string; bytes: Uint8Array<ArrayBuffer> }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildBinaryZip(entries: BinaryZipEntry[]): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const day = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts: Uint8Array<ArrayBuffer>[] = [];
  const centrals: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  const add = (data: Uint8Array, crc: number, name: string) => {
    const nameBytes = encoder.encode(name);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    parts.push(local);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    lv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(12, time, true);
    cv.setUint32(14, day, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  };
  for (const e of entries) add(e.bytes, crc32(e.bytes), e.name);
  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...centrals, end], { type: 'application/zip' });
}

/* ── Helpers ── */

type Profile = { id: string; email: string; full_name: string | null; role: string };

function ownerName(ownerId: string | null | undefined, profiles: Profile[]): string {
  if (!ownerId) return '—';
  const p = profiles.find((pr) => pr.id === ownerId);
  return p ? (p.full_name || p.email.split('@')[0]) : ownerId.slice(0, 8);
}

function typeIcon(t: ArchiveMediaRow['type']) {
  return t === 'image' ? ImageIcon : t === 'video' ? Video : Mic;
}

function safeFileBase(prefix: string): string {
  return prefix.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 60) || 'carnet';
}

function addText(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>;
}

/* ── Main component ── */

interface Props {
  profiles: Profile[];
}

export function FieldCarnets({ profiles }: Props) {
  const [rows, setRows] = useState<ArchiveBatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<{ created_at: string; id: string } | null>(null);
  const [accessError, setAccessError] = useState<ArchiveErrorCode | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'received' | 'partial' | 'failed'>('all');
  const [detail, setDetail] = useState<ArchiveBatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number; file: string } | null>(null);
  const exportCancel = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessError(null);
    setErrorMessage('');
    try {
      const res = await listArchiveBatches({ limit: 40 });
      setRows(res.batches);
      setCursor(res.cursor);
      setLastLoaded(new Date());
    } catch (e) {
      if (e instanceof ArchiveAccessError) { setAccessError(e.code); setErrorMessage(e.message); }
      else { setAccessError('read_error'); setErrorMessage('Erreur de lecture inconnue.'); }
    } finally { setLoading(false); }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listArchiveBatches({ limit: 40, before_created_at: cursor.created_at, before_id: cursor.id });
      setRows((prev) => [...prev, ...res.batches]);
      setCursor(res.cursor);
    } catch { /* keep prior page on failure */ }
    setLoadingMore(false);
  }, [cursor, loadingMore]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (batchId: string) => {
    setDetailLoading(true);
    try { setDetail(await getArchiveDetail(batchId)); }
    catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Détail indisponible.');
      setDetail(null);
    }
    setDetailLoading(false);
  };

  const downloadOne = async (m: ArchiveMediaRow) => {
    try {
      const { url } = await getArchiveFileUrl(m.item_id);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Téléchargement impossible (${res.status}).`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length !== m.byte_size) throw new Error('Taille inattendue du fichier reçu.');
      downloadBlob(new Blob([bytes], { type: m.mime_type }), m.filename);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Téléchargement impossible.');
    }
  };

  const downloadJson = async (batchId: string) => {
    try {
      const snapshot = await getArchiveManifest(batchId);
      downloadBlob(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }), `CELEC-carnet-${safeFileBase(batchId)}.json`);
    } catch (e) { setErrorMessage(e instanceof Error ? e.message : 'Export JSON impossible.'); }
  };

  const exportBatchZip = async (batchId: string) => {
    if (exporting) return;
    setExporting(true);
    exportCancel.current = false;
    try {
      const snapshot = await getArchiveManifest(batchId);
      const media = snapshot.media.filter((m) => m.verified || m.storage_path);
      const entries: BinaryZipEntry[] = [];
      let done = 0;
      const missing: string[] = [];
      setExportProgress({ done: 0, total: media.length + 1, file: 'métadonnées' });
      for (const m of media) {
        if (exportCancel.current) throw new Error('Export annulé.');
        setExportProgress({ done, total: media.length + 1, file: m.filename });
        try {
          const { url } = await getArchiveFileUrl(m.item_id);
          const res = await fetch(url);
          if (!res.ok) throw new Error(String(res.status));
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length !== m.byte_size) throw new Error('taille inattendue');
          entries.push({ name: `media/${m.item_id}/${m.filename}`, bytes });
        } catch (err) {
          missing.push(`${m.item_id} (${m.filename}) : ${err instanceof Error ? err.message : 'indisponible'}`);
        }
        done += 1;
      }
      const session = snapshot.session;
      const readme = [
        `CELEC — Carnet de terrain`,
        `Lot : ${batchId}`,
        `Session : ${session?.session_id ?? 'lot historique (format v1 sans session structurée)'}`,
        `Intention : ${session?.intention ?? 'non transmise'}`,
        `Reçu le : ${snapshot.batch.created_at ?? 'inconnu'}`,
        `Export : ${snapshot.exported_at}`,
        ``,
        `Fichiers attendus : ${snapshot.media.length}`,
        `Fichiers exportés : ${entries.length}`,
        snapshot.complete ? 'Statut : complet (octets vérifiés par taille).' : 'Statut : partiel — voir integrity.json.',
        snapshot.legacy ? 'Format : lot historique v1 (pas de session structurée).' : 'Format : session structurée v1.',
        session?.details_on_device ? 'Attention : métadonnées partielles reçues (détails restés sur le téléphone).' : '',
      ].filter(Boolean).join('\n');
      setExportProgress({ done, total: media.length + 1, file: 'assemblage du ZIP' });
      entries.push({ name: 'README.txt', bytes: addText(readme) });
      entries.push({ name: 'manifest.json', bytes: addText(JSON.stringify({ format: snapshot.format, legacy: snapshot.legacy, exported_at: snapshot.exported_at, expected_files: snapshot.media.length, exported_files: entries.length, missing_files: missing.length, complete: snapshot.complete, session, manifest_hash: snapshot.manifest_hash }, null, 2)) });
      entries.push({ name: 'session.json', bytes: addText(JSON.stringify(session, null, 2)) });
      entries.push({ name: 'timeline.json', bytes: addText(JSON.stringify({ order: 'position', media: snapshot.media.map((m) => ({ item_id: m.item_id, position: m.position, type: m.type, created_at: m.created_at, duration_ms: m.duration_ms })), passages: session?.passages ?? [] }, null, 2)) });
      entries.push({ name: 'receipts.json', bytes: addText(JSON.stringify({ batch_id: batchId, status: snapshot.batch.status, stage: snapshot.batch.stage, carnet_entry_id: snapshot.batch.carnet_entry_id, voice_transcript: snapshot.batch.voice_transcript }, null, 2)) });
      entries.push({ name: 'integrity.json', bytes: addText(JSON.stringify({ expected_bytes: snapshot.expected_bytes, received_bytes: snapshot.received_bytes, per_file: snapshot.media.map((m) => ({ item_id: m.item_id, byte_size: m.byte_size, sha256_expected: m.sha256, exported: entries.some((e) => e.name.includes(m.item_id)) })), missing }, null, 2)) });
      const blob = buildBinaryZip(entries);
      downloadBlob(blob, `CELEC-carnet-${safeFileBase(batchId)}.zip`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Export ZIP impossible.');
    } finally {
      setExporting(false);
      setExportProgress(null);
      exportCancel.current = false;
    }
  };

  const exportAll = async () => {
    if (exporting) return;
    setExporting(true);
    exportCancel.current = false;
    try {
      let before: { created_at: string; id: string } | null = null;
      const all: ArchiveBatchRow[] = [];
      setExportProgress({ done: 0, total: 0, file: 'parcours des carnets' });
      do {
        const res = await listArchiveBatches(before ? { limit: 40, before_created_at: before.created_at, before_id: before.id } : { limit: 40 });
        all.push(...res.batches);
        before = res.cursor;
        if (exportCancel.current) throw new Error('Export annulé.');
      } while (before);
      setExportProgress({ done: 0, total: all.length, file: `${all.length} carnets à exporter` });
      for (let i = 0; i < all.length; i += 1) {
        if (exportCancel.current) throw new Error('Export annulé.');
        setExportProgress({ done: i, total: all.length, file: all[i].batch_id.slice(0, 8) });
        await exportBatchZip(all[i].batch_id);
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      if (!(e instanceof Error && e.message === 'Export annulé.')) setErrorMessage(e instanceof Error ? e.message : 'Export global impossible.');
    } finally {
      setExporting(false);
      setExportProgress(null);
      exportCancel.current = false;
    }
  };

  const cancelExport = () => { exportCancel.current = true; };

  const filtered = useMemo(() => rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !r.batch_id.includes(q) && !r.session?.session_id?.includes(q) && !ownerName(r.owner_id, profiles).toLowerCase().includes(q) && !(r.session?.intention ?? '').toLowerCase().includes(q)) return false;
    if (statusFilter === 'received' && r.status !== 'created') return false;
    if (statusFilter === 'failed' && r.status !== 'failed' && r.status !== 'deleted') return false;
    if (statusFilter === 'partial' && !(r.status === 'uploading' || r.session?.details_on_device || (r.session && r.session.part < r.session.total))) return false;
    return true;
  }), [rows, search, statusFilter, profiles]);

  /* ── Detail view ── */
  if (detail) {
    return <CarnetDetailView
      detail={detail}
      profiles={profiles}
      onBack={() => setDetail(null)}
      onDownloadOne={downloadOne}
      onDownloadJson={downloadJson}
      onExportZip={exportBatchZip}
      exporting={exporting}
      exportProgress={exportProgress}
      onCancelExport={cancelExport}
      errorMessage={errorMessage}
      onErrorDismiss={() => setErrorMessage('')}
    />;
  }

  return (
    <div className="fc">
      <div className="fc-head">
        <div className="fc-head-title">
          <Smartphone size={20} />
          <div>
            <h3>Carnets de terrain</h3>
            <p>Données réellement reçues de l'application Le Carnet CELEC. Aucune publication automatique.</p>
          </div>
        </div>
        <div className="fc-head-actions">
          <button className="adm-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Actualiser</button>
          <button className="adm-btn" onClick={() => void exportAll()} disabled={exporting}><Download size={14} /> Tout exporter</button>
        </div>
      </div>
      {lastLoaded && <p className="fc-lastload">Dernier chargement réussi : {lastLoaded.toLocaleTimeString('fr-FR')}</p>}

      {exporting && exportProgress && (
        <div className="fc-export">
          <Activity size={14} />
          <span>Export {exportProgress.done}/{exportProgress.total || '?'} — {exportProgress.file}</span>
          <button onClick={cancelExport}><X size={13} /> Annuler</button>
        </div>
      )}

      {loading && <p className="adm-msg">Connexion à la base des carnets...</p>}

      {!loading && accessError && (
        <div className={`fc-empty fc-empty--${accessError}`}>
          {accessError === 'signin_required' && <><ShieldAlert size={40} /><h4>Connexion requise</h4><p>Reconnectez-vous au site pour consulter les carnets de terrain.</p></>}
          {accessError === 'forbidden' && <><ShieldAlert size={40} /><h4>Accès refusé</h4><p>Cette consultation est réservée aux administrateurs.</p></>}
          {accessError === 'not_deployed' && <><FileWarning size={40} /><h4>Service non déployé</h4><p>La fonction d'archive n'est pas joignable. Redeployez « carnet-archive ».</p></>}
          {accessError === 'network' && <><WifiOff size={40} /><h4>Réseau indisponible</h4><p>Vérifiez votre connexion puis réessayez.</p></>}
          {accessError === 'read_error' && <><FileWarning size={40} /><h4>Erreur de lecture</h4><p>{errorMessage || 'La base n\'a pas répondu correctement.'}</p></>}
          {accessError === 'not_configured' && <><FileWarning size={40} /><h4>Base non reliée</h4><p>Le site n'est pas connecté à Supabase.</p></>}
          <button className="adm-btn" onClick={() => void load()}><RefreshCw size={14} /> Réessayer</button>
        </div>
      )}

      {!loading && !accessError && (
        <>
          <div className="fc-filters">
            <div className="adm-search"><Search size={15} />
              <input placeholder="Rechercher (lot, session, auteur, intention)..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="fc-status-filters">
              {([['all', 'Tous'], ['received', 'Reçus'], ['partial', 'Partiels'], ['failed', 'Échecs']] as const).map(([key, label]) => (
                <button key={key} className={statusFilter === key ? 'is-on' : ''} onClick={() => setStatusFilter(key)}>{label}</button>
              ))}
            </div>
          </div>

          {filtered.length === 0 && (
            <div className="fc-empty">
              <Smartphone size={40} />
              <h4>Aucun carnet reçu</h4>
              <p>Aucune donnée de terrain n'est encore arrivée dans la base pour ce filtre.</p>
            </div>
          )}

          <div className="fc-list">
            {filtered.map((r) => {
              const st = ctxStatusLabel(r);
              return (
                <button key={r.batch_id} className="fc-row" onClick={() => void openDetail(r.batch_id)}>
                  <div className="fc-row-main">
                    <span className="fc-row-title">
                      {r.session?.session_id ? r.session.session_id.slice(0, 8) : 'Lot historique'}
                      <small> · lot {r.batch_id.slice(0, 8)}</small>
                    </span>
                    <span className="fc-row-meta">
                      <Calendar size={12} /> {fmtUtcLocal(r.created_at)} · {ownerName(r.owner_id, profiles)}
                    </span>
                  </div>
                  <div className="fc-row-counts">
                    <span title="photos"><ImageIcon size={13} /> {r.photos}</span>
                    <span title="vidéos"><Video size={13} /> {r.videos}</span>
                    <span title="vocaux/meetings"><Mic size={13} /> {r.audios}</span>
                    <span className="fc-row-size">{fmtBytes(r.expected_bytes)}</span>
                  </div>
                  {r.session?.intention && <span className="fc-tag">{r.session.intention}</span>}
                  {r.session && r.session.part < r.session.total && <span className="fc-tag fc-tag--warn">partie {r.session.part}/{r.session.total}</span>}
                  {r.session?.details_on_device && <span className="fc-tag fc-tag--warn">détails sur téléphone</span>}
                  <span className={`fc-status fc-status--${st.tone}`}>{st.label}</span>
                  <ChevronRight size={16} className="fc-row-chevron" />
                </button>
              );
            })}
          </div>

          {cursor && !loadingMore && (
            <button className="adm-btn fc-more" onClick={() => void loadMore()}>Charger plus</button>
          )}
          {loadingMore && <p className="adm-msg">Chargement...</p>}
        </>
      )}
    </div>
  );
}

/* ── Detail ── */

interface DetailProps {
  detail: ArchiveBatchDetail;
  profiles: Profile[];
  onBack: () => void;
  onDownloadOne: (m: ArchiveMediaRow) => void;
  onDownloadJson: (batchId: string) => void;
  onExportZip: (batchId: string) => void;
  exporting: boolean;
  exportProgress: { done: number; total: number; file: string } | null;
  onCancelExport: () => void;
  errorMessage: string;
  onErrorDismiss: () => void;
}

function CarnetDetailView({ detail, profiles, onBack, onDownloadOne, onDownloadJson, onExportZip, exporting, exportProgress, onCancelExport, errorMessage, onErrorDismiss }: DetailProps) {
  const [techOpen, setTechOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState<{ m: ArchiveMediaRow; url: string } | null>(null);
  const [playingMark, setPlayingMark] = useState<{ audioUrl: string; from: number; to: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { batch, media, session } = detail as ArchiveBatchDetail & { session?: ArchiveSessionCtx | null };
  const ctx: ArchiveSessionCtx | null = session ?? null;
  const captures = ctx?.captures ?? [];
  const passages = ctx?.passages ?? [];
  const st = ctxStatusLabel({ status: batch.status, stage: batch.stage, session: ctx, total: media.length, photos: media.filter((m) => m.type === 'image').length });
  const capture = (m: ArchiveMediaRow) => captures.find((c) => c.item_id === m.item_id);
  const labelOf = (m: ArchiveMediaRow) => capture(m)?.label || null;
  const createdAtOf = (m: ArchiveMediaRow): number | null => capture(m)?.created_at ?? null;

  const openPreview = async (m: ArchiveMediaRow) => {
    try {
      const { url } = await getArchiveFileUrl(m.item_id);
      setPreviewItem({ m, url });
    } catch (e) { window.alert(e instanceof Error ? e.message : 'Aperçu indisponible.'); }
  };

  const playMark = async (passage: { media_id: string; from_ms: number; to_ms: number }) => {
    const m = media.find((x) => x.item_id === passage.media_id);
    if (!m) { window.alert('Le segment audio de ce repère n\'a pas (encore) été reçu.'); return; }
    try {
      const { url } = await getArchiveFileUrl(m.item_id);
      setPlayingMark({ audioUrl: url, from: passage.from_ms, to: passage.to_ms });
      window.setTimeout(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = passage.from_ms / 1000;
        void audio.play();
        audio.ontimeupdate = () => { if (audio.currentTime * 1000 >= passage.to_ms) { audio.pause(); audio.ontimeupdate = null; } };
      }, 250);
    } catch (e) { window.alert(e instanceof Error ? e.message : 'Lecture impossible.'); }
  };

  const closePreview = () => { setPreviewItem(null); if (audioRef.current) audioRef.current.pause(); };

  return (
    <div className="fc fc-detail">
      <button className="adm-back" onClick={onBack}><ArrowLeft size={14} /> Retour à la liste</button>
      <div className="fc-head">
        <div className="fc-head-title">
          {session ? <><Smartphone size={20} /><div><h3>Session {session.session_id.slice(0, 8)}</h3><p>Lot {batch.batch_id}</p></div></>
            : <><ArchiveBatchIcon /><div><h3>Lot historique {batch.batch_id.slice(0, 8)}</h3><p>Format v1 sans session structurée</p></div></>}
        </div>
        <div className="fc-head-actions">
          <button className="adm-btn" onClick={() => onDownloadJson(batch.batch_id)}><FileText size={14} /> Données JSON</button>
          <button className="adm-btn" onClick={() => onExportZip(batch.batch_id)} disabled={exporting}><Download size={14} /> Carnet complet (ZIP)</button>
        </div>
      </div>
      {exporting && exportProgress && (
        <div className="fc-export"><Activity size={14} /><span>Export {exportProgress.done}/{exportProgress.total || '?'} — {exportProgress.file}</span><button onClick={onCancelExport}><X size={13} /> Annuler</button></div>
      )}
      {errorMessage && <div className="adm-msg adm-err fc-err">{errorMessage}<button onClick={onErrorDismiss}><X size={13} /></button></div>}

      <div className="fc-meta">
        <span className={`fc-status fc-status--${st.tone}`}>{st.label}</span>
        <span><Calendar size={12} /> Reçu : {fmtUtcLocal(batch.created_at)}</span>
        <span>· Auteur : {ownerName(batch.owner_id, profiles)}</span>
        {ctx?.intention && <span className="fc-tag">{ctx.intention}</span>}
        {ctx && ctx.part < ctx.total && <span className="fc-tag fc-tag--warn">partie {ctx.part}/{ctx.total} — d'autres lots de cette session ne sont pas encore reçus</span>}
        {ctx?.details_on_device && <span className="fc-tag fc-tag--warn">Métadonnées partielles reçues : libellés/repères complets restés sur le téléphone</span>}
        <span>· Volume reçu : {fmtBytes(batch.expected_bytes)}</span>
      </div>

      {passages.length > 0 && (
        <div className="fc-section">
          <h4><MapPin size={14} /> Repères ({passages.length}) — plages dans le bon segment audio</h4>
          {passages.map((p, i) => (
            <div key={i} className="fc-passage">
              <span className="fc-passage-range">{fmtMs(p.from_ms)} → {fmtMs(p.to_ms)}</span>
              {p.label && <span className="fc-passage-label">{p.label}</span>}
              <button className="adm-btn fc-passage-play" onClick={() => void playMark(p)}><Play size={13} /> Écouter</button>
              <small>{p.media_id.slice(0, 8)}</small>
            </div>
          ))}
        </div>
      )}

      <div className="fc-section">
        <h4><Mic size={14} /> Historique dans l'ordre de capture</h4>
        {media.length === 0 && <p className="adm-msg">Aucun média reçu pour ce lot.</p>}
        <div className="fc-media-list">
          {media.map((m) => {
            const Icon = typeIcon(m.type);
            const label = labelOf(m);
            const created = createdAtOf(m);
            const role = capture(m)?.role ?? m.origin;
            return (
              <div key={m.item_id} className="fc-media">
                <span className="fc-media-ico"><Icon size={16} /></span>
                <div className="fc-media-main">
                  <span className="fc-media-name">
                    {label || m.filename}
                    <small> · position {m.position}{m.duration_ms ? ` · ${fmtMs(m.duration_ms)}` : ''}{role ? ` · ${role}` : ''}</small>
                  </span>
                  <span className="fc-media-meta">
                    {created ? <><Clock size={11} /> {fmtUtcLocal(created)}</> : 'date de capture non transmise'}
                    {m.transcript && ` · transcription reçue`}
                    {!m.verified && ' · vérification en attente'}
                    {m.needs_reupload && ' · renvoi demandé'}
                  </span>
                  {m.transcript && <p className="fc-media-transcript">{m.transcript}</p>}
                </div>
                <div className="fc-media-actions">
                  {(m.type === 'image' || m.type === 'video' || m.type === 'audio') && (
                    <button className="adm-btn" onClick={() => void openPreview(m)}><Play size={13} /> {m.type === 'image' ? 'Voir' : 'Écouter'}</button>
                  )}
                  <button className="adm-btn" onClick={() => onDownloadOne(m)}><Download size={13} /> Fichier</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="fc-section">
        <h4><ChevronDown size={14} className={techOpen ? 'is-open' : ''} style={{ cursor: 'pointer' }} onClick={() => setTechOpen((v) => !v)} /> Détails techniques</h4>
        {techOpen && (
          <div className="fc-tech">
            <div><span>Lot</span><code>{batch.batch_id}</code></div>
            <div><span>Session</span><code>{ctx?.session_id ?? '— (lot historique)'}</code></div>
            <div><span>Manifeste (hash)</span><code>{batch.manifest_hash ?? '—'}</code></div>
            <div><span>Billet créé</span><code>{batch.carnet_entry_id ?? 'pas encore (traitement en cours ou échec)'}</code></div>
            <div><span>Statut / étape</span><code>{batch.status} / {batch.stage}{batch.error_code ? ` / ${batch.error_code}` : ''}</code></div>
            <div><span>Octets attendus</span><code>{fmtBytes(batch.expected_bytes)}</code></div>
            <div className="fc-tech-text"><span>Manifeste brut (texte v1)</span><pre>{batch.manifest_text || '—'}</pre></div>
            {batch.voice_transcript && <div className="fc-tech-text"><span>Transcription agrégée</span><pre>{batch.voice_transcript}</pre></div>}
          </div>
        )}
      </div>

      {previewItem && (
        <div className="fc-modal" onClick={closePreview}>
          <div className="fc-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="fc-modal-head">
              <strong>{previewItem.m.filename}</strong>
              <button onClick={closePreview}><X size={16} /></button>
            </div>
            {previewItem.m.type === 'image' && <img src={previewItem.url} alt={previewItem.m.filename} />}
            {previewItem.m.type === 'video' && <video src={previewItem.url} controls autoPlay />}
            {previewItem.m.type === 'audio' && <audio src={previewItem.url} controls autoPlay ref={audioRef} />}
            <p className="fc-modal-meta">{previewItem.m.mime_type} · {fmtBytes(previewItem.m.byte_size)} · SHA-256 reçu : <code>{previewItem.m.sha256.slice(0, 16)}…</code></p>
          </div>
        </div>
      )}

      {playingMark && (
        <audio ref={audioRef} src={playingMark.audioUrl} style={{ display: 'none' }} />
      )}
    </div>
  );
}

function ArchiveBatchIcon() {
  return <CheckCircle2 size={20} className="fc-legacy-ico" />;
}

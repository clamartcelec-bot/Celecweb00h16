import { useCallback, useEffect, useState } from 'react';
import { Archive, ChevronDown, Clock, Download, FileJson, Loader2, Phone, RefreshCw, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildZip, downloadBlob } from '@/lib/zip';

interface ConversationRow {
  id: string;
  session_key: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_reason: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  request_id: string | null;
  summary: string | null;
  summary_status: 'pending' | 'done' | 'error';
  message_count: number;
}

type FullConversation = ConversationRow & {
  transcript: { role: string; text: string; at: string }[] | null;
  events: unknown[] | null;
  draft: unknown;
  last_activity_at: string;
};

const LIST_COLUMNS = 'id, session_key, started_at, ended_at, duration_seconds, ended_reason, client_name, client_phone, client_email, request_id, summary, summary_status, message_count';
const PAGE = 100;

const REASONS: Record<string, string> = {
  hung_up: 'Raccroché',
  time_limit: 'Durée maximale',
  page_closed: 'Page fermée',
  page_left: 'Concierge fermé',
  restarted: 'Relancé',
};

const fmtDateTime = (value: string) =>
  new Date(value).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtDuration = (seconds: number | null) => {
  if (!seconds) return '—';
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} min ${String(seconds % 60).padStart(2, '0')}` : `${seconds} s`;
};

function fileStem(row: ConversationRow) {
  const stamp = new Date(row.started_at).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const who = (row.client_name || row.client_phone || 'anonyme')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${stamp}_${who || 'anonyme'}_${row.session_key.slice(-6)}`;
}

function readableTranscript(row: FullConversation) {
  const lines = [
    `Conversation du ${fmtDateTime(row.started_at)}`,
    `Client : ${row.client_name || 'non précisé'} — ${row.client_phone || 'téléphone non précisé'}`,
    `Durée : ${fmtDuration(row.duration_seconds)}`,
    '',
    'RÉSUMÉ',
    row.summary || '(pas encore de résumé)',
    '',
    'ÉCHANGE COMPLET',
    ...(row.transcript ?? []).map((turn) => {
      const time = new Date(turn.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${time}] ${turn.role === 'user' ? 'Client' : 'Concierge'} : ${turn.text}`;
    }),
  ];
  return lines.join('\n');
}

async function fetchFull(ids?: string[]): Promise<FullConversation[]> {
  if (!supabase) throw new Error('Base de données indisponible.');
  const rows: FullConversation[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from('concierge_conversations').select('*').order('started_at', { ascending: false }).range(from, from + PAGE - 1);
    if (ids) query = query.in('id', ids);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as FullConversation[]));
    if (!data || data.length < PAGE) return rows;
  }
}

export function ConciergeArchive() {
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('concierge_conversations')
      .select(LIST_COLUMNS)
      .order('started_at', { ascending: false })
      .limit(200);
    if (loadError) setError(loadError.message);
    else setRows((data ?? []) as ConversationRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const downloadOne = async (row: ConversationRow) => {
    setBusy(row.id);
    setError('');
    try {
      const [full] = await fetchFull([row.id]);
      if (!full) throw new Error('Conversation introuvable.');
      downloadBlob(new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' }), `${fileStem(row)}.json`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Téléchargement impossible.');
    }
    setBusy(null);
  };

  const downloadAll = async () => {
    setBusy('all');
    setError('');
    try {
      const all = await fetchFull();
      if (!all.length) throw new Error('Aucune conversation à exporter.');
      const files = all.flatMap((row) => [
        { name: `conversations/${fileStem(row)}.json`, content: JSON.stringify(row, null, 2) },
        { name: `lisible/${fileStem(row)}.txt`, content: readableTranscript(row) },
      ]);
      const index = all.map((row) => ({
        date: row.started_at,
        nom: row.client_name,
        telephone: row.client_phone,
        email: row.client_email,
        duree_secondes: row.duration_seconds,
        messages: row.message_count,
        demande_transmise: Boolean(row.request_id),
        resume: row.summary,
        fichier: `conversations/${fileStem(row)}.json`,
      }));
      files.unshift({ name: 'index.json', content: JSON.stringify(index, null, 2) });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(buildZip(files), `celec-conversations-${stamp}.zip`);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'Export impossible.');
    }
    setBusy(null);
  };

  const regenerate = async (row: ConversationRow) => {
    if (!supabase) return;
    setBusy(`sum-${row.id}`);
    setError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Session administrateur expirée.');
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/concierge-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'summarize', id: row.id }),
      });
      const result = await response.json().catch(() => ({})) as { summary?: string; error?: string };
      if (!response.ok || typeof result.summary !== 'string') throw new Error(result.error || 'Le résumé n’a pas pu être généré.');
      setRows((current) => current.map((item) => item.id === row.id ? { ...item, summary: result.summary ?? null, summary_status: 'done' } : item));
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : 'Le résumé n’a pas pu être généré.');
    }
    setBusy(null);
  };

  return (
    <section className="cva">
      <div className="ai-settings-head">
        <Archive size={18} />
        <div>
          <h3>Conversations du concierge</h3>
          <p className="ai-settings-sub">
            Chaque échange est archivé en entier, avec son résumé. Export complet : un fichier par conversation, une version lisible et un index.
          </p>
        </div>
      </div>

      <div className="cva-toolbar">
        <span className="cva-count">{loading ? 'Chargement…' : `${rows.length} conversation${rows.length > 1 ? 's' : ''}`}</span>
        <button className="cva-btn" onClick={() => void load()} disabled={loading} aria-label="Actualiser">
          <RefreshCw size={14} className={loading ? 'cva-spin' : ''} />
        </button>
        <button className="btn-pink cva-zip" onClick={() => void downloadAll()} disabled={busy === 'all' || !rows.length}>
          {busy === 'all' ? <Loader2 size={15} className="cva-spin" /> : <Download size={15} />}
          Tout télécharger (.zip)
        </button>
      </div>

      {error && <p className="cva-error">{error}</p>}

      {!loading && !rows.length && (
        <p className="cva-empty">Aucune conversation pour l’instant. Elles apparaîtront ici dès le premier échange avec le concierge.</p>
      )}

      <ul className="cva-list">
        {rows.map((row) => {
          const open = openId === row.id;
          return (
            <li key={row.id} className={`cva-item ${open ? 'cva-item--open' : ''}`}>
              <button className="cva-row" onClick={() => setOpenId(open ? null : row.id)} aria-expanded={open}>
                <span className="cva-when">{fmtDateTime(row.started_at)}</span>
                <span className="cva-who"><User size={13} />{row.client_name || 'Anonyme'}</span>
                <span className="cva-who"><Phone size={13} />{row.client_phone || '—'}</span>
                <span className="cva-dur"><Clock size={13} />{fmtDuration(row.duration_seconds)}</span>
                {row.request_id && <span className="cva-badge">Demande transmise</span>}
                {!row.ended_at && <span className="cva-badge cva-badge--live">En cours</span>}
                <ChevronDown size={15} className={`cva-chev ${open ? 'cva-chev--up' : ''}`} />
              </button>
              {open && (
                <div className="cva-detail">
                  <p className="cva-meta">
                    {row.message_count} message{row.message_count > 1 ? 's' : ''}
                    {row.ended_reason && ` · ${REASONS[row.ended_reason] ?? row.ended_reason}`}
                    {row.client_email && ` · ${row.client_email}`}
                  </p>
                  <pre className="cva-summary">
                    {row.summary || (row.summary_status === 'error' ? 'Le résumé a échoué.' : row.ended_at ? 'Résumé en préparation…' : 'Le résumé sera généré à la fin de la conversation.')}
                  </pre>
                  <div className="cva-actions">
                    <button className="cva-btn cva-btn--text" onClick={() => void downloadOne(row)} disabled={busy === row.id}>
                      <FileJson size={14} /> JSON complet
                    </button>
                    <button className="cva-btn cva-btn--text" onClick={() => void regenerate(row)} disabled={busy === `sum-${row.id}`}>
                      {busy === `sum-${row.id}` ? <Loader2 size={14} className="cva-spin" /> : <RefreshCw size={14} />}
                      {row.summary ? 'Régénérer le résumé' : 'Générer le résumé'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

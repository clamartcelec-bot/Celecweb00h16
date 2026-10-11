import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Partner, Photo } from '@/site/types';
import { loadCompanyFacts, type CompanyFact } from '@/concierge/services/companyFacts';
import { openRealtimeLink, type MicError, type RealtimeEvent, type RealtimeLink } from './realtimeLink';
import { buildSiteContext, describePage, runTool, type Guide, type RequestDraft, type Stage } from './conciergeTools';

export type ConciergeAction =
  | { type: 'navigate'; view: string; family?: string }
  | { type: 'filter_carnet'; topic: string }
  | { type: 'show_entries'; ids: string[] }
  | { type: 'show_partner'; id: string }
  | { type: 'prefill_contact'; category: 'depannage' | 'chantier' | 'projet'; first_name: string; phone: string; commune: string; description: string };

export interface ConciergeTurn { id?: string; role: 'user' | 'assistant'; text: string; at: string; actions?: ConciergeAction[] }
export type ConciergePhase = 'ready' | 'connecting' | 'listening' | 'thinking' | 'speaking';
export interface ConciergeContext { page: string; family?: string; topic?: string | null }

interface Options {
  photos: Photo[];
  partners: Partner[];
  userEmail: string | null;
  context: () => ConciergeContext;
  onActions: (actions: ConciergeAction[]) => void;
}

const STORE_KEY = 'celec-concierge-session';
const MUTED_KEY = 'celec-concierge-muted';
const RETENTION_MS = 90 * 86_400_000;
const IDLE_CLOSE_MS = 4 * 60_000;
const MIC_RELEASE_MS = 45_000;
const MIN_TALK_MS = 450;
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/concierge-turn`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const MIC_ERRORS: Record<MicError, string> = {
  denied: 'Le micro est bloqué. Autorisez-le dans votre navigateur, ou écrivez-moi.',
  unsupported: 'Votre navigateur ne permet pas la voix. Vous pouvez m’écrire.',
  'no-device': 'Aucun micro détecté. Vous pouvez m’écrire.',
  failed: 'Le micro n’a pas démarré. Réessayez ou écrivez-moi.',
};

interface Session { key: string; token: string; created: number }

function randomHex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function newSession(): Session {
  const s = { key: `g-${randomHex(12)}`, token: randomHex(24), created: Date.now() };
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode: session lives in memory */ }
  return s;
}

function readSession(): Session {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as Session | null;
    if (s?.key && s.token && Date.now() - s.created < RETENTION_MS) return s;
  } catch { /* corrupted value */ }
  return newSession();
}

async function blobToBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function bearer() {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  return data.session?.access_token ?? ANON;
}

const systemItem = (text: string) => ({
  type: 'conversation.item.create',
  item: { type: 'message', role: 'system', content: [{ type: 'input_text', text }] },
});

export function useConcierge({ photos, partners, userEmail, context, onActions }: Options) {
  const session = useRef<Session>(readSession());
  const [turns, setTurns] = useState<ConciergeTurn[]>([]);
  const [phase, setPhaseState] = useState<ConciergePhase>('ready');
  const [caption, setCaption] = useState<{ role: 'user' | 'assistant'; text: string } | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [draft, setDraft] = useState<RequestDraft>({});
  const [appointment, setAppointmentState] = useState(false);
  const [guide, setGuide] = useState<Guide | null>(null);
  const lastSearch = useRef('');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMutedState] = useState(() => { try { return localStorage.getItem(MUTED_KEY) === '1'; } catch { return false; } });

  const latest = useRef({ photos, partners, userEmail, context, onActions, turns, draft, muted });
  latest.current = { photos, partners, userEmail, context, onActions, turns, draft, muted };

  const link = useRef<RealtimeLink | null>(null);
  const connecting = useRef<Promise<RealtimeLink | null> | null>(null);
  const facts = useRef<CompanyFact[]>([]);
  const phaseRef = useRef<ConciergePhase>('ready');
  const talking = useRef<{ started: number; open: boolean } | null>(null);
  const speaking = useRef(false);
  const responding = useRef(false);
  const liveText = useRef('');
  const pendingActions = useRef<ConciergeAction[]>([]);
  const lastPage = useRef('');
  const idleTimer = useRef<number>();
  const micTimer = useRef<number>();
  const userId = useRef<string | null | undefined>(undefined);
  const handleEvent = useRef<(e: RealtimeEvent) => void>(() => {});

  const setPhase = useCallback((p: ConciergePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const call = useCallback(async (payload: Record<string, unknown>, retried = false): Promise<Record<string, unknown>> => {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${await bearer()}` },
        body: JSON.stringify({ ...payload, session_key: session.current.key, token: session.current.token }),
      });
    } catch {
      throw new Error('network');
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 409 && !retried) {
      session.current = newSession();
      return call(payload, true);
    }
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'failed');
    return body;
  }, []);

  const persist = useCallback((turn: ConciergeTurn) => {
    if (!turn.text.trim()) return;
    void call({ action: 'append', page: latest.current.context().page, turns: [{ role: turn.role, text: turn.text, actions: turn.actions }] }).catch(() => {});
  }, [call]);

  const load = useCallback(async () => {
    try {
      const body = await call({ action: 'load' });
      setTurns(Array.isArray(body.turns) ? (body.turns as ConciergeTurn[]) : []);
    } catch { /* history is optional */ }
  }, [call]);

  const closeLink = useCallback(() => {
    link.current?.close();
    link.current = null;
    connecting.current = null;
    talking.current = null;
    speaking.current = false;
    responding.current = false;
    window.clearTimeout(idleTimer.current);
    window.clearTimeout(micTimer.current);
    if (phaseRef.current !== 'ready') setPhase('ready');
  }, [setPhase]);

  const touch = useCallback(() => {
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(closeLink, IDLE_CLOSE_MS);
  }, [closeLink]);

  const connect = useCallback(async () => {
    if (link.current) return link.current;
    if (connecting.current) return connecting.current;
    connecting.current = (async () => {
      try {
        if (!facts.current.length) void loadCompanyFacts().then((f) => { facts.current = f; });
        const l = await openRealtimeLink((e) => handleEvent.current(e), () => {
          if (link.current === l) closeLink();
        }, latest.current.muted);
        const { context: ctx, photos: ph, partners: pa, turns: tu } = latest.current;
        l.send(systemItem(buildSiteContext(ctx(), ph, pa, tu)));
        lastPage.current = describePage(ctx());
        link.current = l;
        touch();
        return l;
      } catch {
        setError('Je n’arrive pas à me connecter. Vérifiez votre réseau, ou écrivez-nous via le formulaire.');
        return null;
      } finally {
        connecting.current = null;
      }
    })();
    return connecting.current;
  }, [closeLink, touch]);

  const syncPage = useCallback((l: RealtimeLink) => {
    const page = describePage(latest.current.context());
    if (page !== lastPage.current) {
      lastPage.current = page;
      l.send(systemItem(`Le visiteur est maintenant sur ${page}.`));
    }
  }, []);

  const interrupt = useCallback((l: RealtimeLink) => {
    if (responding.current) l.send({ type: 'response.cancel' });
    if (speaking.current) l.send({ type: 'output_audio_buffer.clear' });
    speaking.current = false;
  }, []);

  const finishAssistant = useCallback(() => {
    const text = liveText.current.trim();
    liveText.current = '';
    const actions = pendingActions.current;
    if (!text && !actions.length) return;
    pendingActions.current = [];
    const turn: ConciergeTurn = { role: 'assistant', text: text || 'Voici.', at: new Date().toISOString(), actions: actions.length ? actions : undefined };
    setTurns((t) => [...t, turn]);
    persist(turn);
  }, [persist]);

  const respondToTools = useCallback(async (calls: { name: string; call_id: string; arguments: string }[]) => {
    const l = link.current;
    if (!l) return;
    const env = {
      ...latest.current,
      facts: facts.current,
      show: (s: Stage) => setStage(s),
      act: (a: ConciergeAction) => {
        if (a.type === 'show_entries' || a.type === 'show_partner') pendingActions.current.push(a);
        else latest.current.onActions([a]);
      },
      patchDraft: (p: Partial<RequestDraft>) => setDraft((d) => {
        const next = { ...d, ...p };
        latest.current.draft = next;
        return next;
      }),
      setAppointment: (on: boolean) => setAppointmentState(on),
      onChatPage: latest.current.context().page === 'concierge',
      lastSearch,
      guide: (step: Omit<Guide, 'id'>) => {
        setStage((s) => (s?.kind === 'request' ? s : null));
        setGuide({ ...step, id: Date.now() });
      },
    };
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(c.arguments || '{}') as Record<string, unknown>; } catch { /* empty args */ }
      const output = await runTool(c.name, args, env);
      l.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: c.call_id, output: JSON.stringify(output) } });
    }
    syncPage(l);
    l.send({ type: 'response.create' });
  }, [syncPage]);

  handleEvent.current = (e: RealtimeEvent) => {
    touch();
    switch (e.type) {
      case 'input_audio_buffer.committed':
        setTurns((t) => [...t, { id: String(e.item_id), role: 'user', text: '', at: new Date().toISOString() }]);
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const text = String(e.transcript ?? '').trim();
        const id = String(e.item_id);
        setTurns((t) => t.map((x) => (x.id === id ? { ...x, text: text || '…' } : x)));
        if (text) {
          persist({ role: 'user', text, at: new Date().toISOString() });
          if (!liveText.current) setCaption({ role: 'user', text });
        }
        break;
      }
      case 'conversation.item.input_audio_transcription.failed':
        setTurns((t) => t.map((x) => (x.id === String(e.item_id) ? { ...x, text: '…' } : x)));
        break;
      case 'response.created':
        responding.current = true;
        if (!speaking.current) setPhase('thinking');
        break;
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
      case 'response.output_text.delta':
      case 'response.text.delta':
        liveText.current += String(e.delta ?? '');
        setCaption({ role: 'assistant', text: liveText.current });
        break;
      case 'output_audio_buffer.started':
        speaking.current = true;
        if (!talking.current) setPhase('speaking');
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        speaking.current = false;
        if (!talking.current && !responding.current) setPhase('ready');
        break;
      case 'response.done': {
        responding.current = false;
        const response = (e.response ?? {}) as { output?: { type: string; name?: string; call_id?: string; arguments?: string }[] };
        const calls = (response.output ?? []).filter((o) => o.type === 'function_call' && o.name && o.call_id) as { name: string; call_id: string; arguments: string }[];
        if (calls.length) {
          void respondToTools(calls);
          break;
        }
        finishAssistant();
        if (!speaking.current && !talking.current) setPhase('ready');
        break;
      }
      case 'error': {
        const err = (e.error ?? {}) as { code?: string; message?: string };
        if (err.code === 'response_cancel_not_active' || err.code === 'conversation_already_has_active_response') break;
        if (err.code === 'input_audio_buffer_commit_empty') setError('Je n’ai rien entendu. Restez appuyé en parlant.');
        else setError('Petit souci de mon côté. Réessayez dans un instant.');
        if (!speaking.current) setPhase('ready');
        break;
      }
    }
  };

  const startTalking = useCallback(async () => {
    setError(null);
    talking.current = { started: Date.now(), open: false };
    setPhase('connecting');
    const l = await connect();
    if (!l || !talking.current) {
      if (!talking.current) return;
      talking.current = null;
      setPhase('ready');
      return;
    }
    const micErr = await l.attachMic();
    if (micErr) {
      talking.current = null;
      setError(MIC_ERRORS[micErr]);
      setPhase('ready');
      return;
    }
    if (!talking.current) return;
    window.clearTimeout(micTimer.current);
    interrupt(l);
    l.send({ type: 'input_audio_buffer.clear' });
    l.setMicOpen(true);
    talking.current = { started: Date.now(), open: true };
    liveText.current = '';
    setCaption(null);
    setStage((s) => (s?.kind === 'request' ? s : null));
    setPhase('listening');
  }, [connect, interrupt, setPhase]);

  const stopTalking = useCallback((send = true) => {
    const t = talking.current;
    talking.current = null;
    const l = link.current;
    if (!t) return;
    if (!t.open || !l) {
      setPhase('ready');
      return;
    }
    l.setMicOpen(false);
    window.clearTimeout(micTimer.current);
    micTimer.current = window.setTimeout(() => link.current?.releaseMic(), MIC_RELEASE_MS);
    if (!send || Date.now() - t.started < MIN_TALK_MS) {
      l.send({ type: 'input_audio_buffer.clear' });
      if (send) setError('C’était un peu court : restez appuyé pendant que vous parlez.');
      setPhase('ready');
      return;
    }
    syncPage(l);
    l.send({ type: 'input_audio_buffer.commit' });
    l.send({ type: 'response.create' });
    setPhase('thinking');
  }, [setPhase, syncPage]);

  const sendText = useCallback(async (raw: string) => {
    const text = raw.trim().slice(0, 1200);
    if (!text) return;
    setError(null);
    const turn: ConciergeTurn = { role: 'user', text, at: new Date().toISOString() };
    setTurns((t) => [...t, turn]);
    persist(turn);
    setCaption({ role: 'user', text });
    setPhase('thinking');
    const l = await connect();
    if (!l) {
      setPhase('ready');
      return;
    }
    interrupt(l);
    liveText.current = '';
    syncPage(l);
    l.send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
    l.send({ type: 'response.create' });
  }, [connect, interrupt, persist, setPhase, syncPage]);

  const stopSpeaking = useCallback(() => {
    if (link.current) interrupt(link.current);
    finishAssistant();
    setPhase('ready');
  }, [finishAssistant, interrupt, setPhase]);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    link.current?.setMuted(value);
    try { localStorage.setItem(MUTED_KEY, value ? '1' : '0'); } catch { /* ignore */ }
  }, []);

  const restart = useCallback(async (mode: 'reset' | 'delete') => {
    closeLink();
    try {
      await call({ action: mode });
    } catch {
      setError('Impossible de joindre le serveur pour le moment. Réessayez.');
      return false;
    }
    session.current = newSession();
    setTurns([]);
    setCaption(null);
    setStage(null);
    setDraft({});
    setAppointmentState(false);
    setError(null);
    return true;
  }, [call, closeLink]);

  const transcribe = useCallback(async (blob: Blob, mime: string) => {
    const body = await call({ action: 'transcribe', audio_base64: await blobToBase64(blob), audio_mime: mime });
    return typeof body.transcript === 'string' ? body.transcript : '';
  }, [call]);

  useEffect(() => {
    if (!supabase) { void load(); return; }
    const client = supabase;
    void client.auth.getSession().then(({ data }) => {
      userId.current = data.session?.user.id ?? null;
      void load();
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
      const next = s?.user.id ?? null;
      const prev = userId.current;
      if (prev === undefined || prev === next) return;
      userId.current = next;
      (async () => {
        if (prev && !next) {
          closeLink();
          session.current = newSession();
          setTurns([]);
          setDraft({});
        }
        await load();
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, [load, closeLink]);

  useEffect(() => closeLink, [closeLink]);

  return {
    turns, phase, caption, stage, draft, appointment, error, muted, guide,
    guideDone: (id: number) => setGuide((g) => (g?.id === id ? null : g)),
    setError, setMuted, transcribe, sendText, startTalking, stopTalking, stopSpeaking,
    preconnect: () => { void connect(); },
    dismissStage: () => setStage(null),
    clearCaption: () => setCaption(null),
    endAppointment: () => {
      setAppointmentState(false);
      link.current?.send(systemItem('Le visiteur a quitté la prise de rendez-vous (end_appointment_flow déjà fait).'));
    },
    level: () => (phaseRef.current === 'listening' ? link.current?.inputLevel() ?? 0 : link.current?.outputLevel() ?? 0),
    newConversation: () => restart('reset'),
    clearHistory: () => restart('delete'),
  };
}

export type ConciergeApi = ReturnType<typeof useConcierge>;

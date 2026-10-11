import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ConciergeAction =
  | { type: 'navigate'; view: string; family?: string }
  | { type: 'filter_carnet'; topic: string }
  | { type: 'show_entries'; ids: string[] }
  | { type: 'show_partner'; id: string }
  | { type: 'prefill_contact'; category: 'depannage' | 'chantier' | 'projet'; first_name: string; phone: string; commune: string; description: string };

export interface ConciergeTurn { role: 'user' | 'assistant'; text: string; at: string; actions?: ConciergeAction[] }
export type ConciergePhase = 'ready' | 'recording' | 'thinking' | 'speaking';
export interface ConciergeContext { page: string; family?: string; topic?: string | null }

const STORE_KEY = 'celec-concierge-session';
const RETENTION_MS = 90 * 86_400_000;
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/concierge-turn`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const ERRORS: Record<string, string> = {
  empty_transcript: 'Je n’ai rien entendu. Restez appuyé un peu plus longtemps en parlant.',
  transcription_failed: 'Je n’ai pas réussi à comprendre l’enregistrement. Réessayez ou écrivez-moi.',
  rate_limited: 'Doucement ! Laissez-moi une petite minute avant la prochaine question.',
  too_large: 'Le message est trop long. Essayez en plus court.',
  ai_unavailable: 'L’assistant est momentanément indisponible. Vous pouvez nous écrire via le formulaire de contact.',
  ai_failed: 'Je n’ai pas pu répondre cette fois. Réessayez dans un instant.',
  network: 'Pas de connexion. Vérifiez votre réseau puis réessayez.',
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

export function useConcierge(onActions: (actions: ConciergeAction[]) => void) {
  const session = useRef<Session>(readSession());
  const [turns, setTurns] = useState<ConciergeTurn[]>([]);
  const [phase, setPhase] = useState<ConciergePhase>('ready');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [muted, setMutedState] = useState(() => { try { return localStorage.getItem('celec-concierge-muted') === '1'; } catch { return false; } });
  const [replay, setReplay] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const requestSeq = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const userId = useRef<string | null | undefined>(undefined);
  const actionsRef = useRef(onActions);
  actionsRef.current = onActions;

  const call = useCallback(async (payload: Record<string, unknown>, signal?: AbortSignal, retried = false): Promise<Record<string, unknown>> => {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${await bearer()}` },
        body: JSON.stringify({ ...payload, session_key: session.current.key, token: session.current.token }),
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new Error('network');
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 409 && !retried) {
      session.current = newSession();
      return call(payload, signal, true);
    }
    if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'ai_failed');
    return body;
  }, []);

  const stopAudio = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setPhase((p) => (p === 'speaking' ? 'ready' : p));
  }, []);

  const playAudio = useCallback((src: string) => {
    stopAudio();
    const el = new Audio(src);
    audio.current = el;
    el.onended = () => { if (audio.current === el) { audio.current = null; setPhase('ready'); } };
    setPhase('speaking');
    el.play().then(() => setReplay(null)).catch(() => {
      if (audio.current === el) audio.current = null;
      setReplay(src);
      setPhase('ready');
    });
  }, [stopAudio]);

  const load = useCallback(async () => {
    try {
      const body = await call({ action: 'load' });
      setTurns(Array.isArray(body.turns) ? (body.turns as ConciergeTurn[]) : []);
    } catch { /* history is optional: start empty */ }
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
          session.current = newSession();
          setTurns([]);
          setReplay(null);
        }
        await load();
      })();
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const send = useCallback(async (input: { text?: string; audio?: Blob; mime?: string }, context: ConciergeContext) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const seq = ++requestSeq.current;
    stopAudio();
    setError(null);
    setReplay(null);
    setPending(input.text?.trim() || '…');
    setPhase('thinking');
    try {
      const body = await call({
        action: 'turn',
        text: input.text?.trim() || undefined,
        audio_base64: input.audio ? await blobToBase64(input.audio) : undefined,
        audio_mime: input.mime,
        speak: !muted,
        context: { page: context.page, family: context.family ?? '', topic: context.topic ?? '' },
      }, ctrl.signal);
      if (seq !== requestSeq.current) return;
      const at = typeof body.at === 'string' ? body.at : new Date().toISOString();
      const reply = typeof body.reply === 'string' ? body.reply : '';
      const actions = Array.isArray(body.actions) ? (body.actions as ConciergeAction[]) : [];
      setTurns((t) => [...t, { role: 'user', text: String(body.transcript ?? input.text ?? ''), at }, { role: 'assistant', text: reply, at, actions }]);
      setPending(null);
      setPhase('ready');
      if (actions.length) actionsRef.current(actions);
      if (typeof body.audio_base64 === 'string' && body.audio_base64) playAudio(`data:audio/mpeg;base64,${body.audio_base64}`);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || seq !== requestSeq.current) return;
      setPending(null);
      setPhase('ready');
      setError(ERRORS[(err as Error).message] ?? 'Un souci est survenu. Réessayez dans un instant.');
    }
  }, [call, muted, playAudio, stopAudio]);

  const cancel = useCallback(() => {
    requestSeq.current++;
    controller.current?.abort();
    setPending(null);
    setPhase('ready');
  }, []);

  const restart = useCallback(async (mode: 'reset' | 'delete') => {
    cancel();
    stopAudio();
    try {
      await call({ action: mode });
    } catch {
      setError('Impossible de joindre le serveur pour le moment. Réessayez.');
      return false;
    }
    session.current = newSession();
    setTurns([]);
    setReplay(null);
    setError(null);
    return true;
  }, [call, cancel, stopAudio]);

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    try { localStorage.setItem('celec-concierge-muted', value ? '1' : '0'); } catch { /* ignore */ }
    if (value) stopAudio();
  }, [stopAudio]);

  const transcribe = useCallback(async (blob: Blob, mime: string) => {
    const body = await call({ action: 'transcribe', audio_base64: await blobToBase64(blob), audio_mime: mime });
    return typeof body.transcript === 'string' ? body.transcript : '';
  }, [call]);

  return {
    turns, phase, transcribe, error, pending, muted, replay,
    setPhase, setError, send, cancel, setMuted, stopAudio,
    listen: () => replay && playAudio(replay),
    newConversation: () => restart('reset'),
    clearHistory: () => restart('delete'),
  };
}

export type ConciergeApi = ReturnType<typeof useConcierge>;

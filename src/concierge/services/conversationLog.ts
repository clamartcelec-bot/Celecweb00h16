import { supabase } from '@/lib/supabase';
import type { ConciergeDraft } from '../types';

interface LoggedTurn {
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

interface LoggedEvent {
  name: string;
  at: string;
  detail?: unknown;
}

export interface ConversationLog {
  addTurn: (role: LoggedTurn['role'], text: string) => void;
  addEvent: (name: string, detail?: unknown) => void;
  setDraft: (draft: ConciergeDraft) => void;
  setRequestId: (id: string | undefined) => void;
  end: (reason: string) => void;
}

const FLUSH_DELAY_MS = 4_000;

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function bearerToken(anonKey: string) {
  if (!supabase) return anonKey;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? anonKey;
  } catch {
    return anonKey;
  }
}

export function createConversationLog(sessionKey: string): ConversationLog | null {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const token = randomToken();
  const startedAt = Date.now();
  const transcript: LoggedTurn[] = [];
  const events: LoggedEvent[] = [];
  let draft: ConciergeDraft | null = null;
  let requestId: string | undefined;
  let ended = false;
  let timer: number | undefined;

  const send = async (final?: { reason: string }) => {
    const body = JSON.stringify({
      session_key: sessionKey,
      token,
      transcript,
      events,
      draft,
      client: draft ? {
        name: (draft.lastName.trim() || draft.firstName.trim()) || undefined,
        phone: draft.phone.trim() || undefined,
      } : {},
      request_id: requestId,
      ...(final && {
        ended: true,
        ended_reason: final.reason,
        duration_seconds: Math.round((Date.now() - startedAt) / 1000),
      }),
    });
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/concierge-log`, {
        method: 'POST',
        keepalive: body.length < 60_000,
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${await bearerToken(anonKey)}`,
        },
        body,
      });
      if (!response.ok) console.warn('Concierge log rejected:', response.status);
    } catch (error) {
      console.warn('Concierge log unavailable:', error);
    }
  };

  const schedule = () => {
    if (ended) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void send(), FLUSH_DELAY_MS);
  };

  const end = (reason: string) => {
    if (ended) return;
    ended = true;
    window.clearTimeout(timer);
    window.removeEventListener('pagehide', onPageHide);
    void send({ reason });
  };

  const onPageHide = () => end('page_closed');
  window.addEventListener('pagehide', onPageHide);

  return {
    addTurn: (role, text) => {
      const trimmed = text.trim();
      if (!trimmed || ended) return;
      transcript.push({ role, text: trimmed.slice(0, 4_000), at: new Date().toISOString() });
      schedule();
    },
    addEvent: (name, detail) => {
      if (ended) return;
      events.push({ name, at: new Date().toISOString(), detail });
      schedule();
    },
    setDraft: (next) => {
      draft = next;
      schedule();
    },
    setRequestId: (id) => {
      requestId = id;
      schedule();
    },
    end,
  };
}

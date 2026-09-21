import { findEntryForSession, type CarnetEntry } from './knowledge';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export async function markPresentedEntries(entryIds: string[], sessionId: string | null): Promise<void> {
  if (!entryIds.length || !sessionId || !SUPABASE_URL || !ANON_KEY) return;

  try {
    await fetch(`${SUPABASE_URL}/functions/v1/concierge-presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ entry_ids: entryIds, session_id: sessionId }),
    });
  } catch {
    /* presentation is best-effort: the conversation keeps working without it */
  }
}

export async function findPresentedEntry(sessionId: string): Promise<CarnetEntry | null> {
  return findEntryForSession(sessionId);
}

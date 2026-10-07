export interface TeamNotification {
  category: string;
  description: string;
  source: string;
  user_email?: string;
  guest_phone?: string;
  callback_requested?: boolean;
}

/** Sends a request to the team. Resolves with whether Telegram relayed it; throws on failure. */
export async function notifyTeam(payload: TeamNotification): Promise<{ telegram: boolean }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('missing_config');
  const res = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`status_${res.status}`);
  const data: unknown = await res.json().catch(() => null);
  return { telegram: typeof data === 'object' && data !== null && (data as { telegram?: unknown }).telegram === true };
}

import type { ConciergeDraft } from '../types';

export interface LeadSubmissionResult {
  success: boolean;
  telegram: boolean;
  requestId?: string;
}

function clean(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export async function submitConciergeLead(draft: ConciergeDraft): Promise<LeadSubmissionResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('La transmission CELEC n’est pas configurée.');
  }

  const firstName = clean(draft.firstName, 80);
  const phone = clean(draft.phone, 40);
  const summary = clean(draft.summary, 1_500);
  const phoneDigits = phone.replace(/\D/g, '');

  if (!firstName || phoneDigits.length < 8 || !draft.category || !summary) {
    throw new Error('Le prénom, un téléphone valide, la catégorie et le résumé sont nécessaires.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      category: draft.category === 'travaux' ? 'chantier' : draft.category,
      description: `Prénom : ${firstName}\nRésumé : ${summary}`,
      contact_preference: draft.callbackRequested ? 'callback' : 'phone',
      callback_requested: draft.callbackRequested,
      source: 'concierge',
      guest_phone: phone,
    }),
  });

  const result = await response.json().catch(() => ({})) as {
    success?: boolean;
    telegram?: boolean;
    request_id?: string;
    error?: string;
  };

  if (!response.ok || result.success !== true) {
    throw new Error(result.error || 'La transmission de la demande a échoué.');
  }

  return {
    success: true,
    telegram: result.telegram === true,
    requestId: result.request_id,
  };
}

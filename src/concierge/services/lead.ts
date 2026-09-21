import type { ConciergeDraft } from '../types';

export type LeadSource = 'concierge' | 'callback';

export interface LeadSubmissionResult {
  success: boolean;
  telegram: boolean;
  requestId?: string;
}

function clean(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

export function buildLeadDescription(draft: ConciergeDraft) {
  const name = clean(draft.lastName.trim() || draft.firstName, 80);
  const lines: string[] = [];
  if (name) lines.push(`Nom : ${name}`);
  if (draft.summary.trim()) lines.push(`Objet de l’appel : ${clean(draft.summary, 400)}`);

  const details: string[] = [];
  if (draft.siteType.trim()) details.push(`Type de site : ${clean(draft.siteType, 160)}`);
  if (draft.location.trim()) details.push(`Adresse : ${clean(draft.location, 240)}`);
  if (draft.category) details.push(`Catégorie : ${draft.category}`);
  if (draft.urgency) details.push(`Priorité : ${draft.urgency}`);
  if (draft.availability.trim()) details.push(`Disponibilités : ${clean(draft.availability, 240)}`);
  if (draft.callbackRequested) details.push('Rappel souhaité : oui');

  if (details.length) lines.push('', ...details);
  if (draft.attachments.length) {
    lines.push('', 'Pièces jointes :', ...draft.attachments.map((url) => `- ${url}`));
  }

  return lines.join('\n').slice(0, 1_500);
}

export async function submitConciergeLead(
  draft: ConciergeDraft,
  source: LeadSource = 'concierge',
): Promise<LeadSubmissionResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('La transmission CELEC n’est pas configurée.');
  }

  const name = clean(draft.lastName.trim() || draft.firstName, 80);
  const phone = clean(draft.phone, 40);
  const phoneDigits = phone.replace(/\D/g, '');

  if (!name || phoneDigits.length < 8) {
    throw new Error('Le nom et un numéro de téléphone valide sont nécessaires.');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/telegram-notify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({
      category: draft.category === 'travaux' ? 'chantier' : draft.category || 'question',
      description: buildLeadDescription(draft),
      contact_preference: draft.callbackRequested ? 'callback' : 'phone',
      callback_requested: draft.callbackRequested,
      source,
      guest_phone: phone,
      guest_name: name,
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

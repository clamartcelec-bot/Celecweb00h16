import { supabase } from '@/lib/supabase';
import { formatConciergeKnowledge, type ConciergeKnowledge } from './knowledge';
import type { ConciergeDraft } from '../types';

export interface ConciergeContext {
  firstName?: string;
  phone?: string;
  previousRequests?: string[];
  knowledge?: ConciergeKnowledge;
}

function compact(value: string, max = 320) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export async function loadConciergeContext(): Promise<ConciergeContext | null> {
  if (!supabase) return null;

  const { data: authData } = await supabase.auth.getSession();
  const session = authData.session;
  if (!session?.user) return null;

  const user = session.user;
  const [{ data: profile }, { data: requests }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('requests')
      .select('category, description, commune, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3),
  ]);

  const fullName = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
  const previousRequests = (requests || []).map((request) => {
    const parts = [request.category, request.commune, request.description, request.status]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
    return compact(parts.join(' — '));
  });

  return {
    firstName: fullName ? fullName.split(/\s+/)[0] : undefined,
    phone: typeof profile?.phone === 'string' ? profile.phone : undefined,
    previousRequests,
  };
}

export function formatConciergeContext(context: ConciergeContext | null, topic?: string) {
  const lines = ['CONTEXTE INTERNE POUR CET APPEL :'];

  if (topic) lines.push(`Le client a choisi le motif initial « ${compact(topic, 80)} ».`);
  if (context?.firstName) lines.push(`Prénom du client connecté : ${compact(context.firstName, 80)}.`);
  if (context?.phone) lines.push(`Téléphone déjà enregistré : ${compact(context.phone, 40)}. Demande simplement confirmation avant de l'utiliser.`);
  if (context?.previousRequests?.length) {
    lines.push('Contexte récent du client, à utiliser seulement s’il est pertinent :');
    context.previousRequests.forEach((request) => lines.push(`- ${request}`));
  }

  if (context?.knowledge) {
    lines.push('', formatConciergeKnowledge(context.knowledge));
  }

  lines.push(
    'Prends la parole en premier, sans attendre que le client parle, en deux ou trois phrases :',
    '- « Bonjour, je suis le concierge IA de CELEC. Que puis-je faire pour vous ? »',
    '- « Si vous avez besoin d’une prise de rendez-vous ou de renseignements sur notre société d’électricité, je suis là pour ça. »',
    'Termine en posant une question ouverte pour laisser le client enchaîner.',
  );
  return lines.join('\n');
}

export function formatConciergeResume(
  context: ConciergeContext | null,
  draft: ConciergeDraft,
  history: string[],
) {
  const name = draft.lastName.trim() || draft.firstName.trim();
  const lines = [
    'CONTEXTE INTERNE POUR LA REPRISE DE L’APPEL :',
    'Vous venez de raccrocher avec ce client. Il revient sur la même conversation : tu la reprends là où elle s’était arrêtée, sans redemander ce qui est déjà connu.',
  ];

  if (name) lines.push(`Nom du client : ${name}.`);
  if (draft.phone.trim()) lines.push(`Téléphone connu : ${draft.phone.trim()}.`);
  if (draft.location.trim()) lines.push(`Adresse connue : ${compact(draft.location, 200)}.`);
  if (draft.summary.trim()) lines.push(`Objet de l’appel : ${compact(draft.summary, 400)}.`);
  if (draft.attachments.length) lines.push(`Pièces jointes déjà ajoutées : ${draft.attachments.length}.`);

  if (history.length) {
    lines.push('', 'Échanges précédents, du plus ancien au plus récent :');
    history.slice(-12).forEach((line) => lines.push(`- ${compact(line, 300)}`));
  }

  if (context?.knowledge) {
    lines.push('', formatConciergeKnowledge(context.knowledge));
  }

  lines.push(
    'Reprends la parole en premier en une phrase chaleureuse qui montre que tu gardes le fil — par exemple : « Nous reprenons où nous en étions. »',
    'Ne redemande aucune information déjà présente ci-dessus et n’énumère pas l’historique au client.',
  );
  return lines.join('\n');
}

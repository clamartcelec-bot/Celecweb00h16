import { supabase } from '@/lib/supabase';

export interface ConciergeContext {
  firstName?: string;
  phone?: string;
  previousRequests?: string[];
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

  lines.push('Accueille maintenant le client en une phrase et demande comment tu peux l’aider.');
  return lines.join('\n');
}

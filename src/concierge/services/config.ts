import { supabase } from '@/lib/supabase';

export interface ConciergeSettings {
  id: number;
  enabled: boolean;
  greeting: string;
  tone: string;
  prompt: string;
  site_info: string;
  focus_message: string;
  max_cards: number;
  show_brand_cards: boolean;
  voice: string;
  updated_at?: string;
}

export const DEFAULT_CONCIERGE_SETTINGS: ConciergeSettings = {
  id: 1,
  enabled: true,
  greeting: 'Bonjour, vous êtes bien chez CELEC. Que puis-je faire pour vous ?',
  tone: '',
  prompt: '',
  site_info: '',
  focus_message:
    "Oui, bien sûr. Là je suis concentré sur votre rendez-vous et sur la transmission à l'équipe. On termine cela tranquillement, on raccroche, et je réponds ensuite à tout ce que vous voulez sur nos réalisations.",
  max_cards: 3,
  show_brand_cards: true,
  voice: 'coral',
};

export async function loadConciergeSettings(): Promise<ConciergeSettings> {
  if (!supabase) return DEFAULT_CONCIERGE_SETTINGS;

  const { data, error } = await supabase
    .from('concierge_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return DEFAULT_CONCIERGE_SETTINGS;

  return {
    ...DEFAULT_CONCIERGE_SETTINGS,
    ...data,
    focus_message: data.focus_message || DEFAULT_CONCIERGE_SETTINGS.focus_message,
  };
}

export async function saveConciergeSettings(settings: ConciergeSettings): Promise<void> {
  if (!supabase) throw new Error('Base de données indisponible.');

  const { error } = await supabase
    .from('concierge_settings')
    .update({
      enabled: settings.enabled,
      greeting: settings.greeting,
      tone: settings.tone,
      prompt: settings.prompt,
      site_info: settings.site_info,
      focus_message: settings.focus_message,
      max_cards: Number(settings.max_cards) || 3,
      show_brand_cards: settings.show_brand_cards,
      voice: settings.voice,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);

  if (error) throw new Error(error.message);
}
